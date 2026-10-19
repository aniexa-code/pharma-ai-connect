import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { CourierLoginForm } from "../forms";

export const metadata: Metadata = { title: "Centre de livraison", robots: { index: false } };

export default function CourierLogin() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle eyebrow="Livreurs" title="Centre de livraison" subtitle="Missions disponibles, itinéraires et validation de la remise." />
      <Card><CourierLoginForm /></Card>
      <p className="text-center text-sm text-muted">Pas encore livreur partenaire ? <Link href="/livreur/inscription" className="font-semibold text-blue">Devenir livreur</Link></p>
    </div>
  );
}
