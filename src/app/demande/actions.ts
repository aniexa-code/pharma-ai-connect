"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, getCustomer } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { createRequest, customerReply } from "@/lib/services/requests";

export type FormState = { error?: string };

export async function submitRequest(_: FormState, fd: FormData): Promise<FormState> {
  let token: string;
  try {
    const customer = await getCustomer();
    ({ token } = await createRequest(
      {
        kind: fd.get("kind") === "QUESTION" ? "QUESTION" : "VERIFICATION",
        pharmacyId: String(fd.get("pharmacyId") ?? ""),
        productId: (fd.get("productId") as string) || undefined,
        quantity: Number(fd.get("quantity") || 1),
        contactName: String(fd.get("contactName") ?? ""),
        notifyChannel: String(fd.get("notifyChannel") ?? "LINK") as "SMS",
        phone: String(fd.get("phone") ?? ""),
        email: String(fd.get("email") ?? ""),
        message: String(fd.get("message") ?? ""),
      },
      { ip: await clientIp(), customerId: customer?.id, honeypot: String(fd.get("website") ?? "") },
    ));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect(`/demande/${token}?nouvelle=1`);
}

export async function replyToRequest(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token"));
  try {
    await customerReply(token, String(fd.get("body") ?? ""));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/demande/${token}`);
  return {};
}
