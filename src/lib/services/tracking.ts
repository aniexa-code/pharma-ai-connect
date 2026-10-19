// Suivi sans compte. La référence de commande seule ne donne JAMAIS accès à la commande :
// il faut le jeton secret du lien de suivi, ou un code à usage limité envoyé au contact de la commande.
import { db } from "../db";
import { TTL } from "../config";
import { handoverCode, hashCode, hashToken, looksLikeToken, newNonce, numericCode, safeEqual, trackingToken } from "../crypto";
import { ServiceError } from "../errors";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { normalizePhone, type Channel } from "../validation";

/** Commande correspondant à un jeton de suivi valide (non expiré, non révoqué), sinon null. */
export async function orderByTrackingToken(token: string) {
  if (!looksLikeToken(token)) return null;
  const order = await db.order.findUnique({
    where: { trackingTokenHash: hashToken(token) },
    include: {
      pharmacy: true,
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      notifications: { orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || order.trackingRevokedAt || order.trackingExpiresAt < new Date()) return null;
  return order;
}

export type TrackedOrder = NonNullable<Awaited<ReturnType<typeof orderByTrackingToken>>>;

export function visibleHandoverCode(o: Pick<TrackedOrder, "id" | "handoverNonce" | "handoverCodeUsedAt" | "status">) {
  if (o.handoverCodeUsedAt || o.status === "CANCELLED") return null;
  return handoverCode(o.id, o.handoverNonce);
}

/** Remplace le lien de suivi : l'ancien cesse immédiatement de fonctionner. */
export async function rotateTrackingToken(orderId: string) {
  const nonce = newNonce();
  const token = trackingToken(nonce);
  await db.order.update({
    where: { id: orderId },
    data: { trackingNonce: nonce, trackingTokenHash: hashToken(token), trackingExpiresAt: new Date(Date.now() + TTL.tracking), trackingRevokedAt: null },
  });
  return token;
}

/** Désactive le lien de suivi sans en émettre de nouveau (ex. lien partagé par erreur). */
export async function revokeTracking(orderId: string) {
  await db.order.update({ where: { id: orderId }, data: { trackingRevokedAt: new Date() } });
}

const GENERIC =
  "Si ces informations correspondent à une commande, un code vient d'être envoyé au contact utilisé lors de la commande.";

/**
 * Lien de suivi perdu : la personne donne la référence ET le numéro utilisé. La réponse est
 * identique que la commande existe ou non, pour ne rien révéler.
 */
export async function requestCode(
  purpose: "RECOVER_TRACKING" | "CLAIM_ORDER",
  publicRef: string,
  phoneRaw: string,
  ip = "unknown",
): Promise<{ message: string; demoCode?: string }> {
  const ref = publicRef.trim().toUpperCase();
  const phone = normalizePhone(phoneRaw);
  if (!(await rateLimit(`code:ip:${ip}`, 10, 3600_000)) || !(await rateLimit(`code:ref:${ref}`, 5, 3600_000)))
    throw new ServiceError("RATE", "Trop de demandes. Réessayez dans une heure.");
  const order = await db.order.findUnique({ where: { publicRef: ref } });
  if (!order || !phonesMatch(order.phone, phone)) return { message: GENERIC };

  const code = numericCode();
  await db.verificationCode.updateMany({ where: { orderId: order.id, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await db.verificationCode.create({
    data: { orderId: order.id, purpose, codeHash: hashCode(purpose, code), expiresAt: new Date(Date.now() + TTL.code) },
  });
  // Le code part sur le canal de la commande ; sans canal direct (lien seul), par SMS au numéro de la commande.
  const channel: Channel = order.notifyChannel === "LINK" ? "SMS" : (order.notifyChannel as Channel);
  const n = await notify({
    orderId: order.id,
    channel,
    phone: order.phone,
    email: order.email,
    event: purpose,
    body: `Pharma AI Connect : votre code pour la commande ${order.publicRef} est ${code}. Valable 10 minutes. Ne le communiquez à personne.`,
  });
  return { message: GENERIC, demoCode: n.status === "SENT" ? undefined : code };
}

function phonesMatch(stored: string, given: string) {
  const a = stored.replace(/\D/g, "");
  const b = given.replace(/\D/g, "");
  // Tolère l'indicatif pays : on compare les 8 derniers chiffres, avec au moins 8 chiffres saisis.
  return b.length >= 8 && safeEqual(a.slice(-8), b.slice(-8));
}

/** Vérifie un code à usage limité : 5 essais, 10 minutes, une seule utilisation. Renvoie l'id de commande. */
export async function consumeCode(purpose: "RECOVER_TRACKING" | "CLAIM_ORDER", publicRef: string, code: string) {
  const order = await db.order.findUnique({ where: { publicRef: publicRef.trim().toUpperCase() }, select: { id: true } });
  const fail = new ServiceError("BAD_CODE", "Code invalide ou expiré.");
  if (!order) throw fail;
  const vc = await db.verificationCode.findFirst({
    where: { orderId: order.id, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!vc || vc.attempts >= 5) throw fail;
  if (!safeEqual(vc.codeHash, hashCode(purpose, code.trim()))) {
    await db.verificationCode.update({ where: { id: vc.id }, data: { attempts: { increment: 1 } } });
    throw fail;
  }
  await db.verificationCode.update({ where: { id: vc.id }, data: { usedAt: new Date() } });
  return order.id;
}

/** Code correct : un nouveau lien de suivi est émis et l'ancien est révoqué. */
export async function recoverTracking(publicRef: string, code: string) {
  const orderId = await consumeCode("RECOVER_TRACKING", publicRef, code);
  return rotateTrackingToken(orderId);
}
