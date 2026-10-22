"use server";
import { submitReview } from "@/lib/services/reviews";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, getCustomer, startCustomerSession } from "@/lib/auth";
import { ServiceError, publicMessage } from "@/lib/errors";
import { demoMode } from "@/lib/notify";
import { claimWithTrackingToken, registerCustomer } from "@/lib/services/accounts";
import { addOrderMessage, applyPaymentResult, customerCancel, customerClose, customerConfirm, retryPayment } from "@/lib/services/orders";
import { orderByTrackingToken, recoverTracking, requestCode, rotateTrackingToken } from "@/lib/services/tracking";

export type FormState = { error?: string; info?: string; step?: "code"; ref?: string; demoCode?: string };

async function order(token: string) {
  const o = await orderByTrackingToken(token);
  if (!o) throw new ServiceError("NOT_FOUND", "Lien de suivi invalide ou expiré.");
  return o;
}

// ---------- Lien perdu : référence + téléphone, puis code à usage limité ----------

export async function askRecoveryCode(_: FormState, fd: FormData): Promise<FormState> {
  const ref = String(fd.get("ref") ?? "").trim().toUpperCase();
  try {
    const r = await requestCode("RECOVER_TRACKING", ref, String(fd.get("phone") ?? ""), await clientIp());
    return { step: "code", ref, info: r.message, demoCode: demoMode() ? r.demoCode : undefined };
  } catch (e) {
    return { error: publicMessage(e) };
  }
}

export async function confirmRecoveryCode(_: FormState, fd: FormData): Promise<FormState> {
  const ref = String(fd.get("ref") ?? "");
  let token: string;
  try {
    token = await recoverTracking(ref, String(fd.get("code") ?? ""));
  } catch (e) {
    return { step: "code", ref, error: publicMessage(e) };
  }
  redirect(`/suivi/${token}`);
}

// ---------- Actions du porteur du lien ----------

export async function cancelOrder(fd: FormData) {
  const token = String(fd.get("token"));
  await customerCancel((await order(token)).id);
  revalidatePath(`/suivi/${token}`);
}

export async function newTrackingLink(fd: FormData) {
  const token = await rotateTrackingToken((await order(String(fd.get("token")))).id);
  redirect(`/suivi/${token}?lien=nouveau`);
}

export async function sendOrderMessage(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token"));
  try {
    await addOrderMessage((await order(token)).id, "CUSTOMER", String(fd.get("body") ?? ""));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/suivi/${token}`);
  return {};
}

/** « Je confirme ma commande » : accord explicite du client après la vérification par la pharmacie. */
export async function confirmOrder(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token"));
  let next: string;
  try {
    const o = await customerConfirm((await order(token)).id, {
      fulfillment: fd.get("fulfillment") === "DELIVERY" ? "DELIVERY" : "PICKUP",
      slot: String(fd.get("slot") ?? ""),
      paymentMethod: String(fd.get("paymentMethod") ?? "CASH") as "CASH",
      deliveryAddress: String(fd.get("deliveryAddress") ?? ""),
      deliveryNotes: String(fd.get("deliveryNotes") ?? ""),
    });
    next = o.status === "AWAITING_PAYMENT" ? `/suivi/${token}/paiement` : `/suivi/${token}?confirmee=1`;
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect(next);
}

/** Clôture côté client : réception confirmée, ou problème signalé. */
export async function closeOrder(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token"));
  const received = fd.get("received") === "1";
  try {
    await customerClose((await order(token)).id, received, String(fd.get("note") ?? ""));
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/suivi/${token}`);
  return { info: received ? "Merci, votre commande est clôturée de votre côté." : "Problème transmis à la pharmacie. Elle vous répondra ici." };
}

export async function reviewOrder(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token"));
  const courier = fd.get("courierRating");
  try {
    await submitReview((await order(token)).id, { pharmacyRating: Number(fd.get("pharmacyRating")), courierRating: courier ? Number(courier) : null, comment: String(fd.get("comment") ?? "") });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/suivi/${token}`);
  return { info: "Merci pour votre avis." };
}

// ---------- Paiement (prestataire simulé) ----------

export async function sandboxPay(fd: FormData) {
  const token = String(fd.get("token"));
  if (process.env.PAYMENT_PROVIDER !== "sandbox") throw new ServiceError("PAYMENT", "Paiement simulé désactivé.");
  const o = await order(token);
  const pending = o.payments.find((p) => p.status === "PENDING" && p.method !== "CASH");
  const outcome = String(fd.get("outcome"));
  if (pending && (outcome === "CONFIRMED" || outcome === "FAILED" || outcome === "CANCELLED")) await applyPaymentResult(pending.id, outcome);
  redirect(outcome === "CONFIRMED" ? `/suivi/${token}?paye=1` : `/suivi/${token}/paiement`);
}

export async function changePaymentMethod(fd: FormData) {
  const token = String(fd.get("token"));
  const method = String(fd.get("method")) as "CASH" | "MOBILE_MONEY" | "CARD";
  await retryPayment((await order(token)).id, method);
  redirect(method === "CASH" ? `/suivi/${token}` : `/suivi/${token}/paiement`);
}

// ---------- Compte facultatif ----------

export async function createAccountAfterOrder(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token"));
  try {
    const c = await registerCustomer(
      {
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        consent: fd.get("consent") === "on",
      },
      // Rattachement uniquement si la case est cochée.
      { attachTrackingToken: fd.get("attach") === "on" ? token : undefined, ip: await clientIp() },
    );
    await startCustomerSession(c.id);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  revalidatePath(`/suivi/${token}`);
  return { info: "Compte créé." };
}

export async function attachToMyAccount(fd: FormData) {
  const token = String(fd.get("token"));
  const c = await getCustomer();
  if (!c) redirect("/compte/connexion");
  await claimWithTrackingToken(c.id, token);
  revalidatePath(`/suivi/${token}`);
}
