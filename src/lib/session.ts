// Signature/vérification des sessions (compatible middleware Edge).
import { SignJWT, jwtVerify } from "jose";

export const CUSTOMER_COOKIE = "pac_client";
export const PHARMACY_COOKIE = "pac_pharmacie";
export const COURIER_COOKIE = "pac_livreur";
export const ADMIN_COOKIE = "pac_admin";
export const ADMIN_MAX_AGE = 60 * 60 * 8; // 8 h
export const CUSTOMER_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
export const PHARMACY_MAX_AGE = 60 * 60 * 12; // 12 h

export type SessionPayload = { uid: string; kind: "CUSTOMER" | "PHARMACY" | "COURIER" | "ADMIN"; pid?: string };
/** Session vérifiée : `jti` identifie la session (révocable à la déconnexion), `exp` sa fin en secondes. */
export type VerifiedSession = SessionPayload & { jti: string; exp: number };

// Valeur d'exemple de .env.example : refusée, sinon n'importe qui lisant le dépôt pourrait signer des sessions.
const PLACEHOLDER_SECRETS = ["change-moi-par-une-longue-chaine-aleatoire-de-64-caracteres-minimum"];

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum).");
  if (PLACEHOLDER_SECRETS.includes(s)) throw new Error("AUTH_SECRET est encore la valeur d'exemple : générez une vraie chaîne aléatoire.");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload, maxAge: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());
}

export async function verifySession(token?: string): Promise<VerifiedSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    // Les jetons émis avant l'ajout de la révocation n'ont pas d'identifiant : ils sont refusés.
    if (typeof payload.jti !== "string" || typeof payload.exp !== "number") return null;
    return payload as unknown as VerifiedSession;
  } catch {
    return null;
  }
}
