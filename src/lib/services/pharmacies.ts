import { db } from "../db";

/** Date de la dernière mise à jour de stock par pharmacie (fraîcheur des données affichée aux visiteurs). */
export async function lastStockUpdates(pharmacyIds: string[]) {
  const rows = await db.stock.groupBy({ by: ["pharmacyId"], where: { pharmacyId: { in: pharmacyIds } }, _max: { confirmedAt: true } });
  return new Map(rows.map((r) => [r.pharmacyId, r._max.confirmedAt]));
}
