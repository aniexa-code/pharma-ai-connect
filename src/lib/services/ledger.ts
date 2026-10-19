// Grand livre et gains des livreurs. Les écritures sont immuables : on n'écrit que des lignes nouvelles.
import type { Order, Prisma } from "@prisma/client";
import { countryInfo, formatMoney } from "../config";
import { db } from "../db";
import { ServiceError } from "../errors";
import { getSettings } from "../settings";
import { phoneSchema } from "../validation";

export const ACCOUNT_LABEL: Record<string, string> = {
  PLATFORM_SERVICE_FEE: "Frais de service",
  PLATFORM_DELIVERY_COMMISSION: "Commission sur livraisons",
  COURIER_EARNING: "Gains des livreurs",
  COURIER_PAYOUT: "Retraits des livreurs",
  PHARMACY_SALES: "Ventes des pharmacies",
};

/** Interdit toute modification ou suppression d'une écriture, au niveau de la base. Idempotent (lancé au déploiement). */
export async function installLedgerGuard() {
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Le grand livre est immuable : ajoutez une écriture de correction.'; END; $$ LANGUAGE plpgsql`);
  await db.$executeRawUnsafe(`CREATE OR REPLACE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_immutable()`);
}

/**
 * Écritures d'une commande remise : ventes de la pharmacie, frais de service, commission de livraison et gain du livreur.
 * Chaque écriture porte une clé unique : un second appel n'ajoute rien.
 */
export async function recordCompletion(o: Order) {
  if (o.status !== "DELIVERED" && o.status !== "COLLECTED") return;
  const rows: Prisma.LedgerEntryCreateManyInput[] = [];
  const base = { currency: o.currency, orderId: o.id, pharmacyId: o.pharmacyId };
  if (o.subtotal > 0) rows.push({ ...base, ref: `${o.id}:PHARMACY_SALES`, account: "PHARMACY_SALES", amount: o.subtotal, note: o.publicRef });
  if (o.serviceFee > 0) rows.push({ ...base, ref: `${o.id}:SERVICE_FEE`, account: "PLATFORM_SERVICE_FEE", amount: o.serviceFee, note: o.publicRef });
  if (o.courierId && o.deliveryFee > 0) {
    rows.push({ ...base, courierId: o.courierId, ref: `${o.id}:DELIVERY_COMMISSION`, account: "PLATFORM_DELIVERY_COMMISSION", amount: o.deliveryCommission, note: o.publicRef });
    rows.push({ ...base, courierId: o.courierId, ref: `${o.id}:COURIER_EARNING`, account: "COURIER_EARNING", amount: o.courierEarning, note: `Livraison ${o.publicRef}` });
  }
  if (rows.length) await db.ledgerEntry.createMany({ data: rows, skipDuplicates: true });
}

/** Solde disponible d'un livreur : gains moins retraits demandés (un retrait refusé est recrédité). */
export async function courierBalance(courierId: string) {
  const r = await db.ledgerEntry.aggregate({ where: { courierId, account: { in: ["COURIER_EARNING", "COURIER_PAYOUT"] } }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export async function courierEarnings(courierId: string, now = new Date()) {
  const day = new Date(now.getTime() - 86_400_000);
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const sum = async (since?: Date) =>
    (await db.ledgerEntry.aggregate({ where: { courierId, account: "COURIER_EARNING", ...(since ? { createdAt: { gte: since } } : {}) }, _sum: { amount: true }, _count: true }));
  const [d, w, all, balance, entries, payouts] = await Promise.all([
    sum(day),
    sum(week),
    sum(),
    courierBalance(courierId),
    db.ledgerEntry.findMany({ where: { courierId, account: { in: ["COURIER_EARNING", "COURIER_PAYOUT"] } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.payoutRequest.findMany({ where: { courierId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return {
    today: { amount: d._sum.amount ?? 0, count: d._count },
    week: { amount: w._sum.amount ?? 0, count: w._count },
    total: { amount: all._sum.amount ?? 0, count: all._count },
    balance,
    entries,
    payouts,
  };
}

/**
 * Demande de retrait : montant au moins égal au seuil des réglages et au plus égal au solde.
 * Le montant est réservé aussitôt (écriture négative), sous verrou, pour qu'un double envoi ne puisse pas dépasser le solde.
 */
export async function requestPayout(courierId: string, input: { amount: number; method: string; phone: string }, country?: string) {
  const { courier: rules } = await getSettings(country);
  const info = countryInfo(country);
  if (!info.payoutMethods.includes(input.method)) throw new ServiceError("INVALID", "Moyen de paiement non proposé.");
  const phone = phoneSchema.safeParse(input.phone);
  if (!phone.success) throw new ServiceError("INVALID", "Numéro de téléphone invalide.");
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount < rules.payoutMinimum)
    throw new ServiceError("INVALID", `Le retrait minimum est de ${formatMoney(rules.payoutMinimum, info.currency)}.`);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"payout:" + courierId}))`;
    const c = await tx.courier.findFirst({ where: { id: courierId, active: true, verificationStatus: "APPROVED" } });
    if (!c) throw new ServiceError("AUTH", "Compte livreur inactif.");
    if (await tx.payoutRequest.findFirst({ where: { courierId, status: "REQUESTED" } }))
      throw new ServiceError("PENDING", "Une demande de retrait est déjà en cours de traitement.");
    const bal = (await tx.ledgerEntry.aggregate({ where: { courierId, account: { in: ["COURIER_EARNING", "COURIER_PAYOUT"] } }, _sum: { amount: true } }))._sum.amount ?? 0;
    if (amount > bal) throw new ServiceError("INVALID", `Montant supérieur à votre solde (${formatMoney(bal, info.currency)}).`);
    const p = await tx.payoutRequest.create({ data: { courierId, amount, currency: info.currency, method: input.method, phone: phone.data } });
    await tx.ledgerEntry.create({ data: { ref: `${p.id}:PAYOUT`, account: "COURIER_PAYOUT", amount: -amount, currency: info.currency, courierId, payoutId: p.id, note: "Demande de retrait" } });
    return p;
  });
}

/**
 * Traitement d'une demande par l'administration. « Payé » exige la référence de la transaction Mobile Money :
 * rien n'est marqué payé sans preuve. Un refus recrédite le solde par une écriture inverse.
 */
export async function processPayout(adminId: string, payoutId: string, decision: "PAID" | "REJECTED", input: { providerRef?: string; note?: string }) {
  const providerRef = input.providerRef?.trim() || null;
  const note = input.note?.trim() || null;
  if (decision === "PAID" && !providerRef) throw new ServiceError("INVALID", "Indiquez la référence de la transaction Mobile Money.");
  if (decision === "REJECTED" && !note) throw new ServiceError("INVALID", "Expliquez le refus au livreur.");
  return db.$transaction(async (tx) => {
    const res = await tx.payoutRequest.updateMany({ where: { id: payoutId, status: "REQUESTED" }, data: { status: decision, providerRef, note, processedBy: adminId, processedAt: new Date() } });
    if (res.count !== 1) throw new ServiceError("STATE", "Cette demande a déjà été traitée.");
    const p = await tx.payoutRequest.findUniqueOrThrow({ where: { id: payoutId } });
    if (decision === "REJECTED")
      await tx.ledgerEntry.create({ data: { ref: `${p.id}:PAYOUT_REVERSAL`, account: "COURIER_PAYOUT", amount: p.amount, currency: p.currency, courierId: p.courierId, payoutId: p.id, note: "Retrait refusé : montant recrédité" } });
    await tx.auditLog.create({ data: { actorType: "ADMIN", actorId: adminId, action: decision === "PAID" ? "PAYOUT_PAID" : "PAYOUT_REJECTED", entity: `Payout:${p.id}`, after: { amount: p.amount, providerRef }, note } });
    return p;
  });
}

/** Totaux du grand livre par compte, sur une période. */
export async function ledgerTotals(since?: Date) {
  const rows = await db.ledgerEntry.groupBy({ by: ["account", "currency"], where: since ? { createdAt: { gte: since } } : {}, _sum: { amount: true }, _count: true });
  return rows.map((r) => ({ account: r.account, currency: r.currency, amount: r._sum.amount ?? 0, count: r._count }));
}
