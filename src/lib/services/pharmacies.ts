import { ServiceError } from "../errors";
import { db } from "../db";

/** Date de la dernière mise à jour de stock par pharmacie (fraîcheur des données affichée aux visiteurs). */
export async function lastStockUpdates(pharmacyIds: string[]) {
  const rows = await db.stock.groupBy({ by: ["pharmacyId"], where: { pharmacyId: { in: pharmacyIds } }, _max: { confirmedAt: true } });
  return new Map(rows.map((r) => [r.pharmacyId, r._max.confirmedAt]));
}

const DUTY_MAX_HOURS = 72;

/** La pharmacie confirme que ses horaires affichés sont toujours exacts. */
export async function confirmHours(pharmacyId: string, userId: string, now = new Date()) {
  await db.$transaction([
    db.pharmacy.update({ where: { id: pharmacyId }, data: { hoursConfirmedAt: now } }),
    db.auditLog.create({ data: { actorType: "PHARMACY", actorId: userId, action: "HOURS_CONFIRMED", entity: `Pharmacy:${pharmacyId}` } }),
  ]);
}

/**
 * Déclare une garde jusqu'à une date précise. Une garde sans date de fin, ou dépassée,
 * n'est jamais affichée au public.
 */
export async function declareDuty(pharmacyId: string, userId: string, until: Date, now = new Date()) {
  if (!(until > now)) throw new ServiceError("INVALID", "La fin de garde doit être dans le futur.");
  if (until.getTime() - now.getTime() > DUTY_MAX_HOURS * 3_600_000)
    throw new ServiceError("INVALID", `Une garde se déclare pour ${DUTY_MAX_HOURS} heures au plus. Renouvelez-la ensuite.`);
  await db.$transaction([
    db.pharmacy.update({ where: { id: pharmacyId }, data: { onDuty: true, onDutyUntil: until } }),
    db.auditLog.create({ data: { actorType: "PHARMACY", actorId: userId, action: "DUTY_DECLARED", entity: `Pharmacy:${pharmacyId}`, after: { until: until.toISOString() } } }),
  ]);
}

export async function endDuty(pharmacyId: string, userId: string) {
  await db.$transaction([
    db.pharmacy.update({ where: { id: pharmacyId }, data: { onDuty: false, onDutyUntil: null } }),
    db.auditLog.create({ data: { actorType: "PHARMACY", actorId: userId, action: "DUTY_ENDED", entity: `Pharmacy:${pharmacyId}` } }),
  ]);
}
