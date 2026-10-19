"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, getPharmacyUser, startPharmacySession } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { addDocuments, registerPharmacy } from "@/lib/services/onboarding";
import { documentsFrom } from "@/lib/uploads";

export type FormState = { error?: string; ok?: string };

export async function registerPharmacyAction(_: FormState, fd: FormData): Promise<FormState> {
  if (fd.get("website")) return { error: "Inscription refusée." };
  const s = (k: string) => String(fd.get(k) ?? "");
  try {
    const { user } = await registerPharmacy(
      {
        name: s("name"),
        licenseNumber: s("licenseNumber"),
        ownerName: s("ownerName"),
        address: s("address"),
        district: s("district"),
        city: s("city"),
        offersDelivery: fd.get("offersDelivery") === "on",
        email: s("email"),
        password: s("password"),
        phone: s("phone"),
        consent: fd.get("consent") === "on",
      },
      await documentsFrom(fd, "PHARMACY"),
      await clientIp(),
    );
    await startPharmacySession(user.id, user.pharmacyId);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/pharmacie/statut?nouvelle=1");
}

export async function addPharmacyDocumentsAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await getPharmacyUser();
  if (!u) redirect("/pharmacie/connexion");
  try {
    await addDocuments("PHARMACY", u.pharmacyId, await documentsFrom(fd, "PHARMACY"));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/pharmacie/statut");
  return { ok: "Pièces reçues : votre dossier repart en vérification." };
}
