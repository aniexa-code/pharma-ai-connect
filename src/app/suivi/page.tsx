import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { RecoveryForm } from "./forms";

export const metadata: Metadata = { title: "Suivre une commande" };

export default function TrackingHome() {
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle
        title="Suivre une commande"
        subtitle="Le plus simple : ouvrez le lien de suivi reçu après votre commande. Lien perdu ? Recevez un code sur le contact utilisé pour la commande."
      />
      <Card><RecoveryForm /></Card>
      <p className="mt-4 text-xs text-muted">
        Par sécurité, la référence seule ne permet pas d'afficher une commande : vos coordonnées et le détail de vos produits restent protégés.
      </p>
    </div>
  );
}
