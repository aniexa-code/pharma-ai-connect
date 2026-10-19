// § 5 et § 9 : personne ne peut consulter la commande d'un autre en devinant ou en connaissant son numéro.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { hashToken, randomToken } from "../src/lib/crypto";
import { claimWithCode, claimWithTrackingToken, registerCustomer } from "../src/lib/services/accounts";
import { createGuestOrder } from "../src/lib/services/orders";
import { orderByTrackingToken, recoverTracking, requestCode, revokeTracking, rotateTrackingToken } from "../src/lib/services/tracking";
import { fixture, guest, resetDatabase } from "./helpers";

let victim: Awaited<ReturnType<typeof createGuestOrder>>;
before(async () => {
  await resetDatabase();
  const f = await fixture();
  victim = await createGuestOrder({
    ...guest,
    pharmacyId: f.ganhi.id,
    items: [{ productId: f.paracetamol.id, quantity: 1 }],
    fulfillment: "DELIVERY",
    deliveryAddress: "12 rue des Manguiers, Zogbo",
    paymentMethod: "CASH",
  });
});
after(() => db.$disconnect());

describe("Accès à une commande sans compte", () => {
  test("le numéro de commande seul ne donne accès à rien", async () => {
    const ref = victim.order.publicRef;
    assert.equal(await orderByTrackingToken(ref), null);
    assert.equal(await orderByTrackingToken(ref.toLowerCase()), null);
    assert.equal(await orderByTrackingToken(victim.order.id), null, "l'identifiant interne non plus");
    assert.equal(await orderByTrackingToken(hashToken(victim.token)), null, "ni l'empreinte stockée en base");
  });

  test("un jeton deviné ou aléatoire ne correspond à aucune commande", async () => {
    for (let i = 0; i < 200; i++) assert.equal(await orderByTrackingToken(randomToken()), null);
    assert.equal(await orderByTrackingToken(victim.token.slice(0, -1) + (victim.token.endsWith("A") ? "B" : "A")), null);
  });

  test("la base ne contient pas le jeton en clair", async () => {
    const row = await db.order.findUniqueOrThrow({ where: { id: victim.order.id } });
    assert.ok(!JSON.stringify(row).includes(victim.token));
    assert.ok(!JSON.stringify(row).includes(victim.handoverCode), "ni le code de remise");
  });

  test("connaître la référence et deviner le téléphone ne révèle rien et n'envoie aucun code", async () => {
    const wrong = await requestCode("RECOVER_TRACKING", victim.order.publicRef, "+22901960000000", "10.0.0.1");
    const missing = await requestCode("RECOVER_TRACKING", "CMD-ZZZZ-ZZZZ", "+22901961234567", "10.0.0.1");
    assert.equal(wrong.message, missing.message, "même réponse que la commande existe ou non");
    assert.equal(wrong.demoCode, undefined);
    assert.equal(await db.verificationCode.count({ where: { orderId: victim.order.id } }), 0);
  });

  test("le code de récupération est limité en essais, puis à usage unique", async () => {
    const { demoCode } = await requestCode("RECOVER_TRACKING", victim.order.publicRef, guest.phone, "10.0.0.2");
    assert.ok(demoCode, "code envoyé au contact de la commande (affiché ici car aucun fournisseur SMS en test)");
    for (let i = 0; i < 5; i++) await assert.rejects(recoverTracking(victim.order.publicRef, "123456" === demoCode ? "654321" : "123456"), /invalide/);
    await assert.rejects(recoverTracking(victim.order.publicRef, demoCode!), /invalide/, "bloqué après 5 essais, même avec le bon code");

    const again = await requestCode("RECOVER_TRACKING", victim.order.publicRef, guest.phone, "10.0.0.2");
    const newToken = await recoverTracking(victim.order.publicRef, again.demoCode!);
    await assert.rejects(recoverTracking(victim.order.publicRef, again.demoCode!), /invalide/, "usage unique");
    assert.equal((await orderByTrackingToken(newToken))?.id, victim.order.id);
    assert.equal(await orderByTrackingToken(victim.token), null, "l'ancien lien est révoqué");
    victim.token = newToken;
  });

  test("les demandes de code en rafale sont bloquées", async () => {
    for (let i = 0; i < 3; i++) await requestCode("RECOVER_TRACKING", "CMD-AAAA-AAAA", "+22901960000000", "10.0.0.3");
    let blocked = false;
    for (let i = 0; i < 10 && !blocked; i++) {
      try {
        await requestCode("RECOVER_TRACKING", "CMD-AAAA-AAAA", "+22901960000000", "10.0.0.3");
      } catch (e) {
        blocked = /Trop de demandes/.test(String(e));
      }
    }
    assert.ok(blocked);
  });

  test("un lien révoqué ou expiré ne fonctionne plus", async () => {
    await revokeTracking(victim.order.id);
    assert.equal(await orderByTrackingToken(victim.token), null);
    const fresh = await rotateTrackingToken(victim.order.id);
    assert.ok(await orderByTrackingToken(fresh));
    await db.order.update({ where: { id: victim.order.id }, data: { trackingExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await orderByTrackingToken(fresh), null);
    victim.token = await rotateTrackingToken(victim.order.id);
  });
});

describe("Compte facultatif et rattachement", () => {
  test("refuser la création de compte ne retire pas l'accès à la commande", async () => {
    // « Continuer sans compte » ne déclenche aucune écriture : la commande reste invitée et suivable.
    const o = await orderByTrackingToken(victim.token);
    assert.equal(o?.customerId, null);
    assert.equal(await db.customer.count(), 0, "aucun compte créé automatiquement à partir du téléphone");
  });

  test("créer un compte exige un consentement explicite", async () => {
    await assert.rejects(
      // @ts-expect-error consentement absent
      registerCustomer({ name: "Grâce", email: "grace@example.com", password: "motdepasse1" }),
      /Cochez la case/,
    );
  });

  test("un tiers connaissant la référence ne peut pas rattacher la commande à son compte", async () => {
    const intruder = await registerCustomer({ name: "Intrus", email: "intrus@example.com", password: "motdepasse1", consent: true });
    await assert.rejects(claimWithCode(intruder.id, victim.order.publicRef, "000000"), /invalide/);
    await assert.rejects(claimWithTrackingToken(intruder.id, victim.order.publicRef), /invalide/);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: victim.order.id } })).customerId, null);
  });

  test("le titulaire rattache sa commande avec son lien ; elle ne peut plus être prise par un autre", async () => {
    const owner = await registerCustomer(
      { name: "Grâce", email: "grace@example.com", password: "motdepasse1", consent: true },
      { attachTrackingToken: victim.token },
    );
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: victim.order.id } })).customerId, owner.id);
    assert.ok(await orderByTrackingToken(victim.token), "le lien de suivi reste valable après création du compte");

    const other = await registerCustomer({ name: "Autre", email: "autre@example.com", password: "motdepasse1", consent: true });
    const { demoCode } = await requestCode("CLAIM_ORDER", victim.order.publicRef, guest.phone, "10.0.0.9");
    await assert.rejects(claimWithCode(other.id, victim.order.publicRef, demoCode!), /déjà rattachée/);
  });
});
