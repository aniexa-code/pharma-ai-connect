// Inscription des pharmacies et des livreurs. S'inscrire ne vaut jamais vérification :
// le dossier reste invisible (pharmacie) ou sans mission (livreur) tant qu'un administrateur ne l'a pas validé.
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { DocumentOwner, VerificationStatus } from "@prisma/client";
import { countryInfo, defaultCountryCode } from "../config";
import { db } from "../db";
import { ServiceError } from "../errors";
import { rateLimit } from "../rate-limit";
import { firstIssue, phoneSchema } from "../validation";
import { resolvePlace } from "./search";

export const DOC_MAX_BYTES = 2 * 1024 * 1024;
export const DOCS_PER_OWNER = 12;

type DocSpec = { kind: string; label: string; required: boolean | ((v: Record<string, string>) => boolean) };

export const PHARMACY_DOCS: DocSpec[] = [
  { kind: "PHARMACY_LICENSE", label: "Autorisation d'ouverture ou licence de la pharmacie", required: true },
  { kind: "OWNER_ID", label: "Pièce d'identité du pharmacien titulaire", required: true },
  { kind: "PHARMACIST_DIPLOMA", label: "Diplôme ou inscription à l'Ordre des pharmaciens", required: false },
];

const MOTORIZED = ["MOTO", "VOITURE"];
export const VEHICLES = [
  { value: "MOTO", label: "Moto" },
  { value: "VELO", label: "Vélo" },
  { value: "VOITURE", label: "Voiture" },
  { value: "A_PIED", label: "À pied" },
];

export const COURIER_DOCS: DocSpec[] = [
  { kind: "ID_CARD", label: "Pièce d'identité (CNI, passeport ou carte biométrique)", required: true },
  { kind: "PHOTO", label: "Photo de vous, visage bien visible", required: true },
  { kind: "DRIVING_LICENSE", label: "Permis de conduire", required: (v) => MOTORIZED.includes(v.vehicle) },
  { kind: "VEHICLE_REGISTRATION", label: "Carte grise du véhicule", required: false },
];

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  PENDING: "En attente de vérification",
  NEEDS_INFO: "Compléments demandés",
  APPROVED: "Validé",
  REJECTED: "Refusé",
  SUSPENDED: "Suspendu",
};

export const STATUS_TONE = { PENDING: "amber", NEEDS_INFO: "blue", APPROVED: "green", REJECTED: "red", SUSPENDED: "red" } as const;

export function docSpecs(owner: DocumentOwner) {
  return owner === "PHARMACY" ? PHARMACY_DOCS : COURIER_DOCS;
}

export function docLabel(owner: DocumentOwner, kind: string) {
  return docSpecs(owner).find((d) => d.kind === kind)?.label ?? "Autre pièce";
}

export type UploadedFile = { kind: string; name: string; type: string; bytes: Uint8Array };

/** Type réel du fichier, lu dans ses premiers octets (l'extension et le type annoncé ne suffisent pas). */
export function sniffMime(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

function checkFile(owner: DocumentOwner, f: UploadedFile) {
  const label = docLabel(owner, f.kind);
  if (!docSpecs(owner).some((d) => d.kind === f.kind)) throw new ServiceError("INVALID", "Type de pièce inconnu.");
  if (f.bytes.length === 0) throw new ServiceError("INVALID", `${label} : fichier vide.`);
  if (f.bytes.length > DOC_MAX_BYTES) throw new ServiceError("INVALID", `${label} : fichier trop lourd (2 Mo au plus). Prenez une photo moins lourde ou un PDF.`);
  const mime = sniffMime(f.bytes);
  if (!mime) throw new ServiceError("INVALID", `${label} : seules les photos (JPEG, PNG, WebP) et les PDF sont acceptés.`);
  return { mime, filename: f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "piece" };
}

function missingDocs(owner: DocumentOwner, have: string[], values: Record<string, string>) {
  return docSpecs(owner)
    .filter((d) => (typeof d.required === "function" ? d.required(values) : d.required) && !have.includes(d.kind))
    .map((d) => d.label);
}

function docRows(owner: DocumentOwner, ownerId: string, files: UploadedFile[]) {
  return files.map((f) => {
    const { mime, filename } = checkFile(owner, f);
    return { ownerType: owner, ownerId, kind: f.kind, filename, mime, size: f.bytes.length, sha256: createHash("sha256").update(f.bytes).digest("hex"), data: Buffer.from(f.bytes) };
  });
}

const account = {
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(120),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum.").max(200),
  phone: phoneSchema,
  consent: z.boolean().refine((v) => v, "Cochez la case pour certifier l'exactitude des informations."),
};

const pharmacyInput = z.object({
  name: z.string().trim().min(3, "Indiquez le nom de la pharmacie.").max(100),
  licenseNumber: z.string().trim().min(3, "Indiquez le numéro d'autorisation.").max(60),
  ownerName: z.string().trim().min(3, "Indiquez le nom du pharmacien titulaire.").max(80),
  address: z.string().trim().min(5, "Indiquez l'adresse.").max(200),
  district: z.string().trim().min(2, "Indiquez le quartier.").max(80),
  city: z.string().trim().min(2).max(80),
  offersDelivery: z.boolean(),
  ...account,
});

const courierInput = z.object({
  name: z.string().trim().min(3, "Indiquez vos nom et prénom.").max(80),
  city: z.string().trim().min(2).max(80),
  zone: z.string().trim().min(2, "Indiquez votre zone habituelle.").max(80),
  vehicle: z.enum(["MOTO", "VELO", "VOITURE", "A_PIED"], { errorMap: () => ({ message: "Choisissez votre moyen de déplacement." }) }),
  idNumber: z.string().trim().min(4, "Indiquez le numéro de votre pièce d'identité.").max(40),
  ...account,
});

async function guard(ip: string, email: string) {
  if (!(await rateLimit(`signup:${ip}`, 5, 3_600_000))) throw new ServiceError("RATE", "Trop d'inscriptions depuis cette connexion. Réessayez dans une heure.");
  const taken = (await db.pharmacyUser.findUnique({ where: { email } })) || (await db.courier.findUnique({ where: { email } }));
  if (taken) throw new ServiceError("EXISTS", "Un compte existe déjà avec cette adresse. Connectez-vous.");
}

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "pharmacie";
}

async function freeSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; ; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    if (!(await db.pharmacy.findUnique({ where: { slug } }))) return slug;
  }
}

const DEFAULT_HOURS = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [String(d), [["08:00", "20:00"]]]));

export async function registerPharmacy(raw: z.input<typeof pharmacyInput>, files: UploadedFile[], ip = "unknown") {
  const parsed = pharmacyInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const v = parsed.data;
  docRows("PHARMACY", "x", files); // contrôle des fichiers avant toute écriture
  const missing = missingDocs("PHARMACY", files.map((f) => f.kind), {});
  if (missing.length) throw new ServiceError("INVALID", `Pièce obligatoire manquante : ${missing[0]}.`);
  await guard(ip, v.email);
  // Position approximative tirée du quartier ; l'administrateur la corrige lors de la validation.
  const place = (await resolvePlace(v.district)) ?? (await resolvePlace(v.city)) ?? (await resolvePlace(countryInfo().defaultCity));
  if (!place) throw new ServiceError("INVALID", "Ville non couverte pour le moment.");
  const passwordHash = await bcrypt.hash(v.password, 10);
  return db.$transaction(async (tx) => {
    const pharmacy = await tx.pharmacy.create({
      data: {
        slug: await freeSlug(v.name),
        name: v.name,
        address: v.address,
        district: v.district,
        city: v.city,
        country: defaultCountryCode(),
        lat: place.lat,
        lng: place.lng,
        phone: v.phone,
        email: v.email,
        openingHours: DEFAULT_HOURS,
        offersPickup: true,
        offersDelivery: v.offersDelivery,
        active: false,
        verificationStatus: "PENDING",
        submittedAt: new Date(),
        licenseNumber: v.licenseNumber,
        ownerName: v.ownerName,
      },
    });
    const user = await tx.pharmacyUser.create({ data: { pharmacyId: pharmacy.id, email: v.email, name: v.ownerName, passwordHash } });
    await tx.verificationDocument.createMany({ data: docRows("PHARMACY", pharmacy.id, files) });
    await tx.auditLog.create({ data: { actorType: "PHARMACY", actorId: user.id, action: "SIGNUP_SUBMITTED", entity: `Pharmacy:${pharmacy.id}` } });
    return { pharmacy, user };
  });
}

export async function registerCourier(raw: z.input<typeof courierInput>, files: UploadedFile[], ip = "unknown") {
  const parsed = courierInput.safeParse(raw);
  if (!parsed.success) throw new ServiceError("INVALID", firstIssue(parsed.error));
  const v = parsed.data;
  docRows("COURIER", "x", files);
  const missing = missingDocs("COURIER", files.map((f) => f.kind), { vehicle: v.vehicle });
  if (missing.length) throw new ServiceError("INVALID", `Pièce obligatoire manquante : ${missing[0]}.`);
  await guard(ip, v.email);
  const passwordHash = await bcrypt.hash(v.password, 10);
  return db.$transaction(async (tx) => {
    const courier = await tx.courier.create({
      data: { name: v.name, email: v.email, phone: v.phone, passwordHash, active: false, verificationStatus: "PENDING", submittedAt: new Date(), city: v.city, zone: v.zone, vehicle: v.vehicle, idNumber: v.idNumber },
    });
    await tx.verificationDocument.createMany({ data: docRows("COURIER", courier.id, files) });
    await tx.auditLog.create({ data: { actorType: "COURIER", actorId: courier.id, action: "SIGNUP_SUBMITTED", entity: `Courier:${courier.id}` } });
    return courier;
  });
}

export async function documentsOf(owner: DocumentOwner, ownerId: string) {
  return db.verificationDocument.findMany({ where: { ownerType: owner, ownerId }, select: { id: true, kind: true, filename: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } });
}

/** Le demandeur ajoute des pièces tant que son dossier n'est pas tranché ; un dossier complété repasse en attente. */
export async function addDocuments(owner: DocumentOwner, ownerId: string, files: UploadedFile[]) {
  if (!files.length) throw new ServiceError("INVALID", "Choisissez au moins un fichier.");
  const status = owner === "PHARMACY" ? (await db.pharmacy.findUniqueOrThrow({ where: { id: ownerId } })).verificationStatus : (await db.courier.findUniqueOrThrow({ where: { id: ownerId } })).verificationStatus;
  if (status !== "PENDING" && status !== "NEEDS_INFO") throw new ServiceError("STATE", "Ce dossier n'accepte plus de pièces.");
  const rows = docRows(owner, ownerId, files);
  if ((await db.verificationDocument.count({ where: { ownerType: owner, ownerId } })) + rows.length > DOCS_PER_OWNER)
    throw new ServiceError("INVALID", `${DOCS_PER_OWNER} pièces au plus par dossier.`);
  const data = { verificationStatus: "PENDING" as const, submittedAt: new Date() };
  await db.$transaction([
    db.verificationDocument.createMany({ data: rows }),
    owner === "PHARMACY" ? db.pharmacy.update({ where: { id: ownerId }, data }) : db.courier.update({ where: { id: ownerId }, data }),
    db.auditLog.create({ data: { actorType: owner, actorId: ownerId, action: "DOCUMENTS_ADDED", entity: `${owner === "PHARMACY" ? "Pharmacy" : "Courier"}:${ownerId}`, after: { kinds: rows.map((r) => r.kind) } } }),
  ]);
}

export type Decision = "APPROVE" | "NEEDS_INFO" | "REJECT" | "SUSPEND" | "REACTIVATE";

const NEXT: Record<Decision, { from: VerificationStatus[]; to: VerificationStatus }> = {
  APPROVE: { from: ["PENDING", "NEEDS_INFO"], to: "APPROVED" },
  NEEDS_INFO: { from: ["PENDING"], to: "NEEDS_INFO" },
  REJECT: { from: ["PENDING", "NEEDS_INFO"], to: "REJECTED" },
  SUSPEND: { from: ["APPROVED"], to: "SUSPENDED" },
  REACTIVATE: { from: ["SUSPENDED"], to: "APPROVED" },
};

/**
 * Décision d'un administrateur sur un dossier. Seule une validation (ou une réactivation) rend la pharmacie
 * visible et commandable, ou le livreur éligible aux missions. Chaque décision est tracée.
 */
export async function decide(adminId: string, owner: DocumentOwner, ownerId: string, decision: Decision, opts: { note?: string; lat?: number; lng?: number } = {}) {
  const note = opts.note?.trim() || null;
  if (decision !== "APPROVE" && decision !== "REACTIVATE" && !note) throw new ServiceError("INVALID", "Expliquez la décision : le demandeur verra ce message.");
  const rule = NEXT[decision];
  const current = owner === "PHARMACY" ? await db.pharmacy.findUnique({ where: { id: ownerId } }) : await db.courier.findUnique({ where: { id: ownerId } });
  if (!current) throw new ServiceError("NOT_FOUND", "Dossier introuvable.");
  if (!rule.from.includes(current.verificationStatus)) throw new ServiceError("STATE", `Action impossible : le dossier est « ${STATUS_LABEL[current.verificationStatus]} ».`);
  if (decision === "APPROVE") {
    const have = (await documentsOf(owner, ownerId)).map((d) => d.kind);
    const missing = missingDocs(owner, have, { vehicle: "vehicle" in current ? (current.vehicle ?? "") : "" });
    if (missing.length) throw new ServiceError("INVALID", `Validation impossible : pièce manquante (${missing[0]}).`);
  }
  const live = rule.to === "APPROVED";
  const data = {
    verificationStatus: rule.to,
    verificationNote: live ? null : note,
    active: live,
    ...(decision === "APPROVE" ? { verifiedAt: new Date() } : {}),
  };
  const geo = owner === "PHARMACY" && Number.isFinite(opts.lat) && Number.isFinite(opts.lng) && Math.abs(opts.lat!) <= 90 && Math.abs(opts.lng!) <= 180 ? { lat: opts.lat!, lng: opts.lng! } : {};
  const entity = `${owner === "PHARMACY" ? "Pharmacy" : "Courier"}:${ownerId}`;
  // Mise à jour conditionnée au statut lu : deux administrateurs ne peuvent pas trancher en même temps.
  const res =
    owner === "PHARMACY"
      ? await db.pharmacy.updateMany({ where: { id: ownerId, verificationStatus: current.verificationStatus }, data: { ...data, ...geo } })
      : await db.courier.updateMany({ where: { id: ownerId, verificationStatus: current.verificationStatus }, data });
  if (res.count !== 1) throw new ServiceError("STATE", "Le dossier vient d'être modifié. Rechargez la page.");
  await db.auditLog.create({
    data: { actorType: "ADMIN", actorId: adminId, action: `VERIFICATION_${decision}`, entity, before: { status: current.verificationStatus }, after: { status: rule.to, ...geo }, note },
  });
  return rule.to;
}

/** File d'attente de l'administration : dossiers à examiner d'abord, les plus anciens en tête. */
export async function verificationQueue(filter: VerificationStatus | "TODO" = "TODO") {
  const where = filter === "TODO" ? { verificationStatus: { in: ["PENDING", "NEEDS_INFO"] as VerificationStatus[] } } : { verificationStatus: filter };
  const [pharmacies, couriers] = await Promise.all([
    db.pharmacy.findMany({ where, orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }], take: 200 }),
    db.courier.findMany({ where, orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }], take: 200 }),
  ]);
  return [
    ...pharmacies.map((p) => ({ owner: "PHARMACY" as const, id: p.id, name: p.name, place: `${p.district}, ${p.city}`, status: p.verificationStatus, submittedAt: p.submittedAt ?? p.createdAt })),
    ...couriers.map((c) => ({ owner: "COURIER" as const, id: c.id, name: c.name, place: [c.zone, c.city].filter(Boolean).join(", "), status: c.verificationStatus, submittedAt: c.submittedAt ?? c.createdAt })),
  ].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
}
