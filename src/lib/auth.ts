import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { ADMIN_COOKIE, ADMIN_MAX_AGE, COURIER_COOKIE, CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, PHARMACY_COOKIE, PHARMACY_MAX_AGE, signSession, verifySession, type SessionPayload } from "./session";

/** Session valide du bon type, et pas fermée par une déconnexion (la liste de révocation est en base). */
async function readSession(cookie: string, kind: SessionPayload["kind"]) {
  const s = await verifySession((await cookies()).get(cookie)?.value);
  if (!s || s.kind !== kind) return null;
  if (await db.revokedSession.findUnique({ where: { jti: s.jti } })) return null;
  return s;
}

/** Client connecté (facultatif) : null pour un visiteur, ce qui ne bloque aucun parcours. */
export const getCustomer = cache(async () => {
  const s = await readSession(CUSTOMER_COOKIE, "CUSTOMER");
  if (!s) return null;
  return db.customer.findUnique({ where: { id: s.uid } });
});

export async function requireCustomer() {
  const c = await getCustomer();
  if (!c) redirect("/compte/connexion");
  return c;
}

export const getPharmacyUser = cache(async () => {
  const s = await readSession(PHARMACY_COOKIE, "PHARMACY");
  if (!s) return null;
  return db.pharmacyUser.findUnique({ where: { id: s.uid }, include: { pharmacy: true } });
});

/** Espace pharmacie complet : réservé aux pharmacies dont le dossier a été validé. */
export async function requirePharmacyUser() {
  const u = await getPharmacyUser();
  if (!u) redirect("/pharmacie/connexion");
  if (u.pharmacy.verificationStatus !== "APPROVED") redirect("/pharmacie/statut");
  return u;
}

const cookieOpts = (maxAge: number, sameSite: "lax" | "strict" = "lax") => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite,
  path: "/",
  maxAge,
});

export async function startCustomerSession(id: string) {
  (await cookies()).set(CUSTOMER_COOKIE, await signSession({ uid: id, kind: "CUSTOMER" }, CUSTOMER_MAX_AGE), cookieOpts(CUSTOMER_MAX_AGE));
}

export async function startPharmacySession(id: string, pharmacyId: string) {
  (await cookies()).set(
    PHARMACY_COOKIE,
    await signSession({ uid: id, kind: "PHARMACY", pid: pharmacyId }, PHARMACY_MAX_AGE),
    cookieOpts(PHARMACY_MAX_AGE),
  );
}

export const getCourier = cache(async () => {
  const s = await readSession(COURIER_COOKIE, "COURIER");
  if (!s) return null;
  // Un livreur en cours de vérification peut se connecter pour suivre son dossier, sans voir de mission.
  return db.courier.findFirst({ where: { id: s.uid, OR: [{ active: true }, { verificationStatus: { not: "APPROVED" } }] } });
});

export async function requireCourier() {
  const c = await getCourier();
  if (!c) redirect("/livreur/connexion");
  return c;
}

export async function startCourierSession(id: string) {
  (await cookies()).set(COURIER_COOKIE, await signSession({ uid: id, kind: "COURIER" }, PHARMACY_MAX_AGE), cookieOpts(PHARMACY_MAX_AGE));
}

export const getAdmin = cache(async () => {
  const s = await readSession(ADMIN_COOKIE, "ADMIN");
  if (!s) return null;
  return db.adminUser.findFirst({ where: { id: s.uid, active: true } });
});

export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) redirect("/admin/connexion");
  return a;
}

export async function startAdminSession(id: string) {
  (await cookies()).set(ADMIN_COOKIE, await signSession({ uid: id, kind: "ADMIN" }, ADMIN_MAX_AGE), cookieOpts(ADMIN_MAX_AGE, "strict"));
}

const COOKIE_OF = { CUSTOMER: CUSTOMER_COOKIE, PHARMACY: PHARMACY_COOKIE, COURIER: COURIER_COOKIE, ADMIN: ADMIN_COOKIE } as const;

/**
 * Déconnexion : le cookie est effacé ET la session est inscrite comme révoquée, pour qu'un cookie copié
 * (poste partagé, appareil volé) ne serve plus à rien.
 */
export async function endSession(kind: keyof typeof COOKIE_OF) {
  const jar = await cookies();
  const s = await verifySession(jar.get(COOKIE_OF[kind])?.value);
  if (s) {
    await db.revokedSession.upsert({ where: { jti: s.jti }, update: {}, create: { jti: s.jti, expiresAt: new Date(s.exp * 1000) } });
    if (Math.random() < 0.05) await db.revokedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
  jar.delete(COOKIE_OF[kind]);
}

/**
 * Adresse du visiteur. Sur Vercel, x-real-ip et x-forwarded-for sont réécrits par la plateforme
 * (un visiteur ne peut pas les falsifier) ; x-vercel-forwarded-for est lu en premier quand il existe.
 */
export async function clientIp() {
  const h = await headers();
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
