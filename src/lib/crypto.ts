// Jetons, références publiques et codes. Aucun secret n'est stocké en clair :
// la base ne garde que des empreintes SHA-256 (jetons) ou un nonce (codes de retrait dérivés par HMAC).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { authSecret } from "./config";

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L, U).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Référence publique lisible et non prévisible, ex. CMD-7KQ2-M9XD (≈ 39 bits d'aléa). */
export function publicRef(prefix: "CMD" | "VER" | "MSG" | "PAN") {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Jeton de lien sécurisé : 256 bits d'aléa, encodé pour URL. */
export function randomToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Jeton de suivi d'une commande, dérivé du secret serveur et d'un nonce : la base ne garde que le nonce et
 * l'empreinte du jeton, mais le serveur peut le recalculer pour l'envoyer dans une notification.
 */
export function trackingToken(nonce: string) {
  return hmac(`track:${nonce}`).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashToken(token: string) {
  return sha256(`token:${token}`);
}

/** Forme attendue d'un jeton (évite toute requête inutile en base sur une valeur farfelue). */
export function looksLikeToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hmac(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest();
}

/** Code de retrait / remise à 6 chiffres, recalculable mais jamais stocké. */
export function handoverCode(orderId: string, nonce: string) {
  return (hmac(`handover:${orderId}:${nonce}`).readUInt32BE(0) % 1_000_000).toString().padStart(6, "0");
}

export function newNonce() {
  return randomBytes(12).toString("base64url");
}

/** Code numérique à usage limité (SMS / e-mail). */
export function numericCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(purpose: string, code: string) {
  return hmac(`code:${purpose}:${code}`).toString("hex");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Empreinte d'adresse IP pour la lutte contre la fraude, sans conserver l'adresse. */
export function ipFingerprint(ip: string) {
  return hmac(`ip:${ip}`).toString("hex").slice(0, 32);
}
