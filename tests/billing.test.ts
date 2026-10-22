// Évolution étape 7 : abonnements SaaS des pharmacies (essai, forfait, commission), suspension pour impayé, avis.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { chooseBilling, payInvoice, runBilling } from "../src/lib/services/billing";
import { createCheckout } from "../src/lib/services/checkout";
import { decide, registerPharmacy } from "../src/lib/services/onboarding";
import { completeHandover, customerClose, customerConfirm, pharmacyAdvance, verifyOrder } from "../src/lib/services/orders";
import { hideReview, pharmacyRating, submitReview } from "../src/lib/services/reviews";
import { visibleHandoverCode } from "../src/lib/services/tracking";
import { fixture, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let adminId = "";
before(async () => {
  await resetDatabase();
  f = await fixture();
  adminId = (await db.adminUser.findFirstOrThrow()).id;
});
after(() => db.$disconnect());

const DAY = 86_400_000;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
let n = 0;
async function newPharmacy(now: Date) {
  n++;
  const { pharmacy } = await registerPharmacy(
    { name: `Pharmacie Abonnée ${n}`, licenseNumber: "AUT-1", ownerName: "Dr Test", address: "Rue 1", district: "Akpakpa", city: "Cotonou", offersDelivery: false, email: `abonne${n}@exemple.bj`, password: "Baobab-Ganvie-26", phone: "+22901970000" + n, consent: true },
    [{ kind: "PHARMACY_LICENSE", name: "l.jpg", type: "image/jpeg", bytes: jpeg }, { kind: "OWNER_ID", name: "i.jpg", type: "image/jpeg", bytes: jpeg }],
    `9.9.9.${n}`,
  );
  await decide(adminId, "PHARMACY", pharmacy.id, "APPROVE");
  // La période d'essai part de « maintenant » dans le scénario.
  await db.subscription.update({ where: { pharmacyId: pharmacy.id }, data: { trialEndsAt: new Date(now.getTime() + 14 * DAY) } });
  return pharmacy;
}
const state = async (id: string) => {
  const p = await db.pharmacy.findUniqueOrThrow({ where: { id }, include: { subscription: true } });
  return { active: p.active, status: p.subscription!.status };
};

describe("Abonnements des pharmacies", () => {
  test("essai, facture avant l'échéance, retard, suspension automatique, puis réactivation au paiement", async () => {
    const t0 = new Date("2026-11-01T08:00:00Z");
    const p = await newPharmacy(t0);
    assert.deepEqual(await state(p.id), { active: true, status: "TRIAL" });

    await runBilling(new Date(t0.getTime() + 5 * DAY));
    assert.equal(await db.invoice.count({ where: { pharmacyId: p.id } }), 0, "pas de facture trop tôt");
    await runBilling(new Date(t0.getTime() + 10 * DAY));
    const inv = await db.invoice.findFirstOrThrow({ where: { pharmacyId: p.id, status: "DUE" } });
    assert.equal(inv.amount, 15000);
    assert.equal(inv.dueAt.getTime(), t0.getTime() + 14 * DAY, "due à la fin de l'essai");
    await runBilling(new Date(t0.getTime() + 11 * DAY));
    assert.equal(await db.invoice.count({ where: { pharmacyId: p.id } }), 1, "une seule facture par période");

    await runBilling(new Date(t0.getTime() + 16 * DAY));
    assert.deepEqual(await state(p.id), { active: true, status: "PAST_DUE" }, "délai de grâce : encore en ligne");
    await runBilling(new Date(t0.getTime() + 22 * DAY));
    assert.deepEqual(await state(p.id), { active: false, status: "SUSPENDED" }, "suspendue après 7 jours de grâce");

    // Une réactivation administrative ne contourne pas l'impayé.
    await decide(adminId, "PHARMACY", p.id, "SUSPEND", { note: "Contrôle." });
    await decide(adminId, "PHARMACY", p.id, "REACTIVATE");
    assert.equal((await state(p.id)).active, false);

    await assert.rejects(payInvoice(inv.id, { provider: "manual", providerRef: " ", actor: { type: "ADMIN" } }), /Référence/);
    const paidAt = new Date(t0.getTime() + 23 * DAY);
    await payInvoice(inv.id, { provider: "manual", providerRef: "MTN-1", actor: { type: "ADMIN", id: adminId } }, paidAt);
    assert.deepEqual(await state(p.id), { active: true, status: "ACTIVE" });
    const sub = await db.subscription.findUniqueOrThrow({ where: { pharmacyId: p.id } });
    assert.equal(sub.currentPeriodEnd!.toISOString().slice(0, 10), "2026-12-15", "un mois à partir de la fin de l'essai");
    assert.ok(await db.ledgerEntry.findUnique({ where: { ref: `${inv.id}:INVOICE` } }));
    await assert.rejects(payInvoice(inv.id, { provider: "manual", providerRef: "MTN-2", actor: { type: "ADMIN" } }), /plus à régler/);
  });

  test("modèle à la commission : facture mensuelle sur les ventes du mois écoulé", async () => {
    const t0 = new Date("2026-11-03T08:00:00Z");
    const p = await newPharmacy(t0);
    await chooseBilling(p.id, "u", { model: "COMMISSION" }, t0);
    assert.equal((await state(p.id)).status, "ACTIVE");
    await db.ledgerEntry.create({ data: { ref: `test:${p.id}:sale`, account: "PHARMACY_SALES", amount: 40000, currency: "XOF", pharmacyId: p.id, createdAt: new Date("2026-11-20T10:00:00Z") } });
    await runBilling(new Date("2026-12-01T06:00:00Z"));
    const inv = await db.invoice.findFirstOrThrow({ where: { pharmacyId: p.id, kind: "COMMISSION" } });
    assert.equal(inv.amount, 2000, "5 % de 40 000");
    await runBilling(new Date("2026-12-02T06:00:00Z"));
    assert.equal(await db.invoice.count({ where: { pharmacyId: p.id, kind: "COMMISSION" } }), 1);
  });

  test("les pharmacies de démonstration ne sont jamais facturées", async () => {
    await runBilling(new Date("2027-06-01T00:00:00Z"));
    assert.deepEqual(await state(f.ganhi.id), { active: true, status: "ACTIVE" });
    assert.equal(await db.invoice.count({ where: { pharmacyId: f.ganhi.id } }), 0);
  });
});

describe("Avis", () => {
  test("un avis par commande, après clôture, masquable par l'administration", async () => {
    const { orders } = await createCheckout([{ pharmacyId: f.ganhi.id, productId: f.paracetamol.id, quantity: 1 }], {
      contactName: "Afi", notifyChannel: "SMS", phone: "+229 01 97 66 66 66", fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH",
    });
    const o = orders[0];
    const items = await db.orderItem.findMany({ where: { orderId: o.id } });
    await verifyOrder(f.ganhi.id, "u", o.id, { items: Object.fromEntries(items.map((i) => [i.id, { answer: "AVAILABLE" as const }])), modes: "PICKUP_ONLY" });
    await customerConfirm(o.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" });
    await assert.rejects(submitReview(o.id, { pharmacyRating: 5 }), /clôturée/);
    await pharmacyAdvance(f.ganhi.id, o.id, "READY_FOR_PICKUP");
    await completeHandover(f.ganhi.id, o.id, visibleHandoverCode(await db.order.findUniqueOrThrow({ where: { id: o.id } }))!);
    await customerClose(o.id, true);
    await assert.rejects(submitReview(o.id, { pharmacyRating: 6 }), /de 1 à 5/);
    const r = await submitReview(o.id, { pharmacyRating: 4, comment: "Accueil rapide." });
    await assert.rejects(submitReview(o.id, { pharmacyRating: 5 }), /déjà/);
    let rating = await pharmacyRating(f.ganhi.id);
    assert.equal(rating.average, 4);
    assert.equal(rating.recent[0].comment, "Accueil rapide.");
    await hideReview(adminId, r.id);
    rating = await pharmacyRating(f.ganhi.id);
    assert.equal(rating.count, 0);
  });
});
