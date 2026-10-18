import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { CourierLoginForm } from "../forms";

export const metadata: Metadata = { title: "Centre de livraison", robots: { index: false } };

export default function CourierLogin() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Livreurs" title="Centre de livraison" subtitle="Missions disponibles, itinéraires et validation de la remise." />
      <Card><CourierLoginForm /></Card>
    </div>
  );
}
