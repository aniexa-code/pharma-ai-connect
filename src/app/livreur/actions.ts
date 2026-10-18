"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, endSession, requireCourier, startCourierSession } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { authenticateCourier } from "@/lib/services/accounts";
import { completeHandover, courierAccept, courierAdvance } from "@/lib/services/orders";

export type FormState = { error?: string };

export async function courierLogin(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const c = await authenticateCourier(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await clientIp());
    await startCourierSession(c.id);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/livreur");
}

export async function courierLogout() {
  await endSession("COURIER");
  redirect("/livreur/connexion");
}

export async function missionAction(_: FormState, fd: FormData): Promise<FormState> {
  const c = await requireCourier();
  const orderId = String(fd.get("orderId"));
  try {
    const action = String(fd.get("action"));
    if (action === "accept") await courierAccept(c.id, orderId);
    else if (action === "next") await courierAdvance(c.id, orderId);
    else if (action === "deliver") await completeHandover({ courierId: c.id }, orderId, String(fd.get("code") ?? ""));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/livreur");
  return {};
}
