import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, COURIER_COOKIE, CUSTOMER_COOKIE, PHARMACY_COOKIE, verifySession } from "@/lib/session";

// Seuls l'espace pharmacie, le centre de livraison, l'administration et le tableau de bord du compte sont protégés.
// Tout le parcours client (recherche, vérification, commande, suivi) reste ouvert sans compte.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const isPharmacy = under("/pharmacie") && pathname !== "/pharmacie/connexion";
  const isAccount = under("/compte") && !["/compte/connexion", "/compte/inscription"].includes(pathname);
  const isCourier = under("/livreur") && pathname !== "/livreur/connexion";
  const isAdmin = under("/admin") && pathname !== "/admin/connexion";
  if (!isPharmacy && !isAccount && !isCourier && !isAdmin) return NextResponse.next();
  const [cookie, kind, login] = isPharmacy
    ? [PHARMACY_COOKIE, "PHARMACY", "/pharmacie/connexion"]
    : isCourier
      ? [COURIER_COOKIE, "COURIER", "/livreur/connexion"]
      : isAdmin
        ? [ADMIN_COOKIE, "ADMIN", "/admin/connexion"]
        : [CUSTOMER_COOKIE, "CUSTOMER", "/compte/connexion"];
  const session = await verifySession(req.cookies.get(cookie)?.value);
  if (!session || session.kind !== kind) {
    const url = req.nextUrl.clone();
    url.pathname = login;
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/pharmacie/:path*", "/compte/:path*", "/livreur/:path*", "/admin/:path*"] };
