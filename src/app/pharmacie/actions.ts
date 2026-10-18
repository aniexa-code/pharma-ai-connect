"use server";
import type { OrderStatus, StockStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, endSession, requirePharmacyUser, startPharmacySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import { authenticatePharmacyUser } from "@/lib/services/accounts";
import { addOrderMessage, completeHandover, pharmacyAdvance, regenerateHandoverCode, reviewPrescription } from "@/lib/services/orders";
import { pharmacyRespond } from "@/lib/services/requests";

export type FormState = { error?: string; info?: string };

export async function pharmacyLogin(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const u = await authenticatePharmacyUser(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await clientIp());
    await startPharmacySession(u.id, u.pharmacyId);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/pharmacie");
}

export async function pharmacyLogout() {
  await endSession("PHARMACY");
  redirect("/pharmacie/connexion");
}

/** Toutes les actions ci-dessous sont limitées à la pharmacie de la personne connectée. */
export async function orderAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  const orderId = String(fd.get("orderId"));
  const action = String(fd.get("action"));
  try {
    if (action === "advance")
      await pharmacyAdvance(u.pharmacyId, orderId, String(fd.get("next")) as OrderStatus, {
        courierName: String(fd.get("courierName") ?? ""),
        note: String(fd.get("note") ?? "") || undefined,
      });
    else if (action === "approve") await reviewPrescription(u.pharmacyId, orderId, true);
    else if (action === "reject") await reviewPrescription(u.pharmacyId, orderId, false, String(fd.get("note") ?? "") || undefined);
    else if (action === "handover") await completeHandover(u.pharmacyId, orderId, String(fd.get("code") ?? ""));
    else if (action === "regenerate") {
      await db.order.findFirstOrThrow({ where: { id: orderId, pharmacyId: u.pharmacyId } });
      await regenerateHandoverCode(orderId);
    } else if (action === "message") {
      await db.order.findFirstOrThrow({ where: { id: orderId, pharmacyId: u.pharmacyId } });
      await addOrderMessage(orderId, "PHARMACY", String(fd.get("body") ?? ""));
    }
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/pharmacie/commandes/${orderId}`);
  return { info: "Enregistré." };
}

export async function respondToRequest(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  const id = String(fd.get("requestId"));
  try {
    await pharmacyRespond(u.pharmacyId, id, {
      status: String(fd.get("status")) as "CONFIRMED",
      message: String(fd.get("message") ?? ""),
      price: Number(fd.get("price")) || undefined,
    });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/pharmacie/demandes/${id}`);
  revalidatePath("/pharmacie");
  return { info: "Réponse envoyée au client." };
}

/** Mise à jour rapide d'une disponibilité : horodatée, elle devient « Fiable » pour les visiteurs. */
export async function updateStock(fd: FormData) {
  const u = await requirePharmacyUser();
  const status = String(fd.get("status")) as StockStatus;
  const price = Number(fd.get("price"));
  await db.stock.updateMany({
    where: { id: String(fd.get("stockId")), pharmacyId: u.pharmacyId },
    data: { status, source: "PHARMACY", confirmedAt: new Date(), ...(price > 0 ? { price: Math.round(price) } : {}) },
  });
  revalidatePath("/pharmacie");
}
