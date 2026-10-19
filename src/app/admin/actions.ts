"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, endSession, requireAdmin, startAdminSession } from "@/lib/auth";
import { COUNTRIES } from "@/lib/config";
import { publicMessage } from "@/lib/errors";
import { authenticateAdmin } from "@/lib/services/accounts";
import { saveSettings, type SettingsPatch } from "@/lib/settings";
import { parseSettingsForm } from "@/lib/settings-fields";

export type FormState = { error?: string; ok?: string };

export async function adminLogin(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await authenticateAdmin(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await clientIp());
    await startAdminSession(a.id);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/admin");
}

export async function adminLogout() {
  await endSession("ADMIN");
  redirect("/admin/connexion");
}

export async function updateSettings(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const country = String(fd.get("country") ?? "");
  if (!(country in COUNTRIES)) return { error: "Pays inconnu." };
  const parsed = parseSettingsForm(fd);
  if ("error" in parsed) return { error: parsed.error };
  try {
    await saveSettings(country, parsed.patch as SettingsPatch, { type: "ADMIN", id: a.id });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: "Réglages enregistrés. Ils s'appliquent immédiatement." };
}
