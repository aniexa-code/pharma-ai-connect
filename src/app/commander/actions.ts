"use server";
import { redirect } from "next/navigation";
import { clientIp, getCustomer } from "@/lib/auth";
import { publicMessage } from "@/lib/errors";
import { createGuestOrder } from "@/lib/services/orders";

export type FormState = { error?: string };

export async function placeOrder(_: FormState, fd: FormData): Promise<FormState> {
  let target: string;
  try {
    const customer = await getCustomer();
    const items = fd.getAll("item").map((v) => {
      const [productId, quantity] = String(v).split(":");
      return { productId, quantity: Number(quantity) };
    });
    const { token } = await createGuestOrder(
      {
        pharmacyId: String(fd.get("pharmacyId") ?? ""),
        items,
        fulfillment: fd.get("fulfillment") === "DELIVERY" ? "DELIVERY" : "PICKUP",
        slot: String(fd.get("slot") ?? ""),
        contactName: String(fd.get("contactName") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        email: String(fd.get("email") ?? ""),
        notifyChannel: String(fd.get("notifyChannel") ?? "SMS") as "SMS",
        deliveryAddress: String(fd.get("deliveryAddress") ?? ""),
        deliveryNotes: String(fd.get("deliveryNotes") ?? ""),
        paymentMethod: String(fd.get("paymentMethod") ?? "CASH") as "CASH",
      },
      // Un client connecté voit sa commande ajoutée à son historique ; un visiteur n'a rien à faire de plus.
      { ip: await clientIp(), customerId: customer?.id, honeypot: String(fd.get("website") ?? "") },
    );
    target = `/suivi/${token}?nouvelle=1`;
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect(target);
}
