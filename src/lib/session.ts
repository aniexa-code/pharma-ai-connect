// Signature/vérification des sessions (compatible middleware Edge).
import { SignJWT, jwtVerify } from "jose";

export const CUSTOMER_COOKIE = "pac_client";
export const PHARMACY_COOKIE = "pac_pharmacie";
export const COURIER_COOKIE = "pac_livreur";
export const CUSTOMER_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
export const PHARMACY_MAX_AGE = 60 * 60 * 12; // 12 h

export type SessionPayload = { uid: string; kind: "CUSTOMER" | "PHARMACY" | "COURIER"; pid?: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum).");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload, maxAge: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(secret());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
