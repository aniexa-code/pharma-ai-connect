// Comptes clients facultatifs. Un compte n'est jamais créé ni rattaché sans action explicite.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db";
import { ServiceError } from "../errors";
import { rateLimit } from "../rate-limit";
import { channelSchema, firstIssue, phoneSchema } from "../validation";
import { consumeCode, orderByTrackingToken } from "./tracking";

const registerInput = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum.").max(200),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  consent: z.boolean({ required_error: "Cochez la case pour confirmer la création du compte." }).refine((v) => v, "Cochez la case pour confirmer la création du compte."),
});

export async function registerCustomer(raw: z.input<typeof registerInput>, opts: { attachTrackingToken?: string } = {}) {
  const parsed = registerInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const v = parsed.data;
  if (await db.customer.findUnique({ where: { email: v.email } }))
    throw new ServiceError("EXISTS", "Un compte existe déjà avec cette adresse. Connectez-vous.");
  const customer = await db.customer.create({
    data: { name: v.name, email: v.email, phone: v.phone ?? null, passwordHash: await bcrypt.hash(v.password, 10) },
  });
  // Rattachement seulement si la personne l'a demandé ET détient le lien de suivi.
  if (opts.attachTrackingToken) await claimWithTrackingToken(customer.id, opts.attachTrackingToken);
  return customer;
}

export async function authenticateCustomer(emailRaw: string, password: string, ip = "unknown") {
  const email = emailRaw.trim().toLowerCase();
  if (!(await rateLimit(`login:${ip}`, 20, 900_000)) || !(await rateLimit(`login:${email}`, 8, 900_000)))
    throw new ServiceError("RATE", "Trop d'essais. Réessayez dans 15 minutes.");
  const c = await db.customer.findUnique({ where: { email } });
  if (!c || !(await bcrypt.compare(password, c.passwordHash))) throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
  return c;
}

export async function authenticatePharmacyUser(emailRaw: string, password: string, ip = "unknown") {
  const email = emailRaw.trim().toLowerCase();
  if (!(await rateLimit(`plogin:${ip}`, 20, 900_000))) throw new ServiceError("RATE", "Trop d'essais. Réessayez dans 15 minutes.");
  const u = await db.pharmacyUser.findUnique({ where: { email } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
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
  if (!(await rateLimit(`clogin:${ip}`, 20, 900_000))) throw new ServiceError("RATE", "Trop d'essais. Réessayez dans 15 minutes.");
  const c = await db.courier.findUnique({ where: { email } });
  if (!c || !c.active || !(await bcrypt.compare(password, c.passwordHash))) throw new ServiceError("AUTH", "E-mail ou mot de passe incorrect.");
  return c;
}
