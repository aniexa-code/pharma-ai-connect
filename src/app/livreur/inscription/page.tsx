import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { countryInfo } from "@/lib/config";
import { db } from "@/lib/db";
import { COURIER_DOCS, VEHICLES } from "@/lib/services/onboarding";
import { CourierSignupForm } from "./forms";

export const metadata: Metadata = { title: "Devenir livreur" };
export const dynamic = "force-dynamic";

export default async function CourierSignup() {
  const city = countryInfo().defaultCity;
  const zones = (await db.zone.findMany({ where: { city }, orderBy: { name: "asc" } })).map((z) => z.name);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle eyebrow="Livreurs" title="Devenir livreur" subtitle="Après vérification de votre dossier par notre équipe, vous recevrez les missions de livraison de votre zone." />
      <Card>
        <CourierSignupForm
          docs={COURIER_DOCS.map((d) => ({ kind: d.kind, label: d.label, required: typeof d.required === "function" ? "motorized" : d.required }))}
          vehicles={VEHICLES}
          city={city}
          zones={zones}
        />
      </Card>
      <p className="text-center text-sm text-muted">Déjà inscrit ? <Link href="/livreur/connexion" className="font-semibold text-blue">Se connecter</Link></p>
    </div>
  );
}
