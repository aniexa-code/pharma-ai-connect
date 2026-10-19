// Panier sans compte, conservé dans un cookie : il ne contient que des références (pharmacie, produit,
// quantité). Les prix et disponibilités sont toujours relus en base.
import { cookies } from "next/headers";

export const CART_COOKIE = "pac_panier";
export const CART_MAX_LINES = 30;
export const CART_MAX_QTY = 10;

export type CartLine = { pharmacyId: string; productId: string; quantity: number };

export function parseCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((l) => l && typeof l.ph === "string" && typeof l.p === "string" && Number.isInteger(l.q))
      .map((l) => ({ pharmacyId: l.ph, productId: l.p, quantity: Math.min(CART_MAX_QTY, Math.max(1, l.q)) }))
      .slice(0, CART_MAX_LINES);
  } catch {
    return [];
  }
}

/** Ajoute (ou cumule) des lignes ; une quantité à 0 retire la ligne. */
export function mergeCart(cart: CartLine[], add: CartLine[], mode: "add" | "set" = "add") {
  const out = [...cart];
  for (const l of add) {
    const i = out.findIndex((x) => x.pharmacyId === l.pharmacyId && x.productId === l.productId);
    const qty = mode === "add" && i >= 0 ? out[i].quantity + l.quantity : l.quantity;
    if (qty <= 0) {
      if (i >= 0) out.splice(i, 1);
    } else if (i >= 0) out[i] = { ...l, quantity: Math.min(CART_MAX_QTY, qty) };
    else if (out.length < CART_MAX_LINES) out.push({ ...l, quantity: Math.min(CART_MAX_QTY, qty) });
  }
  return out;
}

export async function readCart() {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

export async function writeCart(lines: CartLine[]) {
  const jar = await cookies();
  if (!lines.length) return jar.delete(CART_COOKIE);
  jar.set(CART_COOKIE, JSON.stringify(lines.map((l) => ({ ph: l.pharmacyId, p: l.productId, q: l.quantity }))), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 86_400,
  });
}
