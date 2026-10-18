"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./brand";

const DESKTOP = [
  { href: "/recherche", label: "Rechercher" },
  { href: "/pharmacies", label: "Pharmacies" },
  { href: "/garde", label: "Pharmacies de garde" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
];

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-sm font-semibold lg:flex">
      {DESKTOP.map((l) => {
        const active = path === l.href;
        return (
          <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-2 transition ${active ? "text-blue" : "text-navy/70 hover:text-navy"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Navigation basse mobile. Pour un invité, « Commandes » ouvre le suivi sans compte et « Compte » reste discret. */
export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  if (path.startsWith("/pharmacie") || path.startsWith("/livreur")) return null;
  const items: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
    { href: "/", label: "Accueil", icon: "home", match: (p) => p === "/" },
    { href: "/recherche", label: "Rechercher", icon: "search", match: (p) => p.startsWith("/recherche") },
    { href: "/pharmacies", label: "Pharmacies", icon: "store", match: (p) => p.startsWith("/pharmacies") || p === "/garde" },
    { href: signedIn ? "/compte" : "/suivi", label: "Commandes", icon: "receipt", match: (p) => p.startsWith("/suivi") || p.startsWith("/commander") },
    { href: signedIn ? "/compte" : "/compte/connexion", label: signedIn ? "Profil" : "Compte", icon: "user", match: (p) => p.startsWith("/compte") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navigation principale">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((i) => {
          const active = i.match(path);
          return (
            <li key={i.label}>
              <Link href={i.href} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-blue" : "text-faint"}`}>
                <span className="relative">
                  <Icon name={i.icon} size={22} />
                  {active && <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-turq" />}
                </span>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
