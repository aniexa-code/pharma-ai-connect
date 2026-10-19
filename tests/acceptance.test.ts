// Critères d'acceptation du cahier des charges V1.1, § 9 : parcours complet d'un nouvel utilisateur sans compte.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { applyPaymentResult, completeHandover, createGuestOrder, customerConfirm, pharmacyAdvance, retryPayment, verifyOrder } from "../src/lib/services/orders";
import { createRequest, pharmacyRespond, requestByToken } from "../src/lib/services/requests";
import { resolvePlace, searchPharmacies, searchProducts } from "../src/lib/services/search";
import { orderByTrackingToken, visibleHandoverCode } from "../src/lib/services/tracking";
import { fixture, guest, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;

/** La pharmacie vérifie en rayon : tout est disponible. */
async function verifyAll(pharmacyId: string, orderId: string, modes: "PICKUP_ONLY" | "DELIVERY_ONLY" | "BOTH" = "BOTH", pharmacistApproval = false) {
  const items = await db.orderItem.findMany({ where: { orderId } });
  return verifyOrder(pharmacyId, "pharmacien", orderId, { items: Object.fromEntries(items.map((i) => [i.id, { answer: "AVAILABLE" as const }])), modes, pharmacistApproval });
}
before(async () => {
  await resetDatabase();
  f = await fixture();
});
after(() => db.$disconnect());

describe("Recherche sans inscription", () => {
  test("rechercher un médicament par nom ou molécule", async () => {
    const byName = await searchProducts("parac");
    assert.ok(byName.some((p) => p.slug === "paracetamol-500"));
    const byDci = await searchProducts("acide ascorbique");
    assert.ok(byDci.some((p) => p.slug === "vitamine-c-500"));
  });

  test("la recherche ignore les accents et les majuscules", async () => {
    for (const q of ["paracetamol", "PARACÉTAMOL", "Paracétamol"]) {
      assert.ok((await searchProducts(q)).some((p) => p.slug === "paracetamol-500"), q);
    }
    assert.ok((await searchProducts("omeprazole")).some((p) => p.slug === "omeprazole-20"));
    assert.equal((await searchProducts("100%")).length, 0, "les jokers SQL saisis sont pris à la lettre");
    assert.equal((await resolvePlace("godomey"))?.label, "Godomey, Abomey-Calavi");
    assert.equal((await resolvePlace("cadjehoun"))?.label, "Cadjèhoun, Cotonou");
  });

  test("résultats : distance, horaires, disponibilité, fiabilité et date de confirmation", async () => {
    const point = await resolvePlace("Ganhi");
    assert.ok(point, "le quartier saisi est reconnu sans géolocalisation");
    const results = await searchPharmacies({ productId: f.paracetamol.id, point, radiusKm: 3 });
    assert.ok(results.length > 0);
    const first = results[0];
    assert.equal(first.pharmacy.slug, "pharmacie-de-ganhi");
    assert.ok(first.distance !== null && first.distance < 1);
    assert.ok(first.open.label.length > 0);
    assert.equal(first.stock?.status, "AVAILABLE");
    assert.equal(first.reliability?.level, "HIGH");
    assert.ok(first.stock?.confirmedAt);
    assert.ok(results.every((r) => r.distance! <= 3), "le rayon est respecté");
  });

  test("recherche de pharmacies par ville sans position ni produit", async () => {
    const results = await searchPharmacies({ place: "Akpakpa" });
    assert.deepEqual(results.map((r) => r.pharmacy.slug), ["pharmacie-akpakpa"]);
  });
});

describe("Vérification de disponibilité sans compte", () => {
  test("demander une confirmation puis recevoir la réponse de la pharmacie", async () => {
    const { request, token } = await createRequest({
      kind: "VERIFICATION",
      pharmacyId: f.godomey.id,
      productId: f.ibuprofene.id,
      quantity: 2,
      contactName: "Grâce",
      notifyChannel: "WHATSAPP",
      phone: "+22901961234567",
    });
    assert.match(request.publicRef, /^VER-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    assert.equal(request.customerId, null);

    await pharmacyRespond(f.godomey.id, request.id, { status: "CONFIRMED", message: "Oui, 2 boîtes réservées jusqu'à 18 h.", price: 1300 });
    const view = await requestByToken(token);
    assert.equal(view?.status, "CONFIRMED");
    assert.equal(view?.messages.at(-1)?.body, "Oui, 2 boîtes réservées jusqu'à 18 h.");
    assert.deepEqual(view?.notifications.map((n) => n.event).sort(), ["REQUEST_ANSWERED", "REQUEST_RECEIVED"]);
    // La confirmation améliore la fiabilité affichée à tous.
    const [r] = await searchPharmacies({ productId: f.ibuprofene.id, place: "Godomey" });
    assert.equal(r.reliability?.level, "HIGH");
    assert.equal(r.stock?.price, 1300);
  });

  test("seules les coordonnées du canal choisi sont conservées", async () => {
    const { request } = await createRequest({
      kind: "QUESTION",
      pharmacyId: f.ganhi.id,
      contactName: "Paul",
      notifyChannel: "EMAIL",
      email: "paul@example.com",
      phone: "+22901961111111",
      message: "Livrez-vous à Akpakpa ?",
    });
    assert.equal(request.phone, null);
    assert.equal(request.email, "paul@example.com");
  });
});

describe("Commande invitée, paiement, suivi et notifications", () => {
  test("commande en retrait payée à la remise, du début à la fin, sans compte", async () => {
    const { order, token, handoverCode } = await createGuestOrder({
      ...guest,
      pharmacyId: f.ganhi.id,
      items: [{ productId: f.paracetamol.id, quantity: 2 }],
      fulfillment: "PICKUP",
      paymentMethod: "CASH",
    });
    assert.equal(order.customerId, null, "aucun compte n'est créé ni exigé");
    assert.match(order.publicRef, /^CMD-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    assert.equal(order.status, "PLACED");
    assert.match(handoverCode, /^\d{6}$/);

    const tracked = await orderByTrackingToken(token);
    assert.equal(tracked?.id, order.id);
    assert.equal(visibleHandoverCode(tracked!), handoverCode);

    await assert.rejects(pharmacyAdvance(f.ganhi.id, order.id, "CONFIRMED"), /Impossible/, "pas de confirmation sans vérification physique");
    assert.equal((await verifyAll(f.ganhi.id, order.id)).status, "AWAITING_CUSTOMER");
    assert.equal((await orderByTrackingToken(token))?.payments.length, 0, "rien n'est payé avant l'accord du client");
    await customerConfirm(order.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CASH" });
    await pharmacyAdvance(f.ganhi.id, order.id, "READY_FOR_PICKUP");
    await assert.rejects(completeHandover(f.ganhi.id, order.id, "000000".replace(/0/g, () => "9")), /Code incorrect/);
    await completeHandover(f.ganhi.id, order.id, handoverCode);
    await assert.rejects(completeHandover(f.ganhi.id, order.id, handoverCode), /pas prête|déjà été utilisé/);

    const done = await orderByTrackingToken(token);
    assert.equal(done?.status, "COLLECTED");
    assert.equal(done?.payments[0].status, "CONFIRMED");
    assert.deepEqual(
      done?.events.map((e) => e.status),
      ["PLACED", "AWAITING_CUSTOMER", "CONFIRMED", "READY_FOR_PICKUP", "COLLECTED"],
      "l'historique des statuts est conservé",
    );
    const events = done!.notifications.map((n) => n.event);
    assert.ok(done!.events.some((e) => e.actor === "CUSTOMER" && e.note === "Autorisation client : CONFIRMÉE."), "l'accord du client est tracé");
    for (const e of ["ORDER_RECEIVED", "ORDER_VERIFIED", "ORDER_CONFIRMED_BY_CUSTOMER", "READY_FOR_PICKUP", "COLLECTED"]) assert.ok(events.includes(e), `notification ${e}`);
    assert.equal(visibleHandoverCode(done!), null, "le code de retrait ne sert qu'une fois");
  });

  test("commande en livraison avec paiement Mobile Money : échec, nouvelle tentative, livraison", async () => {
    const { order, token, handoverCode } = await createGuestOrder({
      ...guest,
      notifyChannel: "LINK",
      pharmacyId: f.ganhi.id,
      items: [{ productId: f.ibuprofene.id, quantity: 1 }],
      fulfillment: "DELIVERY",
      deliveryAddress: "Rue 12.054, maison bleue, Agla",
      paymentMethod: "MOBILE_MONEY",
    });
    assert.equal(order.status, "PLACED");
    await verifyAll(f.ganhi.id, order.id);
    await assert.rejects(
      customerConfirm(order.id, { fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "CASH", deliveryAddress: "Rue 12.054, maison bleue, Agla" }),
      /se règle en ligne/,
    );
    const confirmed = await customerConfirm(order.id, { fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 12.054, maison bleue, Agla" });
    assert.equal(confirmed.status, "AWAITING_PAYMENT");
    // Frais calculés par le moteur (distance Ganhi → Agla), plus les frais de service.
    assert.ok(confirmed.deliveryFee >= 500 && confirmed.deliveryDistanceKm! > 5);
    assert.equal(confirmed.serviceFee, 100);
    assert.equal(confirmed.total, confirmed.subtotal + confirmed.deliveryFee + confirmed.serviceFee);
    assert.equal(confirmed.courierEarning + confirmed.deliveryCommission, confirmed.deliveryFee);

    let o = await orderByTrackingToken(token);
    await applyPaymentResult(o!.payments[0].id, "FAILED");
    const retry = await retryPayment(order.id, "MOBILE_MONEY");
    await applyPaymentResult(retry.id, "CONFIRMED");
    o = await orderByTrackingToken(token);
    assert.equal(o?.status, "CONFIRMED");
    assert.deepEqual(o?.payments.map((p) => p.status), ["FAILED", "CONFIRMED"]);

    await assert.rejects(pharmacyAdvance(f.ganhi.id, order.id, "READY_FOR_PICKUP"), /Impossible/);
    await pharmacyAdvance(f.ganhi.id, order.id, "COURIER_ASSIGNED", { courierName: "Jonas" });
    await pharmacyAdvance(f.ganhi.id, order.id, "PICKED_UP");
    await pharmacyAdvance(f.ganhi.id, order.id, "OUT_FOR_DELIVERY");
    await completeHandover(f.ganhi.id, order.id, handoverCode);
    o = await orderByTrackingToken(token);
    assert.equal(o?.status, "DELIVERED");
    const events = o!.notifications.map((n) => n.event);
    for (const e of ["PAYMENT_FAILED", "PAYMENT_CONFIRMED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"])
      assert.ok(events.includes(e), `notification ${e}`);
    assert.ok(o!.notifications.every((n) => n.channel === "LINK" && n.recipient === null), "canal « lien seul » : aucune coordonnée utilisée");
  });

  test("annulation d'une commande payée : remboursement et notification", async () => {
    const { order, token } = await createGuestOrder({
      ...guest,
      pharmacyId: f.ganhi.id,
      items: [{ productId: f.paracetamol.id, quantity: 1 }],
      fulfillment: "PICKUP",
      paymentMethod: "CARD",
    });
    await verifyAll(f.ganhi.id, order.id);
    await customerConfirm(order.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "CARD" });
    let o = await orderByTrackingToken(token);
    await applyPaymentResult(o!.payments[0].id, "CONFIRMED");
    await pharmacyAdvance(f.ganhi.id, order.id, "CANCELLED", { note: "Rupture imprévue" });
    o = await orderByTrackingToken(token);
    assert.equal(o?.status, "CANCELLED");
    assert.equal(o?.payments[0].status, "REFUNDED");
    assert.ok(o!.notifications.some((n) => n.event === "PAYMENT_REFUNDED"));
    assert.ok(o!.notifications.some((n) => n.event === "CANCELLED"));
  });
});

describe("Produits réglementés (§ 8)", () => {
  test("un produit à délivrance restreinte ne se commande pas en ligne", async () => {
    await assert.rejects(
      createGuestOrder({ ...guest, pharmacyId: f.ganhi.id, items: [{ productId: f.tramadol.id, quantity: 1 }], fulfillment: "PICKUP", paymentMethod: "CASH" }),
      /ne peut pas être commandé en ligne/,
    );
  });

  test("un produit sur ordonnance passe par le pharmacien et se retire en pharmacie", async () => {
    await assert.rejects(
      createGuestOrder({
        ...guest,
        pharmacyId: f.ganhi.id,
        items: [{ productId: f.amoxicilline.id, quantity: 1 }],
        fulfillment: "DELIVERY",
        deliveryAddress: "Rue 214, Akpakpa",
        paymentMethod: "CASH",
      }),
      /ordonnance/,
    );
    const { order, handoverCode } = await createGuestOrder({
      ...guest,
      phone: "+22901967777777",
      pharmacyId: f.ganhi.id,
      items: [{ productId: f.amoxicilline.id, quantity: 1 }],
      fulfillment: "PICKUP",
      paymentMethod: "MOBILE_MONEY",
    });
    assert.equal(order.status, "PLACED");
    assert.equal(await db.payment.count({ where: { orderId: order.id } }), 0, "pas de paiement avant validation");
    await assert.rejects(verifyAll(f.ganhi.id, order.id), /pharmacien/, "un produit sur ordonnance exige la validation du pharmacien");
    const reviewed = await verifyAll(f.ganhi.id, order.id, "BOTH", true);
    assert.equal(reviewed.allowedModes, "PICKUP_ONLY", "ordonnance : retrait uniquement");
    assert.ok(reviewed.prescriptionCheckedAt);
    await assert.rejects(customerConfirm(order.id, { fulfillment: "DELIVERY", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY", deliveryAddress: "Rue 214, Akpakpa" }), /retrait/);
    const confirmed = await customerConfirm(order.id, { fulfillment: "PICKUP", slot: "Dès que possible", paymentMethod: "MOBILE_MONEY" });
    assert.equal(confirmed.status, "AWAITING_PAYMENT");
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await applyPaymentResult(payment.id, "CONFIRMED");
    await pharmacyAdvance(f.ganhi.id, order.id, "READY_FOR_PICKUP");
    await completeHandover(f.ganhi.id, order.id, handoverCode);
  });
});

describe("Données et fraude", () => {
  test("les prix viennent de la base et les quantités sont plafonnées", async () => {
    await assert.rejects(
      createGuestOrder({ ...guest, pharmacyId: f.ganhi.id, items: [{ productId: f.paracetamol.id, quantity: 50 }], fulfillment: "PICKUP", paymentMethod: "CASH" }),
    );
    const stock = await db.stock.findUniqueOrThrow({ where: { pharmacyId_productId: { pharmacyId: f.ganhi.id, productId: f.paracetamol.id } } });
    const { order } = await createGuestOrder({
      ...guest,
      phone: "+22901969999999",
      pharmacyId: f.ganhi.id,
      items: [{ productId: f.paracetamol.id, quantity: 3 }],
      fulfillment: "PICKUP",
      paymentMethod: "CASH",
    });
    assert.equal(order.total, stock.price * 3);
  });

  test("une rafale de commandes depuis le même numéro est bloquée", async () => {
    const make = () =>
      createGuestOrder({
        ...guest,
        phone: "+22901965555555",
        pharmacyId: f.ganhi.id,
        items: [{ productId: f.paracetamol.id, quantity: 1 }],
        fulfillment: "PICKUP",
        paymentMethod: "CASH",
      });
    for (let i = 0; i < 5; i++) await make();
    await assert.rejects(make(), /Trop de commandes/);
  });

  test("le champ piège anti-robot rejette la commande", async () => {
    await assert.rejects(
      createGuestOrder(
        { ...guest, pharmacyId: f.ganhi.id, items: [{ productId: f.paracetamol.id, quantity: 1 }], fulfillment: "PICKUP", paymentMethod: "CASH" },
        { honeypot: "http://spam" },
      ),
    );
  });
});
