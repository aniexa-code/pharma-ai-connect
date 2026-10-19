"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { payInvoice, runBilling } from "@/lib/services/billing";

export type FormState = { error?: string; ok?: string };

export async function markInvoicePaidAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const ref = String(fd.get("providerRef") ?? "").trim();
  if (!ref) return { error: "Indiquez la référence de la transaction reçue." };
  try {
    await payInvoice(String(fd.get("invoiceId")), { provider: "manual", providerRef: ref, actor: { type: "ADMIN", id: a.id } });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: "Facture réglée." };
}

export async function runBillingAction(_: FormState): Promise<FormState> {
  await requireAdmin();
  const r = await runBilling();
  revalidatePath("/admin", "layout");
  return { ok: `${r.checked} pharmacies vérifiées · ${r.invoices} facture(s) émise(s) · ${r.pastDue} en retard · ${r.suspended} suspendue(s).` };
}
