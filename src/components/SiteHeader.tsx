import Link from "next/link";
import { getCustomer } from "@/lib/auth";

export async function SiteHeader() {
  const customer = await getCustomer();
  return (
    <header className="border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">+</span>
          <span>Pharma AI <span className="text-brand-600">Connect</span></span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/recherche" className="hidden hover:text-brand-700 sm:inline">Rechercher</Link>
          <Link href="/suivi" className="hover:text-brand-700">Suivre une commande</Link>
          {customer ? (
            <Link href="/compte" className="hover:text-brand-700">Mon compte</Link>
          ) : (
            <Link href="/compte/connexion" className="text-muted hover:text-brand-700">Se connecter</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4 px-4 py-6 text-sm text-muted">
        <p>Recherchez, vérifiez, commandez et suivez sans créer de compte.</p>
        <div className="flex gap-4">
          <Link href="/suivi" className="hover:text-ink">Retrouver une commande</Link>
          <Link href="/pharmacie" className="hover:text-ink">Espace pharmacie</Link>
        </div>
      </div>
    </footer>
  );
}
