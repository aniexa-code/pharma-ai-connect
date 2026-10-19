"use server";
import { revalidatePath } from "next/cache";
import { requireCourier } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { requestPayout } from "@/lib/services/ledger";

export type FormState = { error?: string; ok?: string };

export async function payoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const c = await requireCourier();
  try {
    await requestPayout(c.id, { amount: Number(fd.get("amount")), method: String(fd.get("method") ?? ""), phone: String(fd.get("phone") ?? "") });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/livreur", "layout");
  return { ok: "Demande envoyée. Vous serez payé sur ce numéro après contrôle." };
}
