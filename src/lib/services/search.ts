// Recherche de médicaments et de pharmacies, ouverte à tous sans inscription.
import { Prisma, type Pharmacy, type Stock } from "@prisma/client";
import { db } from "../db";
import { distanceKm, type Point } from "../geo";
import { openStatus, type OpenStatus, type WeeklyHours } from "../hours";
import { reliability, type Reliability } from "../reliability";

// Recherche insensible à la casse et aux accents : « paracetamol » trouve « Paracétamol »,
// « Talangai » trouve « Talangaï ». Les deux côtés sont ramenés à des minuscules sans accent.
const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ";
const PLAIN = ACCENTED.normalize("NFD").replace(/\p{M}/gu, "");
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

async function idsMatching(table: "Product" | "Zone" | "Pharmacy", columns: string[], term: string, exact = false) {
  const escaped = fold(term).replace(/[\\%_]/g, "\\$&");
  const value = exact ? escaped : `%${escaped}%`;
  const where = Prisma.join(
    columns.map((c) => Prisma.sql`lower(translate(${Prisma.raw(`"${c}"`)}, ${ACCENTED}, ${PLAIN})) LIKE ${value}`),
    " OR ",
  );
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE ${where}`;
  return rows.map((r) => r.id);
}

export async function searchProducts(q: string, take = 8) {
  const term = q.trim();
  if (term.length < 2) return [];
  const ids = await idsMatching("Product", ["name", "dci"], term);
  return db.product.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" }, take });
}

/** Lieu saisi (ville, quartier) → point de référence, d'après le référentiel des zones. */
export async function resolvePlace(place: string): Promise<(Point & { label: string }) | null> {
  const term = place.trim();
  if (!term) return null;
  const [zoneId] = (await idsMatching("Zone", ["name"], term, true)).concat(await idsMatching("Zone", ["name"], term));
  const zone = zoneId ? await db.zone.findUnique({ where: { id: zoneId } }) : null;
  if (zone) return { lat: zone.lat, lng: zone.lng, label: `${zone.name}, ${zone.city}` };
  const cityZones = await db.zone.findMany({ where: { id: { in: await idsMatching("Zone", ["city"], term, true) } } });
  if (!cityZones.length) return null;
  return {
    lat: cityZones.reduce((s, z) => s + z.lat, 0) / cityZones.length,
    lng: cityZones.reduce((s, z) => s + z.lng, 0) / cityZones.length,
    label: cityZones[0].city,
  };
}

export type PharmacyResult = {
  pharmacy: Pharmacy;
  distance: number | null;
  open: OpenStatus;
  stock: Stock | null;
  reliability: Reliability | null;
};

const RANK: Record<string, number> = { AVAILABLE: 0, LOW: 1, UNKNOWN: 2, OUT: 3 };

export async function searchPharmacies(opts: { productId?: string | null; point?: Point | null; radiusKm?: number; place?: string; now?: Date }) {
  const { productId, point, radiusKm = 5, now = new Date() } = opts;
  const pharmacies = await db.pharmacy.findMany({
    where: {
      active: true,
      ...(!point && opts.place ? { id: { in: await idsMatching("Pharmacy", ["city", "district"], opts.place) } } : {}),
    },
    include: productId ? { stocks: { where: { productId } } } : undefined,
  });
  const results: PharmacyResult[] = pharmacies
    .map((p) => {
      const stock = productId ? ((p as typeof p & { stocks: Stock[] }).stocks[0] ?? null) : null;
      return {
        pharmacy: p,
        distance: point ? distanceKm(point, p) : null,
        open: openStatus(p.openingHours as WeeklyHours, p.onDuty, now),
        stock,
        reliability: productId ? reliability(stock, now) : null,
      };
    })
    .filter((r) => r.distance === null || r.distance <= radiusKm);
  results.sort((a, b) => {
    if (productId) {
      const d = RANK[a.stock?.status ?? "UNKNOWN"] - RANK[b.stock?.status ?? "UNKNOWN"];
      if (d) return d;
    }
    if (a.open.open !== b.open.open) return a.open.open ? -1 : 1;
    return (a.distance ?? 0) - (b.distance ?? 0);
  });
  return results;
}
