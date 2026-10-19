"use server";
import type { FulfillmentMode, ItemAnswer, OrderStatus, StockStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, endSession, requirePharmacyUser, startPharmacySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import { authenticatePharmacyUser } from "@/lib/services/accounts";
import { addOrderMessage, completeHandover, pharmacyAdvance, regenerateHandoverCode, reviewPrescription, verifyOrder, type ItemCheck } from "@/lib/services/orders";
import { confirmHours, declareDuty, endDuty } from "@/lib/services/pharmacies";
import { addStockItem, analyzeImport, cancelImport, publishImport, removeStockItem } from "@/lib/services/stock";
import { pharmacyRespond } from "@/lib/services/requests";
import { timezone } from "@/lib/config";
import { zonedWallTimeToUtc } from "@/lib/hours";

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

/** Réponse en un geste depuis le tableau de bord (Disponible / Indisponible). */
export async function quickRespond(fd: FormData) {
  const u = await requirePharmacyUser();
  const status = fd.get("status") === "CONFIRMED" ? "CONFIRMED" : "UNAVAILABLE";
  await pharmacyRespond(u.pharmacyId, String(fd.get("requestId")), {
    status,
    message: status === "CONFIRMED" ? "Disponible. Vous pouvez commander ou passer à la pharmacie." : "Désolé, ce produit n'est pas disponible pour le moment.",
  });
  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/stock");
}

const STATUSES: StockStatus[] = ["AVAILABLE", "LOW", "OUT"];

/**
 * Mise à jour du stock : chaque ligne envoyée est confirmée maintenant par la pharmacie,
 * horodatée, et devient « Disponible / Fiable » pour les visiteurs.
 */
export async function updateStock(fd: FormData) {
  const u = await requirePharmacyUser();
  const now = new Date();
  for (const id of fd.getAll("stockId").map(String)) {
    const status = String(fd.get(`status_${id}`)) as StockStatus;
    if (!STATUSES.includes(status)) continue;
    const price = Number(fd.get(`price_${id}`));
    const qtyRaw = String(fd.get(`qty_${id}`) ?? "").trim();
    const quantity = qtyRaw === "" ? null : Math.max(0, Math.round(Number(qtyRaw)) || 0);
    await db.stock.updateMany({
      where: { id, pharmacyId: u.pharmacyId },
      data: {
        status: quantity === 0 ? "OUT" : status,
        quantity,
        source: "PHARMACY",
        confirmedAt: now,
        ...(price > 0 ? { price: Math.round(price) } : {}),
      },
    });
  }
  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/stock");
}

/** Horaires et garde : confirmation des horaires, déclaration ou fin de garde. */
export async function hoursAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  try {
    const action = String(fd.get("action"));
    if (action === "confirm") await confirmHours(u.pharmacyId, u.id);
    else if (action === "end") await endDuty(u.pharmacyId, u.id);
    else if (action === "duty") {
      const until = zonedWallTimeToUtc(String(fd.get("until") ?? ""), timezone(u.pharmacy.country));
      if (!until) return { error: "Indiquez la date et l'heure de fin de garde." };
      await declareDuty(u.pharmacyId, u.id, until);
    }
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/pharmacie");
  return {};
}

export async function addStockAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  const qtyRaw = String(fd.get("quantity") ?? "").trim();
  const status = String(fd.get("status")) as StockStatus;
  try {
    await addStockItem(u.pharmacyId, u.id, {
      productId: String(fd.get("productId") ?? ""),
      price: Math.round(Number(fd.get("price"))),
      quantity: qtyRaw === "" ? null : Number(qtyRaw),
      status: STATUSES.includes(status) ? status : "AVAILABLE",
      packaging: String(fd.get("packaging") ?? "").trim().slice(0, 80) || null,
    });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/pharmacie/stock");
  return { info: "Produit ajouté à votre stock." };
}

export async function removeStockAction(fd: FormData) {
  const u = await requirePharmacyUser();
  await removeStockItem(u.pharmacyId, u.id, String(fd.get("remove") ?? ""));
  revalidatePath("/pharmacie/stock");
}

export async function importStockAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choisissez un fichier .csv ou .xlsx." };
  let id: string;
  try {
    id = (await analyzeImport(u.pharmacyId, u.id, file.name, Buffer.from(await file.arrayBuffer()))).id;
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect(`/pharmacie/stock/import/${id}`);
}

export async function publishImportAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  let published: number;
  try {
    published = (await publishImport(u.pharmacyId, u.id, String(fd.get("importId")))).published;
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath("/pharmacie/stock");
  redirect(`/pharmacie/stock?publie=${published}`);
}

export async function cancelImportAction(fd: FormData) {
  const u = await requirePharmacyUser();
  await cancelImport(u.pharmacyId, String(fd.get("importId")));
  redirect("/pharmacie/stock");
}

const ANSWERS: ItemAnswer[] = ["AVAILABLE", "INSUFFICIENT", "UNAVAILABLE", "NEEDS_PHARMACIST", "OTHER"];
const MODES: FulfillmentMode[] = ["PICKUP_ONLY", "DELIVERY_ONLY", "BOTH"];

/** Réponse de la pharmacie après vérification en rayon de chaque produit commandé. */
export async function verifyOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePharmacyUser();
  const orderId = String(fd.get("orderId"));
  const items: Record<string, ItemCheck> = {};
  for (const id of fd.getAll("itemId").map(String)) {
    const answer = String(fd.get(`answer_${id}`)) as ItemAnswer;
    if (!ANSWERS.includes(answer)) return { error: "Indiquez une réponse pour chaque produit." };
    const qty = String(fd.get(`qty_${id}`) ?? "").trim();
    const price = String(fd.get(`price_${id}`) ?? "").trim();
    items[id] = { answer, quantity: qty ? Number(qty) : null, price: price ? Number(price) : null, note: String(fd.get(`note_${id}`) ?? "") };
  }
  const modes = String(fd.get("modes")) as FulfillmentMode;
  if (!MODES.includes(modes)) return { error: "Indiquez si la commande peut être retirée, livrée, ou les deux." };
  try {
    await verifyOrder(u.pharmacyId, u.id, orderId, { items, modes, pharmacistApproval: fd.get("pharmacist") === "on" });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/pharmacie/commandes/${orderId}`);
  revalidatePath("/pharmacie");
  return { info: "Réponse envoyée au client." };
}
