// Comptes clients facultatifs. Un compte n'est jamais créé ni rattaché sans action explicite.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ipFingerprint } from "../crypto";
import { db } from "../db";
import { ServiceError } from "../errors";
import { enforceRateLimit, rateLimit } from "../rate-limit";
import { channelSchema, firstIssue, passwordSchema, phoneSchema } from "../validation";
import { consumeCode, orderByTrackingToken } from "./tracking";

const registerInput = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  password: passwordSchema,
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  consent: z.boolean({ required_error: "Cochez la case pour confirmer la création du compte." }).refine((v) => v, "Cochez la case pour confirmer la création du compte."),
});

export async function registerCustomer(raw: z.input<typeof registerInput>, opts: { attachTrackingToken?: string; ip?: string } = {}) {
  const parsed = registerInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const v = parsed.data;
  if (opts.ip) await enforceRateLimit(`csignup:${opts.ip}`, 5, 3_600_000, "Trop de comptes créés depuis cette connexion. Réessayez dans une heure.");
  if (await db.customer.findUnique({ where: { email: v.email } }))
    throw new ServiceError("EXISTS", "Un compte existe déjà avec cette adresse. Connectez-vous.");
  const customer = await db.customer.create({
    data: { name: v.name, email: v.email, phone: v.phone ?? null, passwordHash: await bcrypt.hash(v.password, 10) },
  });
  // Rattachement seulement si la personne l'a demandé ET détient le lien de suivi.
  if (opts.attachTrackingToken) await claimWithTrackingToken(customer.id, opts.attachTrackingToken);
  return customer;
}

// Empreinte bcrypt jetable : comparée quand l'e-mail est inconnu, pour que la réponse prenne le même temps
// qu'un mauvais mot de passe (sinon la durée révélerait quelles adresses ont un compte).
const DUMMY_HASH = bcrypt.hashSync("pharma-ai-connect:compte-inexistant", 10);

async function passwordMatches(hash: string | undefined, password: string) {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return ok && hash !== undefined;
}

const LOCKOUT = "Trop d'essais. Réessayez dans 15 minutes.";

/** Par adresse IP (robot sur un seul poste) et par compte visé (robot réparti sur plusieurs adresses). */
async function loginGuard(prefix: string, ip: string, email: string, perIp: number, perAccount: number) {
  if (!(await rateLimit(`${prefix}:${ip}`, perIp, 900_000)) || !(await rateLimit(`${prefix}:${email}`, perAccount, 900_000)))
    throw new ServiceError("RATE", LOCKOUT);
}

export async function authenticateCustomer(emailRaw: string, password: string, ip = "unknown") {
  const email = emailRaw.trim().toLowerCase();
  await loginGuard("login", ip, email, 20, 8);
  const c = await db.customer.findUnique({ where: { email } });
  if (!(await passwordMatches(c?.passwordHash, password)) || !c) throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
  return c;
}

export async function authenticatePharmacyUser(emailRaw: string, password: string, ip = "unknown") {
  const email = emailRaw.trim().toLowerCase();
  await loginGuard("plogin", ip, email, 20, 8);
  const u = await db.pharmacyUser.findUnique({ where: { email } });
  if (!(await passwordMatches(u?.passwordHash, password)) || !u) throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
  return u;
}

async function attach(customerId: string, orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.customerId && o.customerId !== customerId) throw new ServiceError("TAKEN", "Cette commande est déjà rattachée à un autre compte.");
  return db.order.update({ where: { id: orderId }, data: { customerId } });
}

/** Rattachement depuis le lien de suivi : détenir le jeton prouve le contrôle de la commande. */
export async function claimWithTrackingToken(customerId: string, token: string) {
  const o = await orderByTrackingToken(token);
  if (!o) throw new ServiceError("NOT_FOUND", "Lien de suivi invalide ou expiré.");
  return attach(customerId, o.id);
}

/** Rattachement par référence + code à usage unique envoyé au contact de la commande. */
export async function claimWithCode(customerId: string, publicRef: string, code: string) {
  const orderId = await consumeCode("CLAIM_ORDER", publicRef, code);
  return attach(customerId, orderId);
}

const prefsInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  notifyChannel: channelSchema.exclude(["LINK"]),
  marketingOptIn: z.boolean(),
});

export async function updateProfile(customerId: string, raw: z.input<typeof prefsInput>) {
  const parsed = prefsInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  return db.customer.update({ where: { id: customerId }, data: { ...parsed.data, phone: parsed.data.phone ?? null } });
}

/** Suppression du compte : les commandes restent (obligations de la pharmacie) mais sont détachées. */
export async function deleteAccount(customerId: string) {
  await db.customer.delete({ where: { id: customerId } });
}

export async function authenticateCourier(emailRaw: string, password: string, ip = "unknown") {
  const email = emailRaw.trim().toLowerCase();
  await loginGuard("clogin", ip, email, 20, 8);
  const c = await db.courier.findUnique({ where: { email } });
  // Un compte désactivé est refusé ; un dossier en cours de vérification se connecte pour suivre son statut.
  const blocked = c && !c.active && c.verificationStatus === "APPROVED";
  if (!(await passwordMatches(c?.passwordHash, password)) || !c || blocked) throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
  return c;
}

export async function authenticateAdmin(emailRaw: string, password: string, ip = "unknown") {
  const email = emailRaw.trim().toLowerCase();
  await loginGuard("alogin", ip, email, 10, 5);
  const a = await db.adminUser.findUnique({ where: { email } });
  if (!(await passwordMatches(a?.passwordHash, password)) || !a || !a.active) {
    // Toute tentative échouée sur l'administration est tracée (adresse IP réduite à une empreinte).
    await db.auditLog.create({ data: { actorType: "ADMIN", actorId: a?.id ?? null, action: "ADMIN_LOGIN_FAILED", entity: `AdminUser:${email.slice(0, 120)}`, note: `ip:${ipFingerprint(ip)}` } });
    throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
  }
  await db.auditLog.create({ data: { actorType: "ADMIN", actorId: a.id, action: "ADMIN_LOGIN", entity: `AdminUser:${a.id}`, note: `ip:${ipFingerprint(ip)}` } });
  return a;
}
