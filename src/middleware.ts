import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_COOKIE, PHARMACY_COOKIE, verifySession } from "@/lib/session";

// Seuls l'espace pharmacie et le tableau de bord du compte sont protégés.
// Tout le parcours client (recherche, vérification, commande, suivi) reste ouvert sans compte.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const isPharmacy = under("/pharmacie") && pathname !== "/pharmacie/connexion";
  const isAccount = under("/compte") && !["/compte/connexion", "/compte/inscription"].includes(pathname);
  if (!isPharmacy && !isAccount) return NextResponse.next();
  const session = await verifySession(req.cookies.get(isPharmacy ? PHARMACY_COOKIE : CUSTOMER_COOKIE)?.value);
  if (!session || session.kind !== (isPharmacy ? "PHARMACY" : "CUSTOMER")) {
    const url = req.nextUrl.clone();
    url.pathname = isPharmacy ? "/pharmacie/connexion" : "/compte/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/pharmacie/:path*", "/compte/:path*"] };
