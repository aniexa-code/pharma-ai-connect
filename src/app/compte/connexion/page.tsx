import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Se connecter" subtitle="Facultatif : le compte sert à retrouver vos commandes, adresses et favoris." />
      <Card><LoginForm /></Card>
      <p className="mt-4 text-sm text-muted">Pas besoin de compte pour <Link href="/" className="text-brand-700">rechercher</Link>, commander ou <Link href="/suivi" className="text-brand-700">suivre une commande</Link>.</p>
    </div>
  );
}
