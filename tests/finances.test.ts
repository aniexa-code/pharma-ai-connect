// Évolution étape 6 : moteur de frais configurable, grand livre immuable, gains et retraits des livreurs.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { createCheckout } from "../src/lib/services/checkout";
import { deliveryQuoteFor, inWindow, quoteDelivery } from "../src/lib/services/fees";
import { courierBalance, processPayout, recordCompletion, requestPayout } from "../src/lib/services/ledger";
import { applyPaymentResult, completeHandover, courierAccept, courierAdvance, customerConfirm, pharmacyHandToCourier, verifyOrder } from "../src/lib/services/orders";
import { visibleHandoverCode } from "../src/lib/services/tracking";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../src/lib/settings";
import { fixture, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => {
  await resetDatabase();
  f = await fixture();
});
after(() => db.$disconnect());

const d = DEFAULT_SETTINGS.delivery;
const noon = new Date("2026-10-19T12:00:00Z"); // 13:00 à Cotonou
const night = new Date("2026-10-19T22:30:00Z"); // 23:30 à Cotonou

describe("Moteur de frais", () => {
  test("prise en charge + kilomètres, plancher, nuit, arrondi et commission", () => {
    assert.ok(inWindow("23:30", "21:00", "06:00") && inWindow("05:59", "21:00", "06:00") && !inWindow("06:00", "21:00", "06:00"));
    const short = quoteDelivery(d, 0.5, noon, { tz: "Africa/Porto-Novo" });
    assert.equal(short.fee, d.minFee, "plancher minimum");
    const q = quoteDelivery(d, 6.37, noon, { tz: "Africa/Porto-Novo" });
    assert.equal(q.distanceKm, 6.4);
    assert.equal(q.fee, 1275, "300 + 150 × 6,4 = 1260, arrondi à 1275");
    assert.equal(q.commission, Math.round(1275 * 0.15));
    assert.equal(q.courierEarning + q.commission, q.fee);
    const n = quoteDelivery(d, 6.37, night, { tz: "Africa/Porto-Novo" });
    assert.equal(n.night, d.nightSurcharge);
    assert.equal(n.fee, 1575);
  });

  test("les tarifs suivent les réglages de l'administration, et la zone de la pharmacie est respectée", async () => {
    await saveSettings("BJ", { delivery: { perKm: 200, commissionPct: 10 } }, { type: "ADMIN" });
    const s = await getSettings("BJ");
    const q = await deliveryQuoteFor(f.ganhi, "Rue 12.054, Agla", s, noon);
    assert.ok(!q.outOfRange);
    assert.ok(!q.estimated && q.distance === Math.round(200 * q.distanceKm));
    assert.equal(q.commission, Math.round(q.fee * 0.1));
    const unknown = await deliveryQuoteFor(f.ganhi, "Derrière la station, maison jaune", s, noon);
    assert.ok(!unknown.outOfRange && unknown.estimated && unknown.distanceKm === s.delivery.unknownZoneKm);
    const far = await deliveryQuoteFor({ ...f.ganhi, deliveryRadiusKm: 2 }, "Agla", s, noon);
    assert.equal(far.outOfRange, true);
    await saveSettings("BJ", { delivery: { perKm: d.perKm, commissionPct: d.commissionPct } }, { type: "ADMIN" });
  });

  test("frais de service une seule fois par panier (réglage par défaut)", async () => {
    const { orders } = await createCheckout(
      [
        { pharmacyId: f.ganhi.id, productId: f.paracetamol.id, quantity: 1 },
        { pharmacyId: f.godomey.id, productId: f.ibuprofene.id, quantity: 1 },
      ],
      { contactName: "Afi", notifyChannel: "SMS", phone: "+229 01 97 44 44 44", fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" },
    );
    for (const o of orders) {
      const items = await db.orderItem.findMany({ where: { orderId: o.id } });
      await verifyOrder(o.pharmacyId, "u", o.id, { items: Object.fromEntries(items.map((i) => [i.id, { answer: "AVAILABLE" as const }])), modes: "PICKUP_ONLY" });
    }
    const a = await customerConfirm(orders[0].id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" });
    const b = await customerConfirm(orders[1].id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" });
    assert.equal(a.serviceFee, 100);
    assert.equal(b.serviceFee, 0);
    assert.equal(a.total, a.subtotal + 100);
  });
});

describe("Grand livre et gains des livreurs", () => {
  let courierId = "";
  test("une livraison remise crédite le livreur et la plateforme, une seule fois", async () => {
    const { orders } = await createCheckout([{ pharmacyId: f.ganhi.id, productId: f.ibuprofene.id, quantity: 2 }], {
      contactName: "Paul", notifyChannel: "SMS", phone: "+229 01 97 55 55 55", fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 12.054, Agla",
    });
    const o = orders[0];
    const items = await db.orderItem.findMany({ where: { orderId: o.id } });
    await verifyOrder(f.ganhi.id, "u", o.id, { items: Object.fromEntries(items.map((i) => [i.id, { answer: "AVAILABLE" as const }])), modes: "BOTH" });
    const confirmed = await customerConfirm(o.id, { fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 12.054, Agla" });
    await applyPaymentResult((await db.payment.findFirstOrThrow({ where: { orderId: o.id } })).id, "CONFIRMED");
    courierId = (await db.courier.findFirstOrThrow()).id;
    await courierAccept(courierId, o.id);
    await courierAdvance(courierId, o.id);
    await pharmacyHandToCourier(f.ganhi.id, o.id);
    await courierAdvance(courierId, o.id);
    assert.equal(await db.ledgerEntry.count({ where: { orderId: o.id } }), 0, "rien n'est dû avant la remise");
    const done = await completeHandover({ courierId }, o.id, visibleHandoverCode(await db.order.findUniqueOrThrow({ where: { id: o.id } }))!);
    await recordCompletion(done); // second appel : sans effet
    const entries = await db.ledgerEntry.findMany({ where: { orderId: o.id } });
    const by = Object.fromEntries(entries.map((e) => [e.account, e.amount]));
    assert.equal(entries.length, 4);
    assert.equal(by.COURIER_EARNING, confirmed.courierEarning);
    assert.equal(by.PLATFORM_DELIVERY_COMMISSION, confirmed.deliveryCommission);
    assert.equal(by.PLATFORM_SERVICE_FEE, 100);
    assert.equal(by.PHARMACY_SALES, confirmed.subtotal);
    assert.equal(await courierBalance(courierId), confirmed.courierEarning);
  });

  test("le grand livre refuse toute modification ou suppression", async () => {
    const e = await db.ledgerEntry.findFirstOrThrow();
    await assert.rejects(db.ledgerEntry.update({ where: { id: e.id }, data: { amount: 1 } }), /immuable/);
    await assert.rejects(db.ledgerEntry.delete({ where: { id: e.id } }), /immuable/);
  });

  test("retraits : seuil, solde, une demande à la fois, preuve de paiement, refus recrédité", async () => {
    await db.ledgerEntry.create({ data: { ref: "test:bonus", account: "COURIER_EARNING", amount: 5000, currency: "XOF", courierId, note: "Courses test" } });
    const bal = await courierBalance(courierId);
    await assert.rejects(requestPayout(courierId, { amount: 999, method: "MOBILE_MONEY", phone: "+22901970000" }), /minimum/);
    await assert.rejects(requestPayout(courierId, { amount: bal + 1, method: "MOBILE_MONEY", phone: "+22901970000" }), /supérieur à votre solde/);
    await assert.rejects(requestPayout(courierId, { amount: 1000, method: "ORANGE", phone: "+22901970000" }), /non proposé/);
    // Deux envois simultanés : un seul passe.
    const results = await Promise.allSettled([1, 2].map(() => requestPayout(courierId, { amount: bal, method: "MOOV_MONEY", phone: "+22901970000" })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await courierBalance(courierId), 0, "le montant demandé est réservé");
    const p = await db.payoutRequest.findFirstOrThrow({ where: { courierId, status: "REQUESTED" } });
    const admin = await db.adminUser.findFirstOrThrow();
    await assert.rejects(processPayout(admin.id, p.id, "PAID", {}), /référence/);
    await processPayout(admin.id, p.id, "REJECTED", { note: "Numéro erroné." });
    assert.equal(await courierBalance(courierId), bal, "refus : montant recrédité");
    await assert.rejects(processPayout(admin.id, p.id, "PAID", { providerRef: "X" }), /déjà été traitée/);
    const p2 = await requestPayout(courierId, { amount: 1000, method: "MOBILE_MONEY", phone: "+22901970000" });
    await processPayout(admin.id, p2.id, "PAID", { providerRef: "MTN-778899" });
    assert.equal(await courierBalance(courierId), bal - 1000);
    assert.ok(await db.auditLog.findFirst({ where: { action: "PAYOUT_PAID", entity: `Payout:${p2.id}` } }));
  });
});
