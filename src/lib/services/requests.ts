// Demandes de vérification de disponibilité et échanges avec une pharmacie, sans compte.
// Chaque demande reçoit une référence lisible (pour en parler à la pharmacie) et un lien secret
// (le seul moyen de lire la réponse et de poursuivre l'échange).
import type { RequestStatus } from "@prisma/client";
import { db } from "../db";
import { TTL, siteUrl } from "../config";
import { hashToken, looksLikeToken, publicRef, randomToken } from "../crypto";
import { ServiceError } from "../errors";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { firstIssue, requestInput, type Channel, type RequestInput } from "../validation";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "En attente de réponse",
  CONFIRMED: "Disponible, confirmé par la pharmacie",
  UNAVAILABLE: "Indisponible",
  ANSWERED: "Réponse reçue",
  CLOSED: "Clôturée",
};

export function requestUrl(token: string) {
  return `${siteUrl()}/demande/${token}`;
}

export async function createRequest(raw: RequestInput, ctx: { ip?: string; customerId?: string | null; honeypot?: string } = {}) {
  if (ctx.honeypot) throw new ServiceError("BOT", "Demande refusée.");
  const parsed = requestInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const input = parsed.data;
  if (ctx.ip && !(await rateLimit(`request:ip:${ctx.ip}`, 20, 3600_000)))
    throw new ServiceError("RATE", "Trop de demandes depuis cet appareil. Réessayez plus tard.");

  const pharmacy = await db.pharmacy.findFirst({ where: { id: input.pharmacyId, active: true } });
  if (!pharmacy) throw new ServiceError("PHARMACY", "Pharmacie introuvable.");
  const product = input.productId ? await db.product.findUnique({ where: { id: input.productId } }) : null;
  if (input.productId && !product) throw new ServiceError("PRODUCT", "Produit introuvable.");

  const token = randomToken();
  let ref = publicRef(input.kind === "VERIFICATION" ? "VER" : "MSG");
  while (await db.pharmacyRequest.findUnique({ where: { publicRef: ref }, select: { id: true } }))
    ref = publicRef(input.kind === "VERIFICATION" ? "VER" : "MSG");

  const request = await db.pharmacyRequest.create({
    data: {
      publicRef: ref,
      tokenHash: hashToken(token),
      kind: input.kind,
      pharmacyId: pharmacy.id,
      productId: product?.id ?? null,
      quantity: input.quantity,
      contactName: input.contactName,
      notifyChannel: input.notifyChannel,
      // On ne garde que la coordonnée utile au canal choisi.
      phone: input.notifyChannel === "SMS" || input.notifyChannel === "WHATSAPP" ? input.phone : null,
      email: input.notifyChannel === "EMAIL" ? input.email : null,
      customerId: ctx.customerId ?? null,
      expiresAt: new Date(Date.now() + TTL.request),
      messages: input.message ? { create: { author: "CUSTOMER", body: input.message } } : undefined,
    },
  });
  await notify({
    requestId: request.id,
    channel: request.notifyChannel as Channel,
    phone: request.phone,
    email: request.email,
    event: "REQUEST_RECEIVED",
    body: `Pharma AI Connect : votre demande ${ref} a été transmise à ${pharmacy.name}. Réponse sur : ${requestUrl(token)}`,
  });
  return { request, token };
}

export async function requestByToken(token: string) {
  if (!looksLikeToken(token)) return null;
  const r = await db.pharmacyRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      pharmacy: true,
      messages: { orderBy: { createdAt: "asc" } },
      notifications: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!r || r.expiresAt < new Date()) return null;
  const product = r.productId ? await db.product.findUnique({ where: { id: r.productId } }) : null;
  const stock = r.productId
    ? await db.stock.findUnique({ where: { pharmacyId_productId: { pharmacyId: r.pharmacyId, productId: r.productId } } })
    : null;
  return { ...r, product, stock };
}

export async function customerReply(token: string, body: string) {
  const r = await requestByToken(token);
  if (!r) throw new ServiceError("NOT_FOUND", "Lien invalide ou expiré.");
  const text = body.trim();
  if (!text || text.length > 1000) throw new ServiceError("INVALID", "Message vide ou trop long.");
  if (!(await rateLimit(`reply:${r.id}`, 30, 3600_000))) throw new ServiceError("RATE", "Trop de messages. Patientez un peu.");
  await db.message.create({ data: { requestId: r.id, author: "CUSTOMER", body: text } });
  if (r.status === "ANSWERED" || r.status === "CLOSED") await db.pharmacyRequest.update({ where: { id: r.id }, data: { status: "PENDING" } });
}

/**
 * Réponse de la pharmacie. Une confirmation met aussi à jour la disponibilité publique du produit
 * (source pharmacie, horodatée), ce qui relève son niveau de fiabilité pour tous les visiteurs.
 */
export async function pharmacyRespond(
  pharmacyId: string,
  requestId: string,
  answer: { status: "CONFIRMED" | "UNAVAILABLE" | "ANSWERED"; message?: string; price?: number },
) {
  const r = await db.pharmacyRequest.findFirst({ where: { id: requestId, pharmacyId } });
  if (!r) throw new ServiceError("NOT_FOUND", "Demande introuvable.");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.pharmacyRequest.update({ where: { id: r.id }, data: { status: answer.status, respondedAt: now } });
    if (answer.message?.trim()) await tx.message.create({ data: { requestId: r.id, author: "PHARMACY", body: answer.message.trim() } });
    if (r.productId && answer.status !== "ANSWERED") {
      const status = answer.status === "CONFIRMED" ? "AVAILABLE" : "OUT";
      await tx.stock.upsert({
        where: { pharmacyId_productId: { pharmacyId, productId: r.productId } },
        update: { status, source: "PHARMACY", confirmedAt: now, ...(answer.price ? { price: answer.price } : {}) },
        create: { pharmacyId, productId: r.productId, status, source: "PHARMACY", confirmedAt: now, price: answer.price ?? 0 },
      });
    }
  });
  const pharmacy = await db.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId } });
  const verdict =
    answer.status === "CONFIRMED" ? "le produit est disponible" : answer.status === "UNAVAILABLE" ? "le produit n'est pas disponible" : "vous avez une réponse";
  await notify({
    requestId: r.id,
    channel: r.notifyChannel as Channel,
    phone: r.phone,
    email: r.email,
    event: "REQUEST_ANSWERED",
    body: `Pharma AI Connect : ${pharmacy.name} a répondu à votre demande ${r.publicRef} : ${verdict}. Consultez la réponse avec le lien reçu lors de votre demande.`,
  });
}
