"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { processPayout } from "@/lib/services/ledger";

export type FormState = { error?: string; ok?: string };

export async function payoutDecisionAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const decision = String(fd.get("decision"));
  if (decision !== "PAID" && decision !== "REJECTED") return { error: "Action inconnue." };
  try {
    await processPayout(a.id, String(fd.get("id")), decision, { providerRef: String(fd.get("providerRef") ?? ""), note: String(fd.get("note") ?? "") });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/admin/finances");
  return { ok: decision === "PAID" ? "Paiement enregistré." : "Demande refusée, montant recrédité." };
}
