// Description des réglages modifiables dans l'administration (libellés, unités, bornes).
import type { Settings } from "./settings";

export type SettingField = {
  path: string; // ex. "search.defaultRadiusKm"
  label: string;
  unit?: string;
  kind: "number" | "percent" | "money" | "time" | "list" | "choice";
  min?: number;
  max?: number;
  choices?: { value: string; label: string }[];
  hint?: string;
};

export const SETTING_SECTIONS: { title: string; fields: SettingField[] }[] = [
  {
    title: "Recherche et géolocalisation",
    fields: [
      { path: "search.defaultRadiusKm", label: "Rayon par défaut", unit: "km", kind: "number", min: 1, max: 50 },
      { path: "search.radiusOptionsKm", label: "Rayons proposés", unit: "km", kind: "list", hint: "Séparés par des virgules, ex. 1, 3, 5, 10" },
      { path: "search.maxRadiusKm", label: "Rayon maximal (y compris personnalisé)", unit: "km", kind: "number", min: 5, max: 200 },
      { path: "search.hoursMaxAgeDays", label: "Validité des horaires déclarés", unit: "jours", kind: "number", min: 7, max: 730, hint: "Au-delà, une pharmacie n'est plus affichée « ouverte » tant qu'elle n'a pas reconfirmé ses horaires." },
    ],
  },
  {
    title: "Frais client",
    fields: [
      { path: "fees.serviceFee", label: "Frais de service par commande", kind: "money", min: 0, max: 100000 },
      {
        path: "fees.serviceFeeMode",
        label: "Application des frais de service",
        kind: "choice",
        choices: [
          { value: "PER_CHECKOUT", label: "Une fois par validation de panier (même avec plusieurs pharmacies)" },
          { value: "PER_ORDER", label: "Pour chaque pharmacie de la commande" },
        ],
      },
    ],
  },
  {
    title: "Livraison",
    fields: [
      { path: "delivery.minFee", label: "Tarif minimum", kind: "money", min: 0, max: 100000 },
      { path: "delivery.baseFee", label: "Prise en charge", kind: "money", min: 0, max: 100000 },
      { path: "delivery.perKm", label: "Tarif par kilomètre", kind: "money", min: 0, max: 100000 },
      { path: "delivery.nightSurcharge", label: "Supplément de nuit", kind: "money", min: 0, max: 100000 },
      { path: "delivery.nightStart", label: "Début de la nuit", kind: "time" },
      { path: "delivery.nightEnd", label: "Fin de la nuit", kind: "time" },
      { path: "delivery.groupedDiscountPct", label: "Réduction pour une course regroupée", kind: "percent", min: 0, max: 100 },
      { path: "delivery.commissionPct", label: "Commission Pharma AI Connect sur la livraison", kind: "percent", min: 0, max: 100 },
      { path: "delivery.roundTo", label: "Arrondi des frais de livraison", kind: "money", min: 1, max: 1000 },
      { path: "delivery.unknownZoneKm", label: "Distance retenue si le quartier n'est pas reconnu", unit: "km", kind: "number", min: 0, max: 50 },
    ],
  },
  {
    title: "Livreurs",
    fields: [
      { path: "courier.payoutMinimum", label: "Seuil minimum de retrait des gains", kind: "money", min: 0, max: 1000000 },
      { path: "courier.missionRadiusKm", label: "Distance maximale livreur → pharmacie pour recevoir une mission", unit: "km", kind: "number", min: 1, max: 100 },
      { path: "courier.maxBundle", label: "Commandes transportées ensemble au maximum", kind: "number", min: 1, max: 5 },
      { path: "courier.bundleMaxPickupKm", label: "Regroupement : distance max. entre pharmacies", unit: "km", kind: "number", min: 0, max: 20 },
      { path: "courier.bundleMaxDropKm", label: "Regroupement : distance max. entre destinations", unit: "km", kind: "number", min: 0, max: 20 },
    ],
  },
  {
    title: "Abonnements et commissions des pharmacies",
    fields: [
      { path: "billing.trialDays", label: "Période d'essai gratuite", unit: "jours", kind: "number", min: 0, max: 365 },
      { path: "billing.plans.MONTHLY", label: "Formule mensuelle", kind: "money", min: 0, max: 10000000 },
      { path: "billing.plans.QUARTERLY", label: "Formule trimestrielle", kind: "money", min: 0, max: 10000000 },
      { path: "billing.plans.ANNUAL", label: "Formule annuelle", kind: "money", min: 0, max: 100000000 },
      { path: "billing.commissionPct", label: "Commission (modèle sans abonnement) sur les produits vendus", kind: "percent", min: 0, max: 100 },
      { path: "billing.graceDays", label: "Délai de grâce avant suspension pour impayé", unit: "jours", kind: "number", min: 0, max: 90 },
      { path: "billing.reminderDays", label: "Rappel avant expiration", unit: "jours", kind: "number", min: 0, max: 60 },
    ],
  },
];

export function readPath(s: Settings, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], s);
}

/** Formulaire → réglages partiels validés. Renvoie l'erreur du premier champ invalide. */
export function parseSettingsForm(fd: FormData): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {};
  const set = (path: string, v: unknown) => {
    const keys = path.split(".");
    let o = patch;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[keys.at(-1)!] = v;
  };
  for (const section of SETTING_SECTIONS) {
    for (const f of section.fields) {
      const raw = String(fd.get(f.path) ?? "").trim();
      if (raw === "") continue;
      if (f.kind === "time") {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return { error: `${f.label} : heure attendue au format HH:MM.` };
        set(f.path, raw);
      } else if (f.kind === "choice") {
        if (!f.choices?.some((c) => c.value === raw)) return { error: `${f.label} : choix invalide.` };
        set(f.path, raw);
      } else if (f.kind === "list") {
        const values = raw.split(/[,;\s]+/).filter(Boolean).map(Number);
        if (!values.length || values.some((n) => !Number.isFinite(n) || n <= 0 || n > 200)) return { error: `${f.label} : nombres positifs séparés par des virgules.` };
        set(f.path, [...new Set(values)].sort((a, b) => a - b));
      } else {
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))
          return { error: `${f.label} : valeur entre ${f.min ?? 0} et ${f.max ?? "∞"} attendue.` };
        set(f.path, f.kind === "money" ? Math.round(n) : n);
      }
    }
  }
  return { patch };
}
