import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, COURIER_COOKIE, CUSTOMER_COOKIE, PHARMACY_COOKIE, verifySession } from "@/lib/session";

/**
 * Politique de sécurité du contenu (CSP) : seuls les scripts portant le nonce de la requête s'exécutent.
 * Un script injecté (XSS) n'a pas ce nonce et est bloqué par le navigateur. Tout le site est servi
 * depuis son propre domaine : aucune ressource tierce n'est autorisée.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  // La barre d'outils Vercel n'apparaît que sur les déploiements de prévisualisation.
  const preview = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}${preview}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws:" : ""}${preview}`,
    `frame-src 'self'${preview}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

// Seuls l'espace pharmacie, le centre de livraison, l'administration et le tableau de bord du compte sont protégés.
// Tout le parcours client (recherche, vérification, commande, suivi) reste ouvert sans compte.
function protectedArea(pathname: string) {
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (under("/pharmacie") && !["/pharmacie/connexion", "/pharmacie/inscription"].includes(pathname))
    return { cookie: PHARMACY_COOKIE, kind: "PHARMACY", login: "/pharmacie/connexion" } as const;
  if (under("/livreur") && !["/livreur/connexion", "/livreur/inscription"].includes(pathname))
    return { cookie: COURIER_COOKIE, kind: "COURIER", login: "/livreur/connexion" } as const;
  if (under("/admin") && pathname !== "/admin/connexion") return { cookie: ADMIN_COOKIE, kind: "ADMIN", login: "/admin/connexion" } as const;
  if (under("/compte") && !["/compte/connexion", "/compte/inscription"].includes(pathname))
    return { cookie: CUSTOMER_COOKIE, kind: "CUSTOMER", login: "/compte/connexion" } as const;
  return null;
}

const FILE_ROUTES = /^\/(admin\/documents\/|pharmacie\/stock\/export)/;
const PRIVATE_PREFIXES = ["/pharmacie", "/livreur", "/admin", "/compte"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const area = protectedArea(pathname);
  if (area) {
    const session = await verifySession(req.cookies.get(area.cookie)?.value);
    if (!session || session.kind !== area.kind) {
      const url = req.nextUrl.clone();
      url.pathname = area.login;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Les routes de données (cron, exports, pièces justificatives) fixent leurs propres en-têtes.
  if (pathname.startsWith("/api/") || FILE_ROUTES.test(pathname)) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next.js lit le nonce dans l'en-tête CSP de la requête et l'applique à ses propres scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Espaces privés : jamais indexés, jamais gardés en cache par un navigateur partagé ou un proxy.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}

export const config = {
  // Toutes les pages, sauf les fichiers statiques produits par Next.js (déjà immuables et sans script inline).
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
};
