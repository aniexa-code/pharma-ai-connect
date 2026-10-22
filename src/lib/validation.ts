import { z } from "zod";

/** Numéro normalisé : chiffres seuls, avec + initial s'il était présent. */
export function normalizePhone(raw: string) {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return (trimmed.startsWith("+") || trimmed.startsWith("00") ? "+" : "") + digits.replace(/^00/, "");
}

export function maskPhone(phone: string) {
  return phone.length <= 4 ? "••••" : `${phone.slice(0, 4)} •• •• ${phone.slice(-2)}`;
}

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((p) => /^\+?\d{8,15}$/.test(p), "Numéro de téléphone invalide.");

// Mots de passe parmi les plus essayés par les robots (listes publiques de fuites), en minuscules.
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "azertyui", "azertyuiop",
  "qwertyui", "qwertyuiop", "password", "password1", "password123", "motdepasse", "motdepasse1", "motdepasse123",
  "iloveyou", "sunshine", "princess", "football", "abcd1234", "abc12345", "azerty123", "qwerty123", "bonjour1",
  "bonjour123", "soleil123", "pharmacie", "pharmacie1", "pharmacie123", "cotonou1", "cotonou123", "benin229", "admin123",
  "administrateur", "changeme", "changemoi", "welcome1", "letmein1",
]);

/** Mot de passe d'un nouveau compte : 8 caractères minimum, et pas un des mots de passe que les robots essaient en premier. */
export const passwordSchema = z
  .string()
  .min(8, "Mot de passe : 8 caractères minimum.")
  .max(200)
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()) && !/^(.)\1+$/.test(p), "Ce mot de passe est trop courant. Choisissez-en un autre.");

export const channelSchema = z.enum(["SMS", "WHATSAPP", "EMAIL", "LINK"]);
export type Channel = z.infer<typeof channelSchema>;

const name = z.string().trim().min(2, "Indiquez un nom ou un prénom.").max(80);
const optEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Adresse e-mail invalide.")
  .max(120)
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Coordonnées : on ne demande que ce qu'exige le canal choisi. */
function contactRefine<T extends { notifyChannel: Channel; phone?: string; email?: string }>(v: T, ctx: z.RefinementCtx) {
  if ((v.notifyChannel === "SMS" || v.notifyChannel === "WHATSAPP") && !v.phone)
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Un numéro est nécessaire pour ce canal." });
  if (v.notifyChannel === "EMAIL" && !v.email)
    ctx.addIssue({ code: "custom", path: ["email"], message: "Une adresse e-mail est nécessaire pour ce canal." });
}

export const requestInput = z
  .object({
    kind: z.enum(["VERIFICATION", "QUESTION"]),
    pharmacyId: z.string().min(1),
    productId: z.string().min(1).optional(),
    quantity: z.coerce.number().int().min(1).max(10).default(1),
    contactName: name,
    notifyChannel: channelSchema,
    phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
    email: optEmail,
    message: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine((v, ctx) => {
    contactRefine(v, ctx);
    if (v.kind === "VERIFICATION" && !v.productId)
      ctx.addIssue({ code: "custom", path: ["productId"], message: "Choisissez le produit à vérifier." });
    if (v.kind === "QUESTION" && !v.message)
      ctx.addIssue({ code: "custom", path: ["message"], message: "Écrivez votre message." });
  });
export type RequestInput = z.input<typeof requestInput>;

export const orderInput = z
  .object({
    pharmacyId: z.string().min(1),
    items: z
      .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(10) }))
      .min(1, "Votre commande est vide.")
      .max(10),
    fulfillment: z.enum(["PICKUP", "DELIVERY"]),
    slot: z.string().trim().min(1, "Choisissez un créneau.").max(60),
    contactName: name,
    // Le téléphone est toujours requis : la pharmacie doit pouvoir joindre le client.
    phone: phoneSchema,
    email: optEmail,
    notifyChannel: channelSchema,
    deliveryAddress: z.string().trim().max(200).optional(),
    deliveryNotes: z.string().trim().max(300).optional(),
    paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "CARD"]),
  })
  .superRefine((v, ctx) => {
    contactRefine(v, ctx);
    if (v.fulfillment === "DELIVERY" && (!v.deliveryAddress || v.deliveryAddress.length < 5))
      ctx.addIssue({ code: "custom", path: ["deliveryAddress"], message: "Indiquez l'adresse ou le point de livraison." });
  });
export type OrderInput = z.input<typeof orderInput>;

export function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Formulaire invalide.";
}
