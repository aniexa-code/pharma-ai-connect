import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { PharmacyLoginForm } from "../forms";

export const metadata: Metadata = { title: "Espace pharmacie", robots: { index: false } };

export default function PharmacyLogin() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Espace pharmacie" subtitle="Demandes de vérification, commandes et disponibilités." />
      <Card><PharmacyLoginForm /></Card>
    </div>
  );
}
