// Validation d'un panier : une commande par pharmacie, suivies ensemble par un lien unique.
import { db } from "../db";
import { TTL } from "../config";
import { hashToken, ipFingerprint, newNonce, publicRef, trackingToken } from "../crypto";
import { ServiceError } from "../errors";
import { rateLimit } from "../rate-limit";
import type { CartLine } from "../cart";
import { firstIssue, orderInput, type OrderInput } from "../validation";
import { availableMethods, createGuestOrder } from "./orders";

export type CheckoutInput = {
  contactName: string;
  phone: string;
  email?: string;
  notifyChannel: "SMS" | "WHATSAPP" | "EMAIL" | "LINK";
  fulfillment: "PICKUP" | "DELIVERY";
  slot: string;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  deliveryAddress?: string;
  deliveryNotes?: string;
};

/** Lignes du panier enrichies depuis la base, regroupées par pharmacie. */
export async function cartView(lines: CartLine[]) {
  if (!lines.length) return [];
  const stocks = await db.stock.findMany({
    where: { OR: lines.map((l) => ({ pharmacyId: l.pharmacyId, productId: l.productId })), pharmacy: { active: true } },
    include: { product: true, pharmacy: true },
  });
  const groups = new Map<string, { pharmacy: (typeof stocks)[number]["pharmacy"]; lines: { stock: (typeof stocks)[number]; quantity: number; orderable: boolean; reason?: string }[] }>();
  for (const l of lines) {
    const s = stocks.find((x) => x.pharmacyId === l.pharmacyId && x.productId === l.productId);
    if (!s) continue;
    const reason =
      s.product.regulation === "RESTRICTED" ? "Délivrance encadrée : non commandable en ligne" : s.status === "OUT" ? "Indiqué indisponible : demandez une vérification" : undefined;
    const g = groups.get(s.pharmacyId) ?? { pharmacy: s.pharmacy, lines: [] };
    g.lines.push({ stock: s, quantity: l.quantity, orderable: !reason, reason });
    groups.set(s.pharmacyId, g);
  }
  return [...groups.values()];
}

export function checkoutUrlToken(nonce: string) {
  return trackingToken(`checkout:${nonce}`);
}

/**
 * Crée une commande par pharmacie. Chacune est ensuite vérifiée physiquement par sa pharmacie, puis
 * confirmée par le client : aucun paiement à cette étape.
 */
export async function createCheckout(lines: CartLine[], input: CheckoutInput, ctx: { ip?: string; customerId?: string | null; honeypot?: string } = {}) {
  if (ctx.honeypot) throw new ServiceError("BOT", "Commande refusée.");
  const fp = ctx.ip ? ipFingerprint(ctx.ip) : null;
  if (fp && !(await rateLimit(`checkout:ip:${fp}`, 10, 3600_000)))
    throw new ServiceError("RATE", "Trop de commandes depuis cet appareil. Réessayez plus tard ou appelez la pharmacie.");
  if (!(await rateLimit(`checkout:phone:${input.phone.replace(/\s/g, "")}`, 5, 3600_000)))
    throw new ServiceError("RATE", "Trop de commandes pour ce numéro en peu de temps. Réessayez plus tard.");
  const groups = (await cartView(lines)).map((g) => ({ ...g, lines: g.lines.filter((l) => l.orderable) })).filter((g) => g.lines.length);
  if (!groups.length) throw new ServiceError("EMPTY", "Votre panier ne contient aucun produit commandable en ligne.");

  // Toutes les commandes sont préparées et validées avant d'en créer une seule.
  const inputs: OrderInput[] = groups.map((g) => {
    const prescription = g.lines.some((l) => l.stock.product.regulation === "PRESCRIPTION");
    // Souhait du client, adapté à ce que propose chaque pharmacie (confirmé ensuite commande par commande).
    const delivery = input.fulfillment === "DELIVERY" && g.pharmacy.offersDelivery && !prescription;
    const methods = availableMethods(g.pharmacy.paymentMethods);
    const method = methods.includes(input.paymentMethod) ? input.paymentMethod : (methods[0] as CheckoutInput["paymentMethod"]);
    return {
      pharmacyId: g.pharmacy.id,
      items: g.lines.map((l) => ({ productId: l.stock.productId, quantity: l.quantity })),
      fulfillment: delivery || !g.pharmacy.offersPickup ? "DELIVERY" : "PICKUP",
      slot: input.slot,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      notifyChannel: input.notifyChannel,
      deliveryAddress: input.deliveryAddress,
      deliveryNotes: input.deliveryNotes,
      paymentMethod: method,
    };
  });
  for (const i of inputs) {
    const parsed = orderInput.safeParse(i);
    if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  }

  const nonce = newNonce();
  const token = checkoutUrlToken(nonce);
  const checkout = await db.checkout.create({
    data: { publicRef: publicRef("PAN"), trackingTokenHash: hashToken(token), trackingNonce: nonce, contactName: input.contactName.trim().slice(0, 80), phone: input.phone },
  });
  const orders = [];
  for (const i of inputs) orders.push((await createGuestOrder(i, { ip: ctx.ip, customerId: ctx.customerId, checkoutId: checkout.id })).order);
  return { checkout, token, orders };
}

/** Panier validé correspondant à un lien de suivi groupé, avec ses commandes. */
export async function checkoutByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const checkout = await db.checkout.findUnique({ where: { trackingTokenHash: hashToken(token) } });
  if (!checkout || checkout.createdAt.getTime() + TTL.tracking < Date.now()) return null;
  const orders = await db.order.findMany({ where: { checkoutId: checkout.id }, include: { pharmacy: true, items: true }, orderBy: { createdAt: "asc" } });
  return { checkout, orders };
}
