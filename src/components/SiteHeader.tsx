import Link from "next/link";
import { getCustomer } from "@/lib/auth";
import { Logo } from "./brand";
import { BottomNav, DesktopNav } from "./Nav";
import { buttonClass } from "./ui";

export async function SiteHeader() {
  const customer = await getCustomer();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Pharma AI Connect, accueil"><Logo compact /></Link>
          <DesktopNav />
          <div className="flex items-center gap-2">
            <Link href="/pharmacie" className="hidden rounded-lg px-3 py-2 text-xs font-semibold text-muted hover:text-navy sm:inline">Espace pharmacie</Link>
            {customer ? (
              <Link href="/compte" className={buttonClass("secondary", "min-h-9 py-1.5")}>Mon compte</Link>
            ) : (
              <Link href="/compte/connexion" className={buttonClass("secondary", "min-h-9 py-1.5")}>Se connecter</Link>
            )}
          </div>
        </div>
      </header>
      <BottomNav signedIn={!!customer} />
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-white pb-20 lg:pb-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted">Le réseau qui relie patients, pharmacies et livreurs en temps réel. Aucun compte nécessaire pour commencer.</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-bold text-navy">Patients</p>
          <Link href="/recherche" className="block text-muted hover:text-navy">Rechercher un médicament</Link>
          <Link href="/garde" className="block text-muted hover:text-navy">Pharmacies de garde</Link>
          <Link href="/suivi" className="block text-muted hover:text-navy">Suivre ma demande</Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-bold text-navy">Professionnels</p>
          <Link href="/pharmacie" className="block text-muted hover:text-navy">Espace pharmacie</Link>
          <Link href="/livreur" className="block text-muted hover:text-navy">Centre de livraison</Link>
        </div>
      </div>
    </footer>
  );
}
