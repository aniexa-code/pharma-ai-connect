"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { decide, type Decision } from "@/lib/services/onboarding";

export type FormState = { error?: string; ok?: string };

const DECISIONS: Decision[] = ["APPROVE", "NEEDS_INFO", "REJECT", "SUSPEND", "REACTIVATE"];

export async function decideAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const owner = String(fd.get("owner"));
  const id = String(fd.get("id"));
  const decision = String(fd.get("decision")) as Decision;
  if ((owner !== "PHARMACY" && owner !== "COURIER") || !DECISIONS.includes(decision)) return { error: "Action inconnue." };
  const num = (k: string) => (fd.get(k) ? Number(String(fd.get(k)).replace(",", ".")) : undefined);
  try {
    await decide(a.id, owner, id, decision, { note: String(fd.get("note") ?? ""), lat: num("lat"), lng: num("lng") });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: "Décision enregistrée." };
}
