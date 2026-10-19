"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, getCourier, startCourierSession } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { addDocuments, registerCourier } from "@/lib/services/onboarding";
import { documentsFrom } from "@/lib/uploads";

export type FormState = { error?: string; ok?: string };

export async function registerCourierAction(_: FormState, fd: FormData): Promise<FormState> {
  if (fd.get("website")) return { error: "Inscription refusée." };
  const s = (k: string) => String(fd.get(k) ?? "");
  try {
    const c = await registerCourier(
      { name: s("name"), city: s("city"), zone: s("zone"), vehicle: s("vehicle") as "MOTO", idNumber: s("idNumber"), email: s("email"), password: s("password"), phone: s("phone"), consent: fd.get("consent") === "on" },
      await documentsFrom(fd, "COURIER"),
      await clientIp(),
    );
    await startCourierSession(c.id);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/livreur?nouveau=1");
}

export async function addCourierDocumentsAction(_: FormState, fd: FormData): Promise<FormState> {
  const c = await getCourier();
  if (!c) redirect("/livreur/connexion");
  try {
    await addDocuments("COURIER", c.id, await documentsFrom(fd, "COURIER"));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/livreur");
  return { ok: "Pièces reçues : votre dossier repart en vérification." };
}
