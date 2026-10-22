// Réglages lus dans l'environnement, avec des valeurs par défaut sûres pour le développement.

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Pays pris en charge. Ajouter un pays = ajouter une ligne ici (devise, fuseau, indicatif) ;
 * ses règles (frais, seuils, champs réglementaires) se règlent ensuite dans l'administration.
 */
export const COUNTRIES: Record<string, { name: string; currency: string; timezone: string; dialCode: string; defaultCity: string; payoutMethods: string[] }> = {
  BJ: { name: "Bénin", currency: "XOF", timezone: "Africa/Porto-Novo", dialCode: "+229", defaultCity: "Cotonou", payoutMethods: ["MOBILE_MONEY", "MOOV_MONEY"] },
};

export function defaultCountryCode() {
  return process.env.DEFAULT_COUNTRY && COUNTRIES[process.env.DEFAULT_COUNTRY] ? process.env.DEFAULT_COUNTRY : "BJ";
}

export function countryInfo(code = defaultCountryCode()) {
  return COUNTRIES[code] ?? COUNTRIES.BJ;
}

// La devise et le fuseau viennent du pays (les anciennes variables CURRENCY et TIMEZONE sont ignorées).
export function currency(country?: string) {
  return countryInfo(country).currency;
}

export function timezone(country?: string) {
  return countryInfo(country).timezone;
}

export const PAYOUT_METHOD_LABEL: Record<string, string> = {
  MOBILE_MONEY: "MTN Mobile Money",
  MOOV_MONEY: "Moov Money",
};

export function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum).");
  if (s === "change-moi-par-une-longue-chaine-aleatoire-de-64-caracteres-minimum")
    throw new Error("AUTH_SECRET est encore la valeur d'exemple : générez une vraie chaîne aléatoire.");
  return s;
}

export function formatMoney(amount: number, cur = currency()) {
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount);
  return cur === "XAF" || cur === "XOF" ? `${n} FCFA` : `${n} ${cur}`;
}

/** Durées de validité (ms). */
export const TTL = {
  request: 7 * 24 * 3600_000, // lien d'une demande de vérification
  tracking: 90 * 24 * 3600_000, // lien de suivi, prolongé à chaque nouvelle émission
  code: 10 * 60_000, // code à usage limité envoyé par SMS / e-mail
};

/** Créneaux proposés au client pour le retrait ou la livraison. */
export const ORDER_SLOTS = ["Dès que possible", "Aujourd'hui, 12 h – 14 h", "Aujourd'hui, 14 h – 17 h", "Aujourd'hui, 17 h – 20 h", "Demain, 8 h – 12 h", "Demain, 14 h – 18 h"];
