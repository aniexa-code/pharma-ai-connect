// Réglages lus dans l'environnement, avec des valeurs par défaut sûres pour le développement.

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function currency() {
  return process.env.CURRENCY || "XAF";
}

export function timezone() {
  return process.env.TIMEZONE || "Africa/Brazzaville";
}

export function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum).");
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
