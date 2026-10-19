// Commandes invitées : création, cycle de vie, paiement, remise.
// Aucune fonction ici n'exige de compte client ; le rattachement est géré dans accounts.ts.
import type { Order, OrderStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { TTL, currency, formatMoney, siteUrl } from "../config";
import { handoverCode, hashToken, ipFingerprint, newNonce, publicRef, randomToken } from "../crypto";
import { ServiceError } from "../errors";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { firstIssue, orderInput, type Channel, type OrderInput } from "../validation";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PRESCRIPTION_REVIEW: "Ordonnance à valider par le pharmacien",
  AWAITING_PAYMENT: "En attente de paiement",
  PLACED: "Enregistrée, en attente de confirmation",
  CONFIRMED: "Confirmée par la pharmacie",
  PREPARING: "En préparation",
  READY_FOR_PICKUP: "Prête au retrait",
  COURIER_ASSIGNED: "Livreur attribué",
  PICKED_UP: "Récupérée par le livreur",
  OUT_FOR_DELIVERY: "Livraison en cours",
  DELIVERED: "Livrée",
  COLLECTED: "Retirée",
  CANCELLED: "Annulée",
};

export const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Payé",
  FAILED: "Échoué",
  CANCELLED: "Annulé",
  REFUNDED: "Remboursé",
};

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Paiement à la remise (espèces)",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Carte bancaire",
};

const FINAL: OrderStatus[] = ["DELIVERED", "COLLECTED", "CANCELLED"];

/** Transitions autorisées côté pharmacie (la remise finale passe par completeHandover). */
const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "READY_FOR_PICKUP", "COURIER_ASSIGNED", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "COURIER_ASSIGNED", "CANCELLED"],
  READY_FOR_PICKUP: ["CANCELLED"],
  COURIER_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  AWAITING_PAYMENT: ["CANCELLED"],
  PRESCRIPTION_REVIEW: ["CANCELLED"],
};

export function allowedNext(o: Pick<Order, "status" | "fulfillment">): OrderStatus[] {
  return (NEXT[o.status] ?? []).filter((s) =>
    o.fulfillment === "PICKUP" ? !["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(s) : s !== "READY_FOR_PICKUP",
  );
}

/** Messages volontairement sobres : ni produit ni information de santé dans un SMS. */
const NOTICE: Partial<Record<OrderStatus, (ref: string, o: Order) => string>> = {
  CONFIRMED: (r) => `Votre commande ${r} est confirmée par la pharmacie.`,
  READY_FOR_PICKUP: (r) => `Votre commande ${r} est prête au retrait. Présentez votre code de retrait au comptoir.`,
  COURIER_ASSIGNED: (r, o) => `Un livreur${o.courierName ? ` (${o.courierName})` : ""} a été attribué à votre commande ${r}.`,
  PICKED_UP: (r) => `Le livreur a récupéré votre commande ${r} à la pharmacie.`,
  OUT_FOR_DELIVERY: (r) => `Votre commande ${r} est en cours de livraison. Gardez votre code de remise à portée de main.`,
  DELIVERED: (r) => `Votre commande ${r} a été livrée. Merci !`,
  COLLECTED: (r) => `Votre commande ${r} a été retirée. Merci !`,
  CANCELLED: (r) => `Votre commande ${r} a été annulée.`,
};

export function trackingUrl(token: string) {
  return `${siteUrl()}/suivi/${token}`;
}

async function notifyOrder(o: Order, event: string, body: string, token?: string) {
  const link = token ? ` Suivi : ${trackingUrl(token)}` : " Suivez-la avec votre lien de suivi.";
  return notify({
    orderId: o.id,
    channel: o.notifyChannel as Channel,
    phone: o.phone,
    email: o.email,
    event,
    body: body + link,
  });
}

function onlineProvider() {
  return process.env.PAYMENT_PROVIDER || "";
}

/** Moyens de paiement réellement proposés pour une pharmacie. */
export function availableMethods(pharmacyMethods: string[]) {
  return pharmacyMethods.filter((m) => m === "CASH" || !!onlineProvider());
}

async function uniqueRef() {
  for (let i = 0; i < 5; i++) {
    const ref = publicRef("CMD");
    if (!(await db.order.findUnique({ where: { publicRef: ref }, select: { id: true } }))) return ref;
  }
  throw new Error("Impossible de générer une référence unique.");
}

export type CreatedOrder = { order: Order; token: string; handoverCode: string };

export async function createGuestOrder(
  raw: OrderInput,
  ctx: { ip?: string; customerId?: string | null; requestId?: string | null; honeypot?: string } = {},
): Promise<CreatedOrder> {
  // Champ piège invisible : un robot qui le remplit est ignoré.
  if (ctx.honeypot) throw new ServiceError("BOT", "Commande refusée.");
  const parsed = orderInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const input = parsed.data;

  // Protection contre les commandes en rafale (par appareil et par numéro).
  const fp = ctx.ip ? ipFingerprint(ctx.ip) : null;
  if (fp && !(await rateLimit(`order:ip:${fp}`, 10, 3600_000)))
    throw new ServiceError("RATE", "Trop de commandes depuis cet appareil. Réessayez plus tard ou appelez la pharmacie.");
  if (!(await rateLimit(`order:phone:${input.phone}`, 5, 3600_000)))
    throw new ServiceError("RATE", "Trop de commandes pour ce numéro en peu de temps. Réessayez plus tard.");

  const pharmacy = await db.pharmacy.findFirst({ where: { id: input.pharmacyId, active: true } });
  if (!pharmacy) throw new ServiceError("PHARMACY", "Cette pharmacie n'accepte pas de commande en ligne pour le moment.");
  if (input.fulfillment === "DELIVERY" && !pharmacy.offersDelivery)
    throw new ServiceError("FULFILLMENT", "Cette pharmacie ne livre pas : choisissez le retrait en pharmacie.");
  if (input.fulfillment === "PICKUP" && !pharmacy.offersPickup)
    throw new ServiceError("FULFILLMENT", "Cette pharmacie ne propose pas le retrait.");
  if (!availableMethods(pharmacy.paymentMethods).includes(input.paymentMethod))
    throw new ServiceError("PAYMENT", "Ce moyen de paiement n'est pas proposé par cette pharmacie.");

  // Les prix viennent toujours de la base, jamais du navigateur.
  const merged = new Map<string, number>();
  for (const it of input.items) merged.set(it.productId, Math.min(10, (merged.get(it.productId) ?? 0) + it.quantity));
  const stocks = await db.stock.findMany({
    where: { pharmacyId: pharmacy.id, productId: { in: [...merged.keys()] } },
    include: { product: true },
  });
  if (stocks.length !== merged.size) throw new ServiceError("PRODUCT", "Un produit n'est pas référencé dans cette pharmacie.");
  for (const s of stocks) {
    if (s.status === "OUT") throw new ServiceError("STOCK", `${s.product.name} est indiqué indisponible : demandez une vérification.`);
    if (s.product.regulation === "RESTRICTED")
      throw new ServiceError(
        "REGULATED",
        `${s.product.name} ne peut pas être commandé en ligne. Contactez la pharmacie : un pharmacien vous indiquera la marche à suivre.`,
      );
  }
  const requiresPrescription = stocks.some((s) => s.product.regulation === "PRESCRIPTION");
  if (requiresPrescription && input.fulfillment === "DELIVERY")
    throw new ServiceError(
      "REGULATED",
      "Les produits sur ordonnance se retirent en pharmacie, où l'ordonnance originale est vérifiée par le pharmacien.",
    );

  const subtotal = stocks.reduce((sum, s) => sum + s.price * merged.get(s.productId)!, 0);
  const deliveryFee = input.fulfillment === "DELIVERY" ? pharmacy.deliveryFee : 0;
  const online = input.paymentMethod !== "CASH";
  const status: OrderStatus = requiresPrescription ? "PRESCRIPTION_REVIEW" : online ? "AWAITING_PAYMENT" : "PLACED";

  const token = randomToken();
  const nonce = newNonce();
  const order = await db.order.create({
    data: {
      publicRef: await uniqueRef(),
      status,
      pharmacyId: pharmacy.id,
      customerId: ctx.customerId ?? null,
      fulfillment: input.fulfillment,
      slot: input.slot,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email ?? null,
      notifyChannel: input.notifyChannel,
      deliveryAddress: input.fulfillment === "DELIVERY" ? input.deliveryAddress : null,
      deliveryNotes: input.fulfillment === "DELIVERY" ? input.deliveryNotes || null : null,
      requiresPrescription,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      currency: currency(pharmacy.country),
      trackingTokenHash: hashToken(token),
      trackingExpiresAt: new Date(Date.now() + TTL.tracking),
      handoverNonce: nonce,
      requestId: ctx.requestId ?? null,
      clientIpHash: fp,
      items: {
        create: stocks.map((s) => ({
          productId: s.productId,
          productName: `${s.product.name}${s.product.strength ? ` ${s.product.strength}` : ""}`,
          unitPrice: s.price,
          quantity: merged.get(s.productId)!,
          regulation: s.product.regulation,
        })),
      },
      events: {
        create: { status, actor: "CUSTOMER", note: requiresPrescription ? "Produit sur ordonnance : validation du pharmacien requise." : null },
      },
      payments: {
        create: {
          method: input.paymentMethod,
          provider: online ? onlineProvider() : "cash",
          amount: subtotal + deliveryFee,
        },
      },
    },
  });

  const code = handoverCode(order.id, nonce);
  const what = input.fulfillment === "PICKUP" ? "retrait" : "remise";
  await notifyOrder(
    order,
    "ORDER_RECEIVED",
    `Pharma AI Connect : commande ${order.publicRef} enregistrée chez ${pharmacy.name} (${formatMoney(order.total, order.currency)}). Code de ${what} : ${code}, à ne communiquer qu'au moment de la ${what}.`,
    token,
  );
  return { order, token, handoverCode: code };
}

async function setStatus(
  orderId: string,
  status: OrderStatus,
  actor: string,
  note?: string | null,
  extra: Prisma.OrderUpdateInput = {},
) {
  const [order] = await db.$transaction([
    db.order.update({
      where: { id: orderId },
      data: { ...extra, status, trackingExpiresAt: new Date(Date.now() + TTL.tracking) },
    }),
    db.orderEvent.create({ data: { orderId, status, actor, note: note ?? null } }),
  ]);
  const body = NOTICE[status]?.(order.publicRef, order);
  if (body) await notifyOrder(order, status, body);
  return order;
}

async function loadForPharmacy(pharmacyId: string, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, pharmacyId }, include: { payments: true } });
  if (!order) throw new ServiceError("NOT_FOUND", "Commande introuvable.");
  return order;
}

/** Remboursement des paiements en ligne déjà encaissés (prestataire simulé : immédiat). */
async function refundIfPaid(orderId: string) {
  const paid = await db.payment.findMany({ where: { orderId, status: "CONFIRMED", method: { not: "CASH" } } });
  for (const p of paid) {
    await db.payment.update({ where: { id: p.id }, data: { status: "REFUNDED" } });
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await notifyOrder(o, "PAYMENT_REFUNDED", `Le paiement de votre commande ${o.publicRef} (${formatMoney(p.amount, o.currency)}) a été remboursé.`);
  }
  // Un paiement encore en attente est simplement annulé.
  await db.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

export async function pharmacyAdvance(
  pharmacyId: string,
  orderId: string,
  next: OrderStatus,
  opts: { note?: string; courierName?: string } = {},
) {
  const order = await loadForPharmacy(pharmacyId, orderId);
  if (!allowedNext(order).includes(next))
    throw new ServiceError("TRANSITION", `Impossible de passer de « ${STATUS_LABEL[order.status]} » à « ${STATUS_LABEL[next]} ».`);
  if (next === "COURIER_ASSIGNED" && !opts.courierName?.trim())
    throw new ServiceError("COURIER", "Indiquez le nom du livreur.");
  if (next === "CANCELLED") await refundIfPaid(order.id);
  return setStatus(order.id, next, "PHARMACY", opts.note, next === "COURIER_ASSIGNED" ? { courierName: opts.courierName!.trim() } : {});
}

/** Validation de l'ordonnance (ou refus) par le pharmacien, avant tout paiement. */
export async function reviewPrescription(pharmacyId: string, orderId: string, approve: boolean, note?: string) {
  const order = await loadForPharmacy(pharmacyId, orderId);
  if (order.status !== "PRESCRIPTION_REVIEW") throw new ServiceError("TRANSITION", "Cette commande n'attend pas de validation.");
  if (!approve) {
    await refundIfPaid(order.id);
    return setStatus(order.id, "CANCELLED", "PHARMACY", note || "Ordonnance non validée par le pharmacien.");
  }
  const online = order.payments.some((p) => p.method !== "CASH" && p.status === "PENDING");
  const next: OrderStatus = online ? "AWAITING_PAYMENT" : "CONFIRMED";
  const updated = await setStatus(order.id, next, "PHARMACY", note || "Demande validée. Ordonnance originale à présenter au retrait.", {
    prescriptionCheckedAt: new Date(),
  });
  if (online)
    await notifyOrder(updated, "PRESCRIPTION_APPROVED", `Le pharmacien a validé votre commande ${updated.publicRef}. Vous pouvez maintenant la payer.`);
  return updated;
}

/** Annulation par le client (porteur du lien de suivi) tant que la préparation n'a pas commencé. */
export async function customerCancel(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!["PRESCRIPTION_REVIEW", "AWAITING_PAYMENT", "PLACED", "CONFIRMED"].includes(order.status))
    throw new ServiceError("TRANSITION", "La préparation a commencé : contactez la pharmacie pour annuler.");
  await refundIfPaid(order.id);
  return setStatus(order.id, "CANCELLED", "CUSTOMER", "Annulée par le client.");
}

/**
 * Remise au client : le code n'est valable qu'une fois et seulement pour cette opération.
 * Cinq essais faux bloquent la remise ; la pharmacie doit alors régénérer un code.
 */
export async function completeHandover(pharmacyId: string | { courierId: string }, orderId: string, code: string) {
  const order =
    typeof pharmacyId === "string"
      ? await loadForPharmacy(pharmacyId, orderId)
      : await db.order.findFirst({ where: { id: orderId, courierId: pharmacyId.courierId }, include: { payments: true } });
  if (!order) throw new ServiceError("NOT_FOUND", "Commande introuvable.");
  const actor = typeof pharmacyId === "string" ? "PHARMACY" : "COURIER";
  const expected: OrderStatus = order.fulfillment === "PICKUP" ? "READY_FOR_PICKUP" : "OUT_FOR_DELIVERY";
  if (order.status !== expected) throw new ServiceError("TRANSITION", "La commande n'est pas prête à être remise.");
  if (order.handoverCodeUsedAt) throw new ServiceError("USED", "Ce code a déjà été utilisé.");
  if (order.handoverAttempts >= 5) throw new ServiceError("LOCKED", "Trop d'essais : régénérez un code pour ce client.");
  if (code.trim() !== handoverCode(order.id, order.handoverNonce)) {
    await db.order.update({ where: { id: order.id }, data: { handoverAttempts: { increment: 1 } } });
    throw new ServiceError("BAD_CODE", "Code incorrect.");
  }
  if (order.requiresPrescription && !order.prescriptionCheckedAt)
    throw new ServiceError("PRESCRIPTION", "Vérifiez l'ordonnance originale avant la remise.");
  const active = order.payments.filter((p) => p.status === "PENDING" || p.status === "CONFIRMED");
  if (active.some((p) => p.method !== "CASH" && p.status !== "CONFIRMED"))
    throw new ServiceError("UNPAID", "Le paiement en ligne n'est pas confirmé.");
  // Paiement à la remise : encaissé à cet instant.
  await db.payment.updateMany({ where: { orderId: order.id, method: "CASH", status: "PENDING" }, data: { status: "CONFIRMED" } });
  return setStatus(order.id, order.fulfillment === "PICKUP" ? "COLLECTED" : "DELIVERED", actor, null, {
    handoverCodeUsedAt: new Date(),
  });
}

/** Nouveau code de remise (ex. client bloqué après plusieurs essais) : l'ancien cesse de fonctionner. */
export async function regenerateHandoverCode(orderId: string) {
  const nonce = newNonce();
  const o = await db.order.update({ where: { id: orderId }, data: { handoverNonce: nonce, handoverAttempts: 0 } });
  const code = handoverCode(o.id, nonce);
  await notifyOrder(o, "HANDOVER_CODE", `Nouveau code de remise pour votre commande ${o.publicRef} : ${code}.`);
  return code;
}

// ---------- Paiement en ligne ----------

/**
 * Résultat d'un paiement en ligne. Avec le prestataire « sandbox », il est déclenché par la page de
 * paiement simulée ; avec un vrai prestataire, par son webhook signé.
 */
export async function applyPaymentResult(paymentId: string, result: "CONFIRMED" | "FAILED" | "CANCELLED") {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw new ServiceError("NOT_FOUND", "Paiement introuvable.");
  if (payment.status !== "PENDING") throw new ServiceError("PAYMENT_STATE", "Ce paiement a déjà été traité.");
  if (payment.order.status !== "AWAITING_PAYMENT") throw new ServiceError("TRANSITION", "Cette commande n'attend pas de paiement.");
  await db.payment.update({ where: { id: payment.id }, data: { status: result, providerRef: payment.providerRef ?? `SBX-${Date.now()}` } });
  const o = payment.order;
  if (result === "CONFIRMED") {
    const next: OrderStatus = o.prescriptionCheckedAt ? "CONFIRMED" : "PLACED";
    await setStatus(o.id, next, "PAYMENT", "Paiement confirmé.");
    await notifyOrder(o, "PAYMENT_CONFIRMED", `Paiement reçu pour votre commande ${o.publicRef} (${formatMoney(payment.amount, o.currency)}).`);
  } else {
    await notifyOrder(
      o,
      result === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_CANCELLED",
      `Le paiement de votre commande ${o.publicRef} ${result === "FAILED" ? "a échoué" : "a été annulé"}. Vous pouvez réessayer depuis votre lien de suivi.`,
    );
  }
}

/** Nouvelle tentative de paiement (ou passage au paiement à la remise si la pharmacie l'accepte). */
export async function retryPayment(orderId: string, method: "CASH" | "MOBILE_MONEY" | "CARD") {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { pharmacy: true, payments: true } });
  if (o.status !== "AWAITING_PAYMENT") throw new ServiceError("TRANSITION", "Cette commande n'attend pas de paiement.");
  if (!availableMethods(o.pharmacy.paymentMethods).includes(method))
    throw new ServiceError("PAYMENT", "Ce moyen de paiement n'est pas proposé par cette pharmacie.");
  await db.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
  const payment = await db.payment.create({
    data: { orderId, method, provider: method === "CASH" ? "cash" : onlineProvider(), amount: o.total },
  });
  if (method === "CASH") await setStatus(o.id, o.prescriptionCheckedAt ? "CONFIRMED" : "PLACED", "CUSTOMER", "Paiement à la remise choisi.");
  return payment;
}

export function isFinal(status: OrderStatus) {
  return FINAL.includes(status);
}

/** Message lié à une commande (client porteur du lien, ou pharmacie). */
export async function addOrderMessage(orderId: string, author: "CUSTOMER" | "PHARMACY", body: string) {
  const text = body.trim();
  if (!text || text.length > 1000) throw new ServiceError("INVALID", "Message vide ou trop long.");
  if (!(await rateLimit(`omsg:${orderId}:${author}`, 30, 3600_000))) throw new ServiceError("RATE", "Trop de messages. Patientez un peu.");
  await db.message.create({ data: { orderId, author, body: text } });
  if (author === "PHARMACY") {
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await notifyOrder(o, "PHARMACY_MESSAGE", `La pharmacie vous a écrit au sujet de votre commande ${o.publicRef}.`);
  }
}

// ---------- Livreurs ----------

const OPEN_FOR_COURIERS: OrderStatus[] = ["CONFIRMED", "PREPARING"];

/** Missions libres : commandes à livrer, confirmées par la pharmacie, sans livreur. */
export function openMissions() {
  return db.order.findMany({
    where: { fulfillment: "DELIVERY", courierId: null, status: { in: OPEN_FOR_COURIERS } },
    include: { pharmacy: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Acceptation d'une mission : un seul livreur peut l'obtenir, même en cas de clics simultanés. */
export async function courierAccept(courierId: string, orderId: string) {
  const courier = await db.courier.findFirst({ where: { id: courierId, active: true } });
  if (!courier) throw new ServiceError("AUTH", "Compte livreur inactif.");
  const { count } = await db.order.updateMany({
    where: { id: orderId, fulfillment: "DELIVERY", courierId: null, status: { in: OPEN_FOR_COURIERS } },
    data: { courierId },
  });
  if (!count) throw new ServiceError("TAKEN", "Cette mission n'est plus disponible.");
  return setStatus(orderId, "COURIER_ASSIGNED", "COURIER", null, { courierName: courier.name });
}

const COURIER_NEXT: Partial<Record<OrderStatus, OrderStatus>> = { COURIER_ASSIGNED: "PICKED_UP", PICKED_UP: "OUT_FOR_DELIVERY" };

export async function courierAdvance(courierId: string, orderId: string) {
  const o = await db.order.findFirst({ where: { id: orderId, courierId } });
  if (!o) throw new ServiceError("NOT_FOUND", "Mission introuvable.");
  const next = COURIER_NEXT[o.status];
  if (!next) throw new ServiceError("TRANSITION", "Aucune étape suivante pour cette mission.");
  return setStatus(o.id, next, "COURIER");
}

export function missionLabel(missionNo: number) {
  return `PA-${String(missionNo).padStart(4, "0")}`;
}
