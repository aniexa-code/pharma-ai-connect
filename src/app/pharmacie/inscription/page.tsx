import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { countryInfo } from "@/lib/config";
import { PHARMACY_DOCS } from "@/lib/services/onboarding";
import { PharmacySignupForm } from "./forms";

export const metadata: Metadata = { title: "Inscrire ma pharmacie" };

export default function PharmacySignup() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        eyebrow="Pharmacies partenaires"
        title="Inscrire ma pharmacie"
        subtitle="Votre pharmacie n'apparaît pour les patients qu'après la vérification de votre dossier par notre équipe."
      />
      <Card>
        <PharmacySignupForm docs={PHARMACY_DOCS.map((d) => ({ kind: d.kind, label: d.label, required: d.required === true }))} city={countryInfo().defaultCity} />
      </Card>
      <p className="text-center text-sm text-muted">Déjà inscrite ? <Link href="/pharmacie/connexion" className="font-semibold text-blue">Se connecter</Link></p>
    </div>
  );
}
