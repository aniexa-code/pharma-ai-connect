import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { requireCustomer } from "@/lib/auth";
import { ClaimForm } from "../forms";

export const metadata: Metadata = { title: "Rattacher une commande" };

export default async function ClaimPage() {
  await requireCustomer();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle
        title="Rattacher une commande"
        subtitle="Pour une commande passée sans compte. Un code est envoyé au contact utilisé lors de la commande pour vérifier qu'elle vous appartient. Vous pouvez aussi cliquer « Ajouter à mon compte » depuis votre lien de suivi."
      />
      <Card><ClaimForm /></Card>
    </div>
  );
}
