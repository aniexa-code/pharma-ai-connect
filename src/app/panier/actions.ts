"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, getCustomer } from "@/lib/auth";
import { mergeCart, readCart, writeCart, type CartLine } from "@/lib/cart";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import { createCheckout } from "@/lib/services/checkout";

export type FormState = { error?: string };

/** Ajout depuis la fiche d'une pharmacie : champs « q_<produit> » avec la quantité voulue. */
export async function addToCart(fd: FormData) {
  const pharmacy = await db.pharmacy.findFirst({ where: { slug: String(fd.get("pharmacie") ?? ""), active: true } });
  if (!pharmacy) redirect("/panier");
  const add: CartLine[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("q_") && Number(v) > 0) add.push({ pharmacyId: pharmacy.id, productId: k.slice(2), quantity: Math.min(10, Math.floor(Number(v))) });
  }
  const single = String(fd.get("produit") ?? "");
  if (single) add.push({ pharmacyId: pharmacy.id, productId: single, quantity: 1 });
  // Seuls les produits réellement référencés par la pharmacie entrent dans le panier.
  const known = await db.stock.findMany({ where: { pharmacyId: pharmacy.id, productId: { in: add.map((l) => l.productId) } }, select: { productId: true } });
  const valid = add.filter((l) => known.some((k) => k.productId === l.productId));
  await writeCart(mergeCart(await readCart(), valid));
  redirect(valid.length ? "/panier?ajout=1" : "/panier");
}

export async function updateCartLine(fd: FormData) {
  const line = { pharmacyId: String(fd.get("pharmacyId")), productId: String(fd.get("productId")), quantity: Math.floor(Number(fd.get("quantity"))) || 0 };
  await writeCart(mergeCart(await readCart(), [line], "set"));
  revalidatePath("/panier");
}

export async function removeCartLine(fd: FormData) {
  await writeCart(mergeCart(await readCart(), [{ pharmacyId: String(fd.get("pharmacyId")), productId: String(fd.get("productId")), quantity: 0 }], "set"));
  revalidatePath("/panier");
}

export async function checkoutCart(_: FormState, fd: FormData): Promise<FormState> {
  let target: string;
  try {
    const customer = await getCustomer();
    const { token } = await createCheckout(
      await readCart(),
      {
        contactName: String(fd.get("contactName") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        email: String(fd.get("email") ?? ""),
        notifyChannel: String(fd.get("notifyChannel") ?? "SMS") as "SMS",
        fulfillment: fd.get("fulfillment") === "DELIVERY" ? "DELIVERY" : "PICKUP",
        slot: String(fd.get("slot") ?? ""),
        paymentMethod: String(fd.get("paymentMethod") ?? "CASH") as "CASH",
        deliveryAddress: String(fd.get("deliveryAddress") ?? ""),
        deliveryNotes: String(fd.get("deliveryNotes") ?? ""),
      },
      { ip: await clientIp(), customerId: customer?.id, honeypot: String(fd.get("website") ?? "") },
    );
    await writeCart([]);
    target = `/suivi/groupe/${token}?nouvelle=1`;
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect(target);
}
