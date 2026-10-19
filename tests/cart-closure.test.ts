// Évolution étape 4 : panier multi-pharmacies et clôture obligatoire par toutes les parties.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { mergeCart, parseCart } from "../src/lib/cart";
import { db } from "../src/lib/db";
import { checkoutByToken, createCheckout } from "../src/lib/services/checkout";
import {
  completeHandover,
  courierAccept,
  courierAdvance,
  customerClose,
  customerConfirm,
  pharmacyAdvance,
  pharmacyHandToCourier,
  verifyOrder,
} from "../src/lib/services/orders";
import { visibleHandoverCode } from "../src/lib/services/tracking";
import { fixture, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => {
  await resetDatabase();
  f = await fixture();
});
after(() => db.$disconnect());

const contact = { contactName: "Afi", notifyChannel: "SMS" as const, slot: "Dès que possible", paymentMethod: "CASH" as const };

async function verifyAll(pharmacyId: string, orderId: string, modes: "PICKUP_ONLY" | "BOTH" = "BOTH") {
  const items = await db.orderItem.findMany({ where: { orderId } });
  return verifyOrder(pharmacyId, "u", orderId, { items: Object.fromEntries(items.map((i) => [i.id, { answer: "AVAILABLE" as const }])), modes });
}

describe("Panier", () => {
  test("le cookie du panier est relu prudemment et plafonné", () => {
    assert.deepEqual(parseCart("pas du json"), []);
    assert.deepEqual(parseCart(JSON.stringify([{ ph: "a", p: "b", q: 99 }, { ph: 1 }])), [{ pharmacyId: "a", productId: "b", quantity: 10 }]);
    let cart = mergeCart([], [{ pharmacyId: "a", productId: "b", quantity: 2 }]);
    cart = mergeCart(cart, [{ pharmacyId: "a", productId: "b", quantity: 3 }]);
    assert.equal(cart[0].quantity, 5, "les quantités se cumulent");
    cart = mergeCart(cart, [{ pharmacyId: "a", productId: "b", quantity: 0 }], "set");
    assert.deepEqual(cart, [], "une quantité à 0 retire la ligne");
  });

  test("un panier sur deux pharmacies crée une commande par pharmacie, suivies ensemble", async () => {
    const lines = [
      { pharmacyId: f.ganhi.id, productId: f.paracetamol.id, quantity: 2 },
      { pharmacyId: f.ganhi.id, productId: f.tramadol.id, quantity: 1 }, // délivrance encadrée : écarté
      { pharmacyId: f.godomey.id, productId: f.ibuprofene.id, quantity: 1 },
    ];
    const { checkout, token, orders } = await createCheckout(lines, { ...contact, phone: "+229 01 97 11 11 11", fulfillment: "DELIVERY", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 214, Akpakpa" });
    assert.match(checkout.publicRef, /^PAN-/);
    assert.equal(orders.length, 2);
    assert.ok(orders.every((o) => o.status === "PLACED" && o.checkoutId === checkout.id));
    const ganhiOrder = orders.find((o) => o.pharmacyId === f.ganhi.id)!;
    const godomeyOrder = orders.find((o) => o.pharmacyId === f.godomey.id)!;
    assert.equal(ganhiOrder.fulfillment, "DELIVERY");
    assert.equal(godomeyOrder.fulfillment, "PICKUP", "Godomey ne livre pas : le souhait est adapté");
    assert.equal((await db.orderItem.count({ where: { orderId: ganhiOrder.id } })), 1, "le produit non commandable en ligne est écarté");
    const view = await checkoutByToken(token);
    assert.deepEqual(view?.orders.map((o) => o.id).sort(), orders.map((o) => o.id).sort());
    assert.equal(await checkoutByToken("A".repeat(43)), null);
  });

  test("un formulaire invalide ne crée aucune commande", async () => {
    const before = await db.order.count();
    await assert.rejects(createCheckout([{ pharmacyId: f.ganhi.id, productId: f.paracetamol.id, quantity: 1 }], { ...contact, phone: "abc", fulfillment: "PICKUP" }), /téléphone/i);
    assert.equal(await db.order.count(), before);
    assert.equal(await db.checkout.count({ where: { phone: "abc" } }), 0);
  });
});

describe("Clôture par toutes les parties", () => {
  test("retrait : la pharmacie clôture en validant le code, la commande n'est terminée qu'après le client", async () => {
    const { orders } = await createCheckout([{ pharmacyId: f.ganhi.id, productId: f.paracetamol.id, quantity: 1 }], { ...contact, phone: "+229 01 97 22 22 22", fulfillment: "PICKUP" });
    const o = orders[0];
    await verifyAll(f.ganhi.id, o.id);
    await assert.rejects(customerClose(o.id, true), /pas encore été remise/);
    await customerConfirm(o.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" });
    await pharmacyAdvance(f.ganhi.id, o.id, "READY_FOR_PICKUP");
    const fresh = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    const done = await completeHandover(f.ganhi.id, o.id, visibleHandoverCode(fresh)!);
    assert.equal(done.status, "COLLECTED");
    assert.ok(done.pharmacyClosedAt);
    assert.equal(done.closedAt, null, "pas terminée sans le client");

    await assert.rejects(customerClose(o.id, false, " "), /Décrivez/);
    await customerClose(o.id, false, "Une boîte manquait.");
    let after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.equal(after.closedAt, null, "un problème signalé laisse la commande ouverte");
    assert.ok(await db.message.findFirst({ where: { orderId: o.id, body: { contains: "Une boîte manquait." } } }));

    await customerClose(o.id, true);
    after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.ok(after.closedAt);
    await assert.rejects(customerClose(o.id, true), /déjà clôturé/);
    assert.ok(await db.orderEvent.findFirst({ where: { orderId: o.id, note: "Commande clôturée par toutes les parties." } }));
  });

  test("livraison : remise au livreur validée par les deux, puis clôture livreur, pharmacie et client", async () => {
    const { orders } = await createCheckout([{ pharmacyId: f.ganhi.id, productId: f.ibuprofene.id, quantity: 1 }], {
      ...contact,
      phone: "+229 01 97 33 33 33",
      fulfillment: "DELIVERY",
      paymentMethod: "MOBILE_MONEY",
      deliveryAddress: "Rue 12.054, Agla",
    });
    const o = orders[0];
    await verifyAll(f.ganhi.id, o.id);
    await customerConfirm(o.id, { fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 12.054, Agla" });
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    const { applyPaymentResult } = await import("../src/lib/services/orders");
    await applyPaymentResult(pay.id, "CONFIRMED");

    const courier = await db.courier.findFirstOrThrow();
    await courierAccept(courier.id, o.id);
    await courierAdvance(courier.id, o.id); // récupérée
    await assert.rejects(courierAdvance(courier.id, o.id), /La pharmacie doit d'abord confirmer/);
    await pharmacyHandToCourier(f.ganhi.id, o.id);
    await courierAdvance(courier.id, o.id); // en route
    const fresh = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    const delivered = await completeHandover({ courierId: courier.id }, o.id, visibleHandoverCode(fresh)!);
    assert.ok(delivered.courierClosedAt && delivered.pharmacyClosedAt);
    assert.equal(delivered.closedAt, null);
    const closed = await customerClose(o.id, true);
    assert.ok(closed.closedAt);
  });
});
