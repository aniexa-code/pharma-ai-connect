import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Créer un compte" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Créer un compte gratuit" subtitle="Historique des commandes, adresses enregistrées, pharmacies et produits favoris. Toujours facultatif." />
      <Card><RegisterForm /></Card>
    </div>
  );
}
