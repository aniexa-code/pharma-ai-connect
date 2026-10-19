// Moteur de frais. Tous les montants viennent des réglages (administration) : rien n'est figé ici.
import { timezone } from "../config";
import { db } from "../db";
import { distanceKm, type Point } from "../geo";
import { utcToZonedWallTime } from "../hours";
import type { Settings } from "../settings";

export type DeliveryQuote = {
  distanceKm: number;
  /** Le quartier de l'adresse n'a pas été reconnu : distance forfaitaire des réglages. */
  estimated: boolean;
  base: number;
  distance: number;
  night: number;
  fee: number;
  commission: number;
  courierEarning: number;
};

/** Heure locale « HH:MM » comprise dans une plage, y compris une plage qui passe minuit (21:00 → 06:00). */
export function inWindow(hhmm: string, start: string, end: string) {
  return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

const roundUp = (n: number, step: number) => Math.ceil(n / Math.max(1, step)) * Math.max(1, step);

/**
 * Frais de livraison : prise en charge + tarif au km (distance pharmacie → client), plancher minimum,
 * supplément de nuit, arrondi. La commission de la plateforme est prélevée sur ces frais ; le reste revient au livreur.
 */
export function quoteDelivery(d: Settings["delivery"], km: number, at: Date, opts: { estimated?: boolean; tz?: string } = {}): DeliveryQuote {
  const distanceKm = Math.round(km * 10) / 10;
  const base = d.baseFee;
  const distance = Math.round(d.perKm * distanceKm);
  const wall = utcToZonedWallTime(at, opts.tz ?? timezone()).slice(11);
  const night = inWindow(wall, d.nightStart, d.nightEnd) ? d.nightSurcharge : 0;
  const fee = roundUp(Math.max(d.minFee, base + distance) + night, d.roundTo);
  const commission = Math.round((fee * d.commissionPct) / 100);
  return { distanceKm, estimated: !!opts.estimated, base, distance, night, fee, commission, courierEarning: fee - commission };
}

/** Position d'une adresse saisie librement : le premier quartier connu cité dans le texte. */
export async function locateAddress(address: string, city?: string): Promise<Point | null> {
  const a = address.toLowerCase();
  const zones = await db.zone.findMany({ where: city ? { city } : {} });
  const z = zones.sort((x, y) => y.name.length - x.name.length).find((z) => a.includes(z.name.toLowerCase()));
  return z ? { lat: z.lat, lng: z.lng } : null;
}

/** Devis complet pour une pharmacie et une adresse ; null si l'adresse est hors de sa zone de livraison. */
export async function deliveryQuoteFor(
  pharmacy: { lat: number; lng: number; city: string; deliveryRadiusKm: number },
  address: string,
  settings: Settings,
  at = new Date(),
): Promise<(DeliveryQuote & { outOfRange: false }) | { outOfRange: true; distanceKm: number }> {
  const dest = await locateAddress(address, pharmacy.city);
  const km = dest ? distanceKm(pharmacy, dest) : settings.delivery.unknownZoneKm;
  if (dest && km > pharmacy.deliveryRadiusKm) return { outOfRange: true, distanceKm: Math.round(km * 10) / 10 };
  return { ...quoteDelivery(settings.delivery, km, at, { estimated: !dest }), outOfRange: false };
}

/**
 * Frais de service : PER_ORDER pour chaque pharmacie ; PER_CHECKOUT une seule fois par panier validé
 * (sur la première commande du panier confirmée par le client).
 */
export async function serviceFeeFor(order: { id: string; checkoutId: string | null }, fees: Settings["fees"]) {
  if (fees.serviceFeeMode === "PER_ORDER" || !order.checkoutId) return fees.serviceFee;
  const already = await db.order.count({ where: { checkoutId: order.checkoutId, id: { not: order.id }, serviceFee: { gt: 0 }, status: { not: "CANCELLED" } } });
  return already ? 0 : fees.serviceFee;
}
