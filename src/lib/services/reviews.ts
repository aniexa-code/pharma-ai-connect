// Avis des clients, possibles une seule fois par commande et seulement après sa clôture.
import { db } from "../db";
import { ServiceError } from "../errors";

export async function submitReview(orderId: string, input: { pharmacyRating: number; courierRating?: number | null; comment?: string }) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o) throw new ServiceError("NOT_FOUND", "Commande introuvable.");
  if (!o.closedAt) throw new ServiceError("TRANSITION", "Vous pourrez donner votre avis une fois la commande clôturée.");
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  if (!ok(input.pharmacyRating)) throw new ServiceError("INVALID", "Notez la pharmacie de 1 à 5.");
  const courierRating = o.courierId && input.courierRating != null ? input.courierRating : null;
  if (courierRating !== null && !ok(courierRating)) throw new ServiceError("INVALID", "Notez le livreur de 1 à 5.");
  const comment = input.comment?.trim().slice(0, 500) || null;
  try {
    return await db.review.create({ data: { orderId, pharmacyId: o.pharmacyId, courierId: o.courierId, pharmacyRating: input.pharmacyRating, courierRating, comment } });
  } catch {
    throw new ServiceError("EXISTS", "Vous avez déjà donné votre avis sur cette commande.");
  }
}

export async function pharmacyRating(pharmacyId: string) {
  const [agg, recent] = await Promise.all([
    db.review.aggregate({ where: { pharmacyId, hidden: false }, _avg: { pharmacyRating: true }, _count: true }),
    db.review.findMany({ where: { pharmacyId, hidden: false, comment: { not: null } }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  return { average: agg._avg.pharmacyRating ? Math.round(agg._avg.pharmacyRating * 10) / 10 : null, count: agg._count, recent };
}

export async function hideReview(adminId: string, reviewId: string) {
  const r = await db.review.update({ where: { id: reviewId }, data: { hidden: true } });
  await db.auditLog.create({ data: { actorType: "ADMIN", actorId: adminId, action: "REVIEW_HIDDEN", entity: `Review:${r.id}`, before: { comment: r.comment } } });
}
