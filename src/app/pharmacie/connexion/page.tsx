import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { PharmacyLoginForm } from "../forms";

export const metadata: Metadata = { title: "Espace pharmacie", robots: { index: false } };

export default function PharmacyLogin() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle title="Espace pharmacie" subtitle="Demandes de vérification, commandes et disponibilités." />
      <Card><PharmacyLoginForm /></Card>
      <p className="text-center text-sm text-muted">Votre pharmacie n'est pas encore partenaire ? <Link href="/pharmacie/inscription" className="font-semibold text-blue">Inscrire ma pharmacie</Link></p>
    </div>
  );
}
