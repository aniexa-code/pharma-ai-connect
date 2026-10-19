// Commandes invitées : création, cycle de vie, paiement, remise.
// Aucune fonction ici n'exige de compte client ; le rattachement est géré dans accounts.ts.
import type { FulfillmentMode, ItemAnswer, Order, OrderStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { TTL, currency, formatMoney, siteUrl } from "../config";
import { handoverCode, hashToken, ipFingerprint, newNonce, publicRef, trackingToken } from "../crypto";
import { ServiceError } from "../errors";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { getSettings } from "../settings";
import { deliveryQuoteFor, serviceFeeFor } from "./fees";
import { recordCompletion } from "./ledger";
import { firstIssue, orderInput, type Channel, type OrderInput } from "../validation";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PRESCRIPTION_REVIEW: "Ordonnance à valider par le pharmacien",
  AWAITING_PAYMENT: "En attente de paiement",
  PLACED: "Transmise, vérification en pharmacie",
  AWAITING_CUSTOMER: "Vérifiée, en attente du client",
  CONFIRMED: "Confirmée",
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

export const ANSWER_LABEL: Record<ItemAnswer, string> = {
  AVAILABLE: "Disponible",
  INSUFFICIENT: "Quantité insuffisante",
  UNAVAILABLE: "Indisponible",
  NEEDS_PHARMACIST: "Nécessite validation du pharmacien",
  OTHER: "Autre précision",
};

export const MODE_LABEL: Record<FulfillmentMode, string> = {
  PICKUP_ONLY: "Retrait en pharmacie uniquement",
  DELIVERY_ONLY: "Livraison uniquement",
  BOTH: "Retrait ou livraison",
};

/** Qui doit agir pour que la commande avance : affiché au client, à la pharmacie et au livreur. */
export function responsibleFor(o: Pick<Order, "status" | "fulfillment">): { who: string; what: string; you?: string } | null {
  switch (o.status) {
    case "PLACED":
    case "PRESCRIPTION_REVIEW":
      return { who: "La pharmacie", what: "vérifie physiquement la disponibilité de chaque produit" };
    case "AWAITING_CUSTOMER":
      return { who: "Le client", what: "confirme la commande et choisit retrait ou livraison", you: "confirmez la commande et choisissez retrait ou livraison" };
    case "AWAITING_PAYMENT":
      return { who: "Le client", what: "règle la commande en ligne", you: "réglez la commande en ligne" };
    case "CONFIRMED":
    case "PREPARING":
      return o.fulfillment === "PICKUP" ? { who: "La pharmacie", what: "prépare la commande" } : { who: "La pharmacie", what: "prépare la commande et attend un livreur" };
    case "READY_FOR_PICKUP":
      return { who: "Le client", what: "vient retirer la commande avec son code", you: "venez retirer la commande avec votre code" };
    case "COURIER_ASSIGNED":
      return { who: "Le livreur", what: "se rend à la pharmacie" };
    case "PICKED_UP":
    case "OUT_FOR_DELIVERY":
      return { who: "Le livreur", what: "apporte la commande au client" };
    default:
      return null;
  }
}

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Paiement à la remise (espèces)",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Carte bancaire",
};

const FINAL: OrderStatus[] = ["DELIVERED", "COLLECTED", "CANCELLED"];

/** Transitions autorisées côté pharmacie (la remise finale passe par completeHandover). */
const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  // La confirmation passe par la vérification physique (verifyOrder), puis l'accord du client.
  PLACED: ["CANCELLED"],
  AWAITING_CUSTOMER: ["CANCELLED"],
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
  CONFIRMED: (r) => `Votre commande ${r} est confirmée.`,
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
  const t = token ?? (o.trackingNonce && !o.trackingRevokedAt ? trackingToken(o.trackingNonce) : null);
  const link = t ? ` Suivi : ${trackingUrl(t)}` : " Suivez-la avec votre lien de suivi.";
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
  ctx: { ip?: string; customerId?: string | null; requestId?: string | null; honeypot?: string; checkoutId?: string } = {},
): Promise<CreatedOrder> {
  // Champ piège invisible : un robot qui le remplit est ignoré.
  if (ctx.honeypot) throw new ServiceError("BOT", "Commande refusée.");
  const parsed = orderInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const input = parsed.data;

  // Protection contre les commandes en rafale (par appareil et par numéro).
  // Un panier validé est limité une fois pour toutes ses commandes (voir checkout.ts).
  const fp = ctx.ip ? ipFingerprint(ctx.ip) : null;
  if (!ctx.checkoutId) {
    if (fp && !(await rateLimit(`order:ip:${fp}`, 10, 3600_000)))
      throw new ServiceError("RATE", "Trop de commandes depuis cet appareil. Réessayez plus tard ou appelez la pharmacie.");
    if (!(await rateLimit(`order:phone:${input.phone}`, 5, 3600_000)))
      throw new ServiceError("RATE", "Trop de commandes pour ce numéro en peu de temps. Réessayez plus tard.");
  }

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
  // Les frais sont calculés à la confirmation du client, une fois la pharmacie et l'adresse connues.
  const deliveryFee = 0;
  // Le stock numérique n'engage pas la pharmacie : toute commande commence par une vérification physique.
  // Rien n'est payé avant que la pharmacie ait confirmé et que le client ait donné son accord.
  const status: OrderStatus = "PLACED";

  const trackingNonce = newNonce();
  const token = trackingToken(trackingNonce);
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
      trackingNonce,
      paymentPreference: input.paymentMethod,
      checkoutId: ctx.checkoutId ?? null,
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
        create: {
          status,
          actor: "CUSTOMER",
          note: requiresPrescription ? "Transmise à la pharmacie. Produit sur ordonnance : validation du pharmacien requise." : "Transmise à la pharmacie pour vérification physique.",
        },
      },
    },
  });

  const code = handoverCode(order.id, nonce);
  await notifyOrder(
    order,
    "ORDER_RECEIVED",
    `Pharma AI Connect : commande ${order.publicRef} transmise à ${pharmacy.name}. La pharmacie vérifie la disponibilité réelle des produits ; vous serez prévenu pour confirmer.`,
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
  notice = true,
) {
  const [order] = await db.$transaction([
    db.order.update({
      where: { id: orderId },
      data: { ...extra, status, trackingExpiresAt: new Date(Date.now() + TTL.tracking) },
    }),
    db.orderEvent.create({ data: { orderId, status, actor, note: note ?? null } }),
  ]);
  const body = notice ? NOTICE[status]?.(order.publicRef, order) : undefined;
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
  return setStatus(order.id, next, "PHARMACY", opts.note, {
    ...(next === "COURIER_ASSIGNED" ? { courierName: opts.courierName!.trim() } : {}),
    // La pharmacie remet elle-même la commande à son propre livreur : sa part est close.
    ...(next === "PICKED_UP" ? { pharmacyClosedAt: new Date() } : {}),
  });
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

// ---------- Vérification physique puis accord du client ----------

export type ItemCheck = { answer: ItemAnswer; quantity?: number | null; price?: number | null; note?: string | null };

/** Produits retenus après vérification (disponibles, ou disponibles en quantité réduite). */
function retainedQty(i: { answer: ItemAnswer | null; confirmedQty: number | null; quantity: number }) {
  if (i.answer === "AVAILABLE") return i.quantity;
  if (i.answer === "INSUFFICIENT") return i.confirmedQty ?? 0;
  return 0;
}

/**
 * La pharmacie a vérifié en rayon chaque produit commandé et indique les modes de remise acceptés.
 * Seule une réponse explicite engage la pharmacie : le stock numérique reste indicatif.
 */
export async function verifyOrder(
  pharmacyId: string,
  userId: string,
  orderId: string,
  input: { items: Record<string, ItemCheck>; modes: FulfillmentMode; pharmacistApproval?: boolean },
) {
  const order = await db.order.findFirst({ where: { id: orderId, pharmacyId }, include: { items: true, pharmacy: true } });
  if (!order) throw new ServiceError("NOT_FOUND", "Commande introuvable.");
  if (order.status !== "PLACED" && order.status !== "PRESCRIPTION_REVIEW") throw new ServiceError("TRANSITION", "Cette commande a déjà été vérifiée.");

  const updates = order.items.map((item) => {
    const c = input.items[item.id];
    if (!c) throw new ServiceError("INVALID", `Indiquez une réponse pour ${item.productName}.`);
    let confirmedQty: number | null = null;
    if (c.answer === "INSUFFICIENT") {
      confirmedQty = Number(c.quantity);
      if (!Number.isInteger(confirmedQty) || confirmedQty < 1 || confirmedQty >= item.quantity)
        throw new ServiceError("INVALID", `${item.productName} : indiquez la quantité réellement disponible (entre 1 et ${item.quantity - 1}).`);
    }
    if (c.answer === "OTHER" && !c.note?.trim()) throw new ServiceError("INVALID", `${item.productName} : précisez votre réponse.`);
    const price = c.price === null || c.price === undefined || c.price === 0 ? item.unitPrice : Math.round(c.price);
    if (!Number.isInteger(price) || price <= 0) throw new ServiceError("INVALID", `${item.productName} : prix invalide.`);
    return { item, answer: c.answer, confirmedQty, price, note: c.note?.trim().slice(0, 300) || null };
  });

  const retained = updates.filter((u) => retainedQty({ answer: u.answer, confirmedQty: u.confirmedQty, quantity: u.item.quantity }) > 0);
  const prescription = retained.some((u) => u.item.regulation === "PRESCRIPTION");
  if (prescription && !input.pharmacistApproval)
    throw new ServiceError("PRESCRIPTION", "Un produit sur ordonnance est retenu : validez en tant que pharmacien, ou répondez « Nécessite validation du pharmacien ».");

  let modes = input.modes;
  if (modes !== "PICKUP_ONLY" && !order.pharmacy.offersDelivery) throw new ServiceError("FULFILLMENT", "Votre pharmacie ne propose pas la livraison.");
  if (modes !== "DELIVERY_ONLY" && !order.pharmacy.offersPickup) throw new ServiceError("FULFILLMENT", "Votre pharmacie ne propose pas le retrait.");
  if (prescription) {
    if (modes === "DELIVERY_ONLY") throw new ServiceError("REGULATED", "Les produits sur ordonnance se retirent en pharmacie, sur présentation de l'ordonnance originale.");
    modes = "PICKUP_ONLY";
  }

  const subtotal = retained.reduce((n, u) => n + u.price * retainedQty({ answer: u.answer, confirmedQty: u.confirmedQty, quantity: u.item.quantity }), 0);
  const now = new Date();
  await db.$transaction([
    ...updates.map((u) =>
      db.orderItem.update({ where: { id: u.item.id }, data: { answer: u.answer, confirmedQty: u.confirmedQty, answerNote: u.note, unitPrice: u.price } }),
    ),
    db.order.update({
      where: { id: order.id },
      data: {
        verifiedAt: now,
        verifiedById: userId,
        allowedModes: modes,
        requiresPrescription: prescription,
        prescriptionCheckedAt: prescription ? now : null,
        subtotal,
        total: subtotal,
        deliveryFee: 0,
      },
    }),
  ]);
  if (!retained.length) return setStatus(order.id, "CANCELLED", "PHARMACY", "Aucun produit disponible après vérification en pharmacie.");
  const updated = await setStatus(order.id, "AWAITING_CUSTOMER", "PHARMACY", `Disponibilité vérifiée physiquement. ${MODE_LABEL[modes]}.`);
  await notifyOrder(
    updated,
    "ORDER_VERIFIED",
    `${order.pharmacy.name} a vérifié votre commande ${updated.publicRef} : ${formatMoney(subtotal, updated.currency)} de produits disponibles. Confirmez-la et choisissez retrait ou livraison.`,
  );
  return updated;
}

/** Modes de remise que le client peut choisir pour une commande vérifiée. */
export function customerModes(o: { allowedModes: FulfillmentMode | null; requiresPrescription: boolean }) {
  const m = o.allowedModes ?? "PICKUP_ONLY";
  const out: ("PICKUP" | "DELIVERY")[] = [];
  if (m !== "DELIVERY_ONLY") out.push("PICKUP");
  if (m !== "PICKUP_ONLY" && !o.requiresPrescription) out.push("DELIVERY");
  return out;
}

/**
 * « Je confirme ma commande » : le client accepte les produits et prix confirmés par la pharmacie,
 * choisit retrait ou livraison, puis paie. Son accord est horodaté dans l'historique.
 */
export async function customerConfirm(
  orderId: string,
  input: { fulfillment: "PICKUP" | "DELIVERY"; slot: string; paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD"; deliveryAddress?: string; deliveryNotes?: string },
) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { pharmacy: true } });
  if (!o) throw new ServiceError("NOT_FOUND", "Commande introuvable.");
  if (o.status !== "AWAITING_CUSTOMER") throw new ServiceError("TRANSITION", "Cette commande n'attend pas votre confirmation.");
  if (!customerModes(o).includes(input.fulfillment))
    throw new ServiceError("FULFILLMENT", input.fulfillment === "DELIVERY" ? "La pharmacie n'autorise que le retrait pour cette commande." : "La pharmacie n'autorise que la livraison pour cette commande.");
  const slot = input.slot.trim().slice(0, 60);
  if (!slot) throw new ServiceError("INVALID", "Choisissez un créneau.");
  const address = input.deliveryAddress?.trim().slice(0, 200) ?? "";
  if (input.fulfillment === "DELIVERY" && address.length < 5) throw new ServiceError("INVALID", "Indiquez l'adresse ou le point de livraison.");
  if (!availableMethods(o.pharmacy.paymentMethods).includes(input.paymentMethod))
    throw new ServiceError("PAYMENT", "Ce moyen de paiement n'est pas proposé par cette pharmacie.");
  if (input.fulfillment === "DELIVERY" && input.paymentMethod === "CASH")
    throw new ServiceError("PAYMENT", "Une livraison se règle en ligne : choisissez Mobile Money ou carte.");

  // Frais calculés par le moteur, d'après les réglages du pays, puis figés sur la commande.
  const settings = await getSettings(o.pharmacy.country);
  const quote = input.fulfillment === "DELIVERY" ? await deliveryQuoteFor(o.pharmacy, address, settings) : null;
  if (quote?.outOfRange)
    throw new ServiceError("FULFILLMENT", `Cette adresse est à ${quote.distanceKm} km de la pharmacie, au-delà de sa zone de livraison (${o.pharmacy.deliveryRadiusKm} km). Choisissez le retrait ou une autre adresse.`);
  const serviceFee = await serviceFeeFor(o, settings.fees);
  const deliveryFee = quote ? quote.fee : 0;
  const total = o.subtotal + deliveryFee + serviceFee;
  const fees = {
    serviceFee,
    deliveryDistanceKm: quote ? quote.distanceKm : null,
    deliveryCommission: quote ? quote.commission : 0,
    courierEarning: quote ? quote.courierEarning : 0,
    feeBreakdown: quote ? { base: quote.base, distance: quote.distance, night: quote.night, estimated: quote.estimated, commissionPct: settings.delivery.commissionPct } : undefined,
  };
  const online = input.paymentMethod !== "CASH";
  const next: OrderStatus = online ? "AWAITING_PAYMENT" : "CONFIRMED";
  // Un seul accord possible, même en cas de double clic.
  const claimed = await db.order.updateMany({ where: { id: o.id, status: "AWAITING_CUSTOMER" }, data: { customerConfirmedAt: new Date() } });
  if (claimed.count !== 1) throw new ServiceError("TRANSITION", "Cette commande a déjà été confirmée.");
  await db.payment.create({ data: { orderId: o.id, method: input.paymentMethod, provider: online ? onlineProvider() : "cash", amount: total } });
  const updated = await setStatus(o.id, next, "CUSTOMER", "Autorisation client : CONFIRMÉE.", {
    fulfillment: input.fulfillment,
    slot,
    deliveryAddress: input.fulfillment === "DELIVERY" ? address : null,
    deliveryNotes: input.fulfillment === "DELIVERY" ? input.deliveryNotes?.trim().slice(0, 300) || null : null,
    deliveryFee,
    total,
    ...fees,
  }, false);
  const what = input.fulfillment === "PICKUP" ? "retrait" : "remise";
  await notifyOrder(
    updated,
    "ORDER_CONFIRMED_BY_CUSTOMER",
    `Commande ${updated.publicRef} confirmée (${formatMoney(total, updated.currency)}). Code de ${what} : ${handoverCode(updated.id, updated.handoverNonce)}, à ne communiquer qu'au moment de la ${what}.`,
  );
  return updated;
}

/** Annulation par le client (porteur du lien de suivi) tant que la préparation n'a pas commencé. */
export async function customerCancel(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!["PRESCRIPTION_REVIEW", "AWAITING_PAYMENT", "PLACED", "AWAITING_CUSTOMER", "CONFIRMED"].includes(order.status))
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
  const now = new Date();
  // La validation du code vaut clôture pour celui qui remet la commande (pharmacie au comptoir, ou livreur).
  const done = await setStatus(order.id, order.fulfillment === "PICKUP" ? "COLLECTED" : "DELIVERED", actor, null, {
    handoverCodeUsedAt: now,
    ...(actor === "PHARMACY" ? { pharmacyClosedAt: order.pharmacyClosedAt ?? now } : { courierClosedAt: now }),
  });
  await recordCompletion(done);
  await notifyOrder(done, "CLOSE_REQUEST", `Avez-vous bien reçu votre commande ${done.publicRef} ? Confirmez-le, ou signalez un problème, depuis votre lien de suivi.`);
  return done;
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
    const next: OrderStatus = o.verifiedAt || o.prescriptionCheckedAt ? "CONFIRMED" : "PLACED";
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
  if (method === "CASH" && o.fulfillment === "DELIVERY" && o.verifiedAt)
    throw new ServiceError("PAYMENT", "Une livraison se règle en ligne : choisissez Mobile Money ou carte.");
  if (method === "CASH") await setStatus(o.id, o.verifiedAt || o.prescriptionCheckedAt ? "CONFIRMED" : "PLACED", "CUSTOMER", "Paiement à la remise choisi.");
  return payment;
}

// ---------- Clôture par toutes les parties ----------

/** Parties qui doivent clôturer la commande : pharmacie, livreur (s'il y en a un sur la plateforme) et client. */
export function closureParties(o: Pick<Order, "courierId" | "pharmacyClosedAt" | "courierClosedAt" | "customerClosedAt">) {
  return [
    { key: "pharmacy", label: "Pharmacie", at: o.pharmacyClosedAt },
    ...(o.courierId ? [{ key: "courier", label: "Livreur", at: o.courierClosedAt }] : []),
    { key: "customer", label: "Client", at: o.customerClosedAt },
  ];
}

async function tryClose(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.closedAt || !["DELIVERED", "COLLECTED"].includes(o.status)) return o;
  if (closureParties(o).some((p) => !p.at)) return o;
  const { count } = await db.order.updateMany({ where: { id: o.id, closedAt: null }, data: { closedAt: new Date() } });
  if (count) await db.orderEvent.create({ data: { orderId: o.id, status: o.status, actor: "SYSTEM", note: "Commande clôturée par toutes les parties." } });
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

/** La pharmacie confirme avoir remis la commande au livreur de la plateforme (double validation de la prise en charge). */
export async function pharmacyHandToCourier(pharmacyId: string, orderId: string) {
  const o = await loadForPharmacy(pharmacyId, orderId);
  if (!o.courierId || !["COURIER_ASSIGNED", "PICKED_UP"].includes(o.status)) throw new ServiceError("TRANSITION", "Aucun livreur n'attend cette commande.");
  if (o.pharmacyClosedAt) return o;
  await db.$transaction([
    db.order.update({ where: { id: o.id }, data: { pharmacyClosedAt: new Date() } }),
    db.orderEvent.create({ data: { orderId: o.id, status: o.status, actor: "PHARMACY", note: "Commande remise au livreur." } }),
  ]);
  return tryClose(o.id);
}

/** Le client clôture sa part : réception confirmée, ou problème signalé (la commande reste alors ouverte). */
export async function customerClose(orderId: string, received: boolean, note?: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!["DELIVERED", "COLLECTED"].includes(o.status)) throw new ServiceError("TRANSITION", "La commande ne vous a pas encore été remise.");
  if (o.customerClosedAt) throw new ServiceError("TRANSITION", "Vous avez déjà clôturé cette commande.");
  if (!received) {
    const text = note?.trim().slice(0, 1000);
    if (!text) throw new ServiceError("INVALID", "Décrivez le problème rencontré.");
    await db.$transaction([
      db.order.update({ where: { id: o.id }, data: { customerIssue: text } }),
      db.orderEvent.create({ data: { orderId: o.id, status: o.status, actor: "CUSTOMER", note: `Problème signalé : ${text}` } }),
      db.message.create({ data: { orderId: o.id, author: "CUSTOMER", body: `Problème signalé à la réception : ${text}` } }),
    ]);
    return o;
  }
  await db.$transaction([
    db.order.update({ where: { id: o.id }, data: { customerClosedAt: new Date() } }),
    db.orderEvent.create({ data: { orderId: o.id, status: o.status, actor: "CUSTOMER", note: "Réception confirmée par le client." } }),
  ]);
  return tryClose(o.id);
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
  const courier = await db.courier.findFirst({ where: { id: courierId, active: true, verificationStatus: "APPROVED" } });
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
  if (next === "OUT_FOR_DELIVERY" && !o.pharmacyClosedAt)
    throw new ServiceError("HANDOFF", "La pharmacie doit d'abord confirmer qu'elle vous a remis la commande.");
  return setStatus(o.id, next, "COURIER");
}

export function missionLabel(missionNo: number) {
  return `PA-${String(missionNo).padStart(4, "0")}`;
}
