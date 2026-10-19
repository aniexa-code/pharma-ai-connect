"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePharmacyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import { chooseBilling, payInvoice } from "@/lib/services/billing";

export type FormState = { error?: string; ok?: string };

export async function chooseBillingAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  const choice = String(fd.get("choice") ?? "");
  try {
    await chooseBilling(u.pharmacyId, u.id, choice === "COMMISSION" ? { model: "COMMISSION" } : { model: "SUBSCRIPTION", plan: choice });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/pharmacie", "layout");
  return { ok: "Formule enregistrée." };
}

/**
 * Paiement en ligne d'une facture. Seul le prestataire de test est branché : en production, la facture
 * reste due jusqu'à la confirmation du paiement par l'administration (référence de la transaction).
 */
export async function payInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  if (process.env.PAYMENT_PROVIDER !== "sandbox") return { error: "Paiement en ligne indisponible : réglez par Mobile Money, notre équipe confirmera la réception." };
  const inv = await db.invoice.findFirst({ where: { id: String(fd.get("invoiceId")), pharmacyId: u.pharmacyId } });
  if (!inv) return { error: "Facture introuvable." };
  if (fd.get("outcome") !== "CONFIRMED") return { error: "Paiement non abouti : la facture reste à régler." };
  try {
    await payInvoice(inv.id, { provider: "sandbox", providerRef: `SBX-${randomBytes(4).toString("hex").toUpperCase()}`, actor: { type: "PHARMACY", id: u.id } });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/pharmacie", "layout");
  return { ok: "Paiement confirmé." };
}
