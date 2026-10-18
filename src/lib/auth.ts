import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, PHARMACY_COOKIE, PHARMACY_MAX_AGE, signSession, verifySession } from "./session";

/** Client connecté (facultatif) : null pour un visiteur, ce qui ne bloque aucun parcours. */
export const getCustomer = cache(async () => {
  const s = await verifySession((await cookies()).get(CUSTOMER_COOKIE)?.value);
  if (!s || s.kind !== "CUSTOMER") return null;
  return db.customer.findUnique({ where: { id: s.uid } });
});

export async function requireCustomer() {
  const c = await getCustomer();
  if (!c) redirect("/compte/connexion");
  return c;
}

export const getPharmacyUser = cache(async () => {
  const s = await verifySession((await cookies()).get(PHARMACY_COOKIE)?.value);
  if (!s || s.kind !== "PHARMACY") return null;
  return db.pharmacyUser.findUnique({ where: { id: s.uid }, include: { pharmacy: true } });
});

export async function requirePharmacyUser() {
  const u = await getPharmacyUser();
  if (!u) redirect("/pharmacie/connexion");
  return u;
}

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
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

export async function endSession(kind: "CUSTOMER" | "PHARMACY") {
  (await cookies()).delete(kind === "CUSTOMER" ? CUSTOMER_COOKIE : PHARMACY_COOKIE);
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
