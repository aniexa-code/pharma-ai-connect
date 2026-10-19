// Réglages de la plateforme. Aucune règle commerciale ou financière n'est figée dans le code :
// les valeurs ci-dessous ne sont que des valeurs de départ, remplacées par celles enregistrées
// dans l'administration (globales, puis propres à chaque pays).
import type { Prisma } from "@prisma/client";
import { defaultCountryCode } from "./config";
import { db } from "./db";

export const DEFAULT_SETTINGS = {
  search: {
    /** Rayon proposé par défaut autour de la position du visiteur (km). */
    defaultRadiusKm: 3,
    /** Rayons proposés en un geste (km). */
    radiusOptionsKm: [1, 3, 5, 10],
    /** Rayon maximal accepté, y compris en rayon personnalisé (km). */
    maxRadiusKm: 50,
    /** Au-delà, des horaires non reconfirmés ne permettent plus d'afficher « Ouverte ». */
    hoursMaxAgeDays: 120,
  },
  fees: {
    /** Frais de service fixes payés par le client. */
    serviceFee: 100,
    /** PER_CHECKOUT : une seule fois par validation de panier ; PER_ORDER : par pharmacie. */
    serviceFeeMode: "PER_CHECKOUT" as "PER_CHECKOUT" | "PER_ORDER",
  },
  delivery: {
    minFee: 500,
    baseFee: 300,
    perKm: 150,
    nightSurcharge: 300,
    nightStart: "21:00",
    nightEnd: "06:00",
    /** Réduction sur les frais d'une course regroupée avec une autre (%). */
    groupedDiscountPct: 20,
    /** Commission Pharma AI Connect sur les frais de livraison (%). */
    commissionPct: 15,
    /** Arrondi des frais de livraison au multiple supérieur (ex. 25 FCFA). */
    roundTo: 25,
    /** Distance retenue quand le quartier de l'adresse n'est pas reconnu (km). */
    unknownZoneKm: 4,
  },
  courier: {
    /** Seuil minimal de demande de paiement. */
    payoutMinimum: 1000,
    /** Distance maximale entre la pharmacie et le livreur pour lui proposer une mission (km). */
    missionRadiusKm: 8,
    /** Nombre maximal de commandes transportées ensemble. */
    maxBundle: 2,
    /** Regroupement : distance maximale entre les deux pharmacies, puis entre les deux destinations (km). */
    bundleMaxPickupKm: 1,
    bundleMaxDropKm: 3,
  },
  billing: {
    trialDays: 14,
    plans: { MONTHLY: 15000, QUARTERLY: 40000, ANNUAL: 150000 },
    /** Commission prélevée sur le montant des produits pour les pharmacies au modèle « commission » (%). */
    commissionPct: 5,
    /** Jours de grâce après une échéance impayée avant suspension automatique. */
    graceDays: 7,
    /** Rappel avant expiration de l'abonnement (jours). */
    reminderDays: 5,
  },
};

export type Settings = typeof DEFAULT_SETTINGS;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type SettingsPatch = DeepPartial<Settings>;

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function mergeSettings<T>(base: T, ...patches: unknown[]): T {
  const out: Record<string, unknown> = structuredClone(base) as Record<string, unknown>;
  for (const patch of patches) {
    if (!isObject(patch)) continue;
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in out)) continue; // clé inconnue ou obsolète : ignorée
      out[k] = isObject(out[k]) && isObject(v) ? mergeSettings(out[k], v) : v;
    }
  }
  return out as T;
}

/** Réglages effectifs pour un pays : valeurs par défaut ← réglages globaux ← réglages du pays. */
export async function getSettings(country = defaultCountryCode()): Promise<Settings> {
  const rows = await db.setting.findMany({ where: { key: { in: ["global", country] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return mergeSettings(DEFAULT_SETTINGS, byKey.get("global"), byKey.get(country));
}

export { defaultCountryCode as defaultCountry } from "./config";

/** Enregistre de nouveaux réglages pour un pays, avec une trace d'audit (avant / après). */
export async function saveSettings(country: string, patch: SettingsPatch, actor: { type: string; id?: string }) {
  const before = await getSettings(country);
  const current = await db.setting.findUnique({ where: { key: country } });
  const value = mergeSettings(DEFAULT_SETTINGS, current?.value, patch) as unknown as Prisma.InputJsonValue;
  await db.$transaction([
    db.setting.upsert({ where: { key: country }, update: { value, updatedBy: actor.id ?? null }, create: { key: country, value, updatedBy: actor.id ?? null } }),
    db.auditLog.create({
      data: { actorType: actor.type, actorId: actor.id ?? null, action: "SETTINGS_UPDATED", entity: `Setting:${country}`, before: before as unknown as Prisma.InputJsonValue, after: value },
    }),
  ]);
}
