"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, endSession, requireCustomer, startCustomerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import { demoMode } from "@/lib/notify";
import { authenticateCustomer, claimWithCode, deleteAccount, registerCustomer, updateProfile } from "@/lib/services/accounts";
import { requestCode } from "@/lib/services/tracking";

export type FormState = { error?: string; info?: string; step?: "code"; ref?: string; demoCode?: string };

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const c = await authenticateCustomer(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await clientIp());
    await startCustomerSession(c.id);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/compte");
}

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const c = await registerCustomer({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      consent: fd.get("consent") === "on",
    }, { ip: await clientIp() });
    await startCustomerSession(c.id);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/compte");
}

export async function logout() {
  await endSession("CUSTOMER");
  redirect("/");
}

export async function saveProfile(_: FormState, fd: FormData): Promise<FormState> {
  const c = await requireCustomer();
  try {
    await updateProfile(c.id, {
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      notifyChannel: String(fd.get("notifyChannel") ?? "EMAIL") as "EMAIL",
      marketingOptIn: fd.get("marketingOptIn") === "on",
    });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/compte");
  return { info: "Préférences enregistrées." };
}

export async function addAddress(fd: FormData) {
  const c = await requireCustomer();
  const label = String(fd.get("label") ?? "").trim().slice(0, 40);
  const line = String(fd.get("line") ?? "").trim().slice(0, 200);
  if (label && line)
    await db.address.create({
      data: { customerId: c.id, label, line, district: String(fd.get("district") ?? "").trim() || null, city: String(fd.get("city") ?? "Cotonou").trim() },
    });
  revalidatePath("/compte");
}

export async function removeAddress(fd: FormData) {
  const c = await requireCustomer();
  await db.address.deleteMany({ where: { id: String(fd.get("id")), customerId: c.id } });
  revalidatePath("/compte");
}

export async function removeFavorite(fd: FormData) {
  const c = await requireCustomer();
  const id = String(fd.get("id"));
  if (fd.get("kind") === "product") await db.favoriteProduct.deleteMany({ where: { customerId: c.id, productId: id } });
  else await db.favoritePharmacy.deleteMany({ where: { customerId: c.id, pharmacyId: id } });
  revalidatePath("/compte");
}

export async function toggleFavoriteProduct(fd: FormData) {
  const c = await requireCustomer();
  const productId = String(fd.get("productId"));
  const key = { customerId_productId: { customerId: c.id, productId } };
  if (await db.favoriteProduct.findUnique({ where: key })) await db.favoriteProduct.delete({ where: key });
  else await db.favoriteProduct.create({ data: { customerId: c.id, productId } });
  revalidatePath("/recherche");
}

export async function askClaimCode(_: FormState, fd: FormData): Promise<FormState> {
  await requireCustomer();
  const ref = String(fd.get("ref") ?? "").trim().toUpperCase();
  try {
    const r = await requestCode("CLAIM_ORDER", ref, String(fd.get("phone") ?? ""), await clientIp());
    return { step: "code", ref, info: r.message, demoCode: demoMode() ? r.demoCode : undefined };
  } catch (e) {
    return { error: publicMessage(e) };
  }
}

export async function confirmClaim(_: FormState, fd: FormData): Promise<FormState> {
  const c = await requireCustomer();
  const ref = String(fd.get("ref") ?? "");
  try {
    await claimWithCode(c.id, ref, String(fd.get("code") ?? ""));
  } catch (e) {
    return { step: "code", ref, error: publicMessage(e) };
  }
  redirect("/compte?rattachee=1");
}

export async function destroyAccount() {
  const c = await requireCustomer();
  await deleteAccount(c.id);
  await endSession("CUSTOMER");
  redirect("/");
}
