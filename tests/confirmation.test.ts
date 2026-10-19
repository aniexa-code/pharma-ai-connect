// Évolution étape 3 : vérification physique par la pharmacie, puis accord explicite du client.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { createGuestOrder, customerConfirm, customerModes, verifyOrder } from "../src/lib/services/orders";
import { orderByTrackingToken } from "../src/lib/services/tracking";
import { fixture, guest, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => {
  await resetDatabase();
  f = await fixture();
});
after(() => db.$disconnect());

let n = 0;
async function newOrder(items: { productId: string; quantity: number }[], pharmacyId = f.ganhi.id) {
  n++;
  return createGuestOrder({ ...guest, phone: `+2290197000${String(n).padStart(4, "0")}`, pharmacyId, items, fulfillment: "PICKUP", paymentMethod: "CASH" });
}

describe("Vérification physique", () => {
  test("chaque produit reçoit une réponse ; seuls les produits disponibles sont retenus, aux prix confirmés", async () => {
    const { order, token } = await newOrder([
      { productId: f.paracetamol.id, quantity: 4 },
      { productId: f.ibuprofene.id, quantity: 1 },
      { productId: f.amoxicilline.id, quantity: 1 },
    ]);
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    const id = (productId: string) => items.find((i) => i.productId === productId)!.id;

    await assert.rejects(
      verifyOrder(f.ganhi.id, "u", order.id, { items: { [id(f.paracetamol.id)]: { answer: "AVAILABLE" } }, modes: "BOTH" }),
      /Indiquez une réponse/,
      "aucun produit ne peut être laissé sans réponse",
    );
    await assert.rejects(
      verifyOrder(f.godomey.id, "u", order.id, { items: {}, modes: "BOTH" }),
      /introuvable/,
      "une autre pharmacie ne peut pas vérifier cette commande",
    );
    await assert.rejects(
      verifyOrder(f.ganhi.id, "u", order.id, {
        items: { [id(f.paracetamol.id)]: { answer: "INSUFFICIENT", quantity: 4 }, [id(f.ibuprofene.id)]: { answer: "AVAILABLE" }, [id(f.amoxicilline.id)]: { answer: "UNAVAILABLE" } },
        modes: "BOTH",
      }),
      /quantité réellement disponible/,
    );
    await assert.rejects(
      verifyOrder(f.ganhi.id, "u", order.id, {
        items: { [id(f.paracetamol.id)]: { answer: "OTHER" }, [id(f.ibuprofene.id)]: { answer: "AVAILABLE" }, [id(f.amoxicilline.id)]: { answer: "UNAVAILABLE" } },
        modes: "BOTH",
      }),
      /précisez/,
    );

    const verified = await verifyOrder(f.ganhi.id, "u", order.id, {
      items: {
        [id(f.paracetamol.id)]: { answer: "INSUFFICIENT", quantity: 2, price: 600 },
        [id(f.ibuprofene.id)]: { answer: "AVAILABLE" },
        [id(f.amoxicilline.id)]: { answer: "NEEDS_PHARMACIST", note: "Ordonnance à présenter au comptoir." },
      },
      modes: "BOTH",
    });
    const ibuprofenePrice = items.find((i) => i.productId === f.ibuprofene.id)!.unitPrice;
    assert.equal(verified.status, "AWAITING_CUSTOMER");
    assert.equal(verified.subtotal, 2 * 600 + ibuprofenePrice, "seuls les produits retenus comptent, au prix confirmé");
    assert.equal(verified.requiresPrescription, false, "le produit sur ordonnance non retenu ne bloque pas la livraison");
    assert.deepEqual(customerModes(verified), ["PICKUP", "DELIVERY"]);

    const notice = await db.notification.findFirstOrThrow({ where: { orderId: order.id, event: "ORDER_VERIFIED" } });
    const link = notice.body.match(/\/suivi\/([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(link, "la notification renvoie vers la commande");
    assert.equal(link, token);
    assert.equal((await orderByTrackingToken(link!))?.id, order.id);

    await assert.rejects(verifyOrder(f.ganhi.id, "u", order.id, { items: {}, modes: "BOTH" }), /déjà été vérifiée/);
  });

  test("aucun produit disponible : la commande est annulée et le client prévenu", async () => {
    const { order } = await newOrder([{ productId: f.paracetamol.id, quantity: 1 }]);
    const [item] = await db.orderItem.findMany({ where: { orderId: order.id } });
    const o = await verifyOrder(f.ganhi.id, "u", order.id, { items: { [item.id]: { answer: "UNAVAILABLE" } }, modes: "BOTH" });
    assert.equal(o.status, "CANCELLED");
    assert.ok(await db.notification.findFirst({ where: { orderId: order.id, event: "CANCELLED" } }));
  });

  test("les modes autorisés respectent ce que propose la pharmacie", async () => {
    const { order } = await newOrder([{ productId: f.paracetamol.id, quantity: 1 }], f.godomey.id);
    const [item] = await db.orderItem.findMany({ where: { orderId: order.id } });
    await assert.rejects(verifyOrder(f.godomey.id, "u", order.id, { items: { [item.id]: { answer: "AVAILABLE" } }, modes: "BOTH" }), /livraison/);
    const o = await verifyOrder(f.godomey.id, "u", order.id, { items: { [item.id]: { answer: "AVAILABLE" } }, modes: "PICKUP_ONLY" });
    assert.deepEqual(customerModes(o), ["PICKUP"]);
  });
});

describe("Accord du client", () => {
  test("le client confirme une seule fois, avec le mode autorisé ; son accord est horodaté", async () => {
    const { order } = await newOrder([{ productId: f.ibuprofene.id, quantity: 1 }]);
    const [item] = await db.orderItem.findMany({ where: { orderId: order.id } });
    await assert.rejects(customerConfirm(order.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" }), /n'attend pas/, "pas d'accord avant la vérification");
    await verifyOrder(f.ganhi.id, "u", order.id, { items: { [item.id]: { answer: "AVAILABLE" } }, modes: "PICKUP_ONLY" });
    await assert.rejects(
      customerConfirm(order.id, { fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 214, Akpakpa" }),
      /n'autorise que le retrait/,
    );
    const ok = await customerConfirm(order.id, { fulfillment: "PICKUP", slot: "Aujourd'hui, 17 h – 20 h", paymentMethod: "CASH" });
    assert.equal(ok.status, "CONFIRMED");
    assert.ok(ok.customerConfirmedAt);
    await assert.rejects(customerConfirm(order.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" }), /n'attend pas/);
    const ev = await db.orderEvent.findFirstOrThrow({ where: { orderId: order.id, actor: "CUSTOMER", note: "Autorisation client : CONFIRMÉE." } });
    assert.equal(ev.status, "CONFIRMED");
    const codeNotice = await db.notification.findFirstOrThrow({ where: { orderId: order.id, event: "ORDER_CONFIRMED_BY_CUSTOMER" } });
    assert.match(codeNotice.body, /Code de retrait : \d{6}/);
  });
});
