// Abonnements des pharmacies : essai gratuit, forfait ou commission, factures, suspension pour impayé.
// Tous les montants et délais viennent des réglages ; une facture n'est payée que sur preuve de paiement.
import type { Invoice, Subscription, SubscriptionStatus } from "@prisma/client";
import { countryInfo, formatMoney } from "../config";
import { db } from "../db";
import { ServiceError } from "../errors";
import { getSettings } from "../settings";

export const PLAN_MONTHS = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 } as const;
export type Plan = keyof typeof PLAN_MONTHS;
export const PLAN_LABEL: Record<Plan, string> = { MONTHLY: "Mensuel", QUARTERLY: "Trimestriel", ANNUAL: "Annuel" };
export const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "Essai gratuit",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  SUSPENDED: "Suspendu pour impayé",
};

const DAY = 86_400_000;
const isPlan = (p: unknown): p is Plan => typeof p === "string" && p in PLAN_MONTHS;
const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function addMonths(d: Date, n: number) {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCMonth(r.getUTCMonth() + n);
  if (r.getUTCDate() < day) r.setUTCDate(0); // 31 janvier + 1 mois → fin février
  return r;
}

async function pharmacyCountry(pharmacyId: string) {
  return (await db.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, select: { country: true } })).country;
}

/** Abonnement d'une pharmacie validée ; créé à la validation avec la période d'essai des réglages. */
export async function ensureSubscription(pharmacyId: string, now = new Date()) {
  const existing = await db.subscription.findUnique({ where: { pharmacyId } });
  if (existing) return existing;
  const { billing } = await getSettings(await pharmacyCountry(pharmacyId));
  return db.subscription.upsert({
    where: { pharmacyId },
    update: {},
    create: { pharmacyId, model: "SUBSCRIPTION", plan: "MONTHLY", status: "TRIAL", trialEndsAt: new Date(now.getTime() + billing.trialDays * DAY) },
  });
}

/** Fin de la période déjà couverte (essai ou abonnement payé). */
function coveredUntil(s: Subscription) {
  const t = [s.trialEndsAt, s.currentPeriodEnd].filter(Boolean).map((d) => d!.getTime());
  return t.length ? new Date(Math.max(...t)) : null;
}

/** Facture de la prochaine période d'abonnement, à régler avant la fin de la période couverte. Idempotent. */
async function subscriptionInvoice(s: Subscription, now: Date) {
  const plan: Plan = isPlan(s.plan) ? s.plan : "MONTHLY";
  const { billing } = await getSettings(await pharmacyCountry(s.pharmacyId));
  const covered = coveredUntil(s);
  const start = covered && covered > now ? covered : now;
  const end = addMonths(start, PLAN_MONTHS[plan]);
  const existing = await db.invoice.findFirst({ where: { subscriptionId: s.id, kind: "SUBSCRIPTION", status: "DUE" } });
  if (existing) return existing;
  const key = `${s.id}:SUB:${start.toISOString().slice(0, 10)}`;
  return db.invoice.upsert({
    where: { periodKey: key },
    update: {},
    create: {
      subscriptionId: s.id,
      pharmacyId: s.pharmacyId,
      kind: "SUBSCRIPTION",
      label: `Abonnement ${PLAN_LABEL[plan].toLowerCase()} du ${dateFr(start)} au ${dateFr(end)}`,
      periodKey: key,
      periodStart: start,
      periodEnd: end,
      amount: billing.plans[plan],
      currency: countryInfo(await pharmacyCountry(s.pharmacyId)).currency,
      dueAt: start,
    },
  });
}

/** Choix de la formule par la pharmacie : forfait (mensuel, trimestriel, annuel) ou commission sur les ventes. */
export async function chooseBilling(pharmacyId: string, userId: string, choice: { model: "SUBSCRIPTION"; plan: string } | { model: "COMMISSION" }, now = new Date()) {
  const s = await ensureSubscription(pharmacyId, now);
  if (s.exempt) throw new ServiceError("STATE", "Pharmacie de démonstration : aucune facturation.");
  if (choice.model === "SUBSCRIPTION" && !isPlan(choice.plan)) throw new ServiceError("INVALID", "Formule inconnue.");
  const plan = choice.model === "SUBSCRIPTION" ? (choice.plan as Plan) : null;
  // Une facture d'abonnement pas encore réglée est remplacée par celle de la nouvelle formule.
  await db.invoice.updateMany({ where: { subscriptionId: s.id, kind: "SUBSCRIPTION", status: "DUE" }, data: { status: "CANCELLED" } });
  const updated = await db.subscription.update({ where: { id: s.id }, data: { model: choice.model, plan } });
  await db.auditLog.create({ data: { actorType: "PHARMACY", actorId: userId, action: "BILLING_PLAN_CHOSEN", entity: `Pharmacy:${pharmacyId}`, before: { model: s.model, plan: s.plan }, after: { model: choice.model, plan } } });
  if (choice.model === "SUBSCRIPTION") await subscriptionInvoice(updated, now);
  return refreshStatus(updated.id, now);
}

/**
 * Statut d'abonnement recalculé : une échéance impayée met en retard, puis suspend après le délai de grâce.
 * Une pharmacie suspendue n'est plus visible et ne reçoit plus de commandes ; elle peut toujours payer.
 */
export async function refreshStatus(subscriptionId: string, now = new Date()) {
  const s = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { pharmacy: true } });
  const { billing } = await getSettings(s.pharmacy.country);
  const overdue = await db.invoice.findFirst({ where: { subscriptionId, status: "DUE", dueAt: { lte: now } }, orderBy: { dueAt: "asc" } });
  let status: SubscriptionStatus;
  if (s.exempt) status = "ACTIVE";
  else if (overdue) status = overdue.dueAt.getTime() + billing.graceDays * DAY < now.getTime() ? "SUSPENDED" : "PAST_DUE";
  else if (s.model === "COMMISSION") status = "ACTIVE";
  else if (s.currentPeriodEnd && s.currentPeriodEnd > now) status = "ACTIVE";
  else if (s.trialEndsAt && s.trialEndsAt > now) status = "TRIAL";
  else status = "PAST_DUE";
  const live = s.pharmacy.verificationStatus === "APPROVED" && status !== "SUSPENDED";
  if (status !== s.status || live !== s.pharmacy.active) {
    await db.$transaction([
      db.subscription.update({ where: { id: s.id }, data: { status } }),
      db.pharmacy.update({ where: { id: s.pharmacyId }, data: { active: live } }),
      ...(status !== s.status
        ? [db.auditLog.create({ data: { actorType: "SYSTEM", action: status === "SUSPENDED" ? "BILLING_SUSPENDED" : "BILLING_STATUS", entity: `Pharmacy:${s.pharmacyId}`, before: { status: s.status }, after: { status } } })]
        : []),
    ]);
  }
  return { ...s, status };
}

/** La pharmacie peut-elle être active du point de vue de la facturation ? (utilisé par les décisions de l'administration) */
export async function billingAllowsActive(pharmacyId: string) {
  const s = await db.subscription.findUnique({ where: { pharmacyId } });
  return s?.status !== "SUSPENDED";
}

/**
 * Règlement d'une facture, uniquement sur résultat confirmé du prestataire ou référence saisie par l'administration.
 * Étend la période couverte, écrit le revenu au grand livre et lève une suspension éventuelle.
 */
export async function payInvoice(invoiceId: string, proof: { provider: string; providerRef: string; actor: { type: string; id?: string } }, now = new Date()) {
  if (!proof.providerRef.trim()) throw new ServiceError("INVALID", "Référence de paiement manquante.");
  const res = await db.invoice.updateMany({ where: { id: invoiceId, status: "DUE" }, data: { status: "PAID", paidAt: now, provider: proof.provider, providerRef: proof.providerRef.trim() } });
  if (res.count !== 1) throw new ServiceError("STATE", "Cette facture n'est plus à régler.");
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { subscription: true } });
  if (inv.kind === "SUBSCRIPTION" && inv.periodEnd) {
    const end = inv.subscription.currentPeriodEnd && inv.subscription.currentPeriodEnd > inv.periodEnd ? inv.subscription.currentPeriodEnd : inv.periodEnd;
    await db.subscription.update({ where: { id: inv.subscriptionId }, data: { currentPeriodEnd: end } });
  }
  await db.ledgerEntry.create({
    data: { ref: `${inv.id}:INVOICE`, account: inv.kind === "SUBSCRIPTION" ? "PLATFORM_SUBSCRIPTION" : "PLATFORM_PHARMACY_COMMISSION", amount: inv.amount, currency: inv.currency, pharmacyId: inv.pharmacyId, note: inv.label },
  });
  await db.auditLog.create({ data: { actorType: proof.actor.type, actorId: proof.actor.id ?? null, action: "INVOICE_PAID", entity: `Pharmacy:${inv.pharmacyId}`, after: { invoice: inv.id, amount: inv.amount, provider: proof.provider, providerRef: proof.providerRef } } });
  return refreshStatus(inv.subscriptionId, now);
}

function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}

/** Facture de commission du mois écoulé (modèle sans forfait), d'après les ventes inscrites au grand livre. */
async function commissionInvoice(s: Subscription, now: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const key = `${s.id}:COM:${monthKey(prevStart)}`;
  if (await db.invoice.findUnique({ where: { periodKey: key } })) return null;
  const country = await pharmacyCountry(s.pharmacyId);
  const { billing } = await getSettings(country);
  const sales = (await db.ledgerEntry.aggregate({ where: { pharmacyId: s.pharmacyId, account: "PHARMACY_SALES", createdAt: { gte: prevStart, lt: monthStart } }, _sum: { amount: true } }))._sum.amount ?? 0;
  const amount = Math.round((sales * billing.commissionPct) / 100);
  if (amount <= 0) return null;
  return db.invoice.create({
    data: {
      subscriptionId: s.id,
      pharmacyId: s.pharmacyId,
      kind: "COMMISSION",
      label: `Commission de ${billing.commissionPct} % sur ${formatMoney(sales, countryInfo(country).currency)} de ventes (${prevStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })})`,
      periodKey: key,
      periodStart: prevStart,
      periodEnd: monthStart,
      amount,
      currency: countryInfo(country).currency,
      dueAt: now,
    },
  });
}

/**
 * Tâche quotidienne : abonnement pour chaque pharmacie validée, factures de renouvellement émises
 * `reminderDays` jours avant l'échéance, factures de commission mensuelles, puis statuts et suspensions.
 */
export async function runBilling(now = new Date()) {
  const pharmacies = await db.pharmacy.findMany({ where: { verificationStatus: "APPROVED" }, select: { id: true, country: true } });
  const summary = { checked: 0, invoices: 0, suspended: 0, pastDue: 0 };
  for (const p of pharmacies) {
    const s = await ensureSubscription(p.id, now);
    summary.checked++;
    if (!s.exempt) {
      const { billing } = await getSettings(p.country);
      let created: Invoice | null = null;
      if (s.model === "SUBSCRIPTION") {
        const covered = coveredUntil(s);
        const hasDue = await db.invoice.count({ where: { subscriptionId: s.id, kind: "SUBSCRIPTION", status: "DUE" } });
        if (!hasDue && (!covered || covered.getTime() - billing.reminderDays * DAY <= now.getTime())) created = await subscriptionInvoice(s, now);
      } else created = await commissionInvoice(s, now);
      if (created) summary.invoices++;
    }
    const r = await refreshStatus(s.id, now);
    if (r.status === "SUSPENDED") summary.suspended++;
    if (r.status === "PAST_DUE") summary.pastDue++;
  }
  await db.auditLog.create({ data: { actorType: "SYSTEM", action: "BILLING_RUN", entity: "Billing", after: summary } });
  return summary;
}

/** Ce que voit la pharmacie : statut, échéance et factures. */
export async function billingOverview(pharmacyId: string, now = new Date()) {
  const s = await ensureSubscription(pharmacyId, now);
  const invoices = await db.invoice.findMany({ where: { subscriptionId: s.id }, orderBy: { createdAt: "desc" }, take: 24 });
  const due = invoices.filter((i) => i.status === "DUE");
  const covered = coveredUntil(s);
  const daysLeft = covered ? Math.ceil((covered.getTime() - now.getTime()) / DAY) : null;
  return { subscription: s, invoices, due, daysLeft };
}
