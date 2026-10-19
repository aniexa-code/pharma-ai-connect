import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { AdminLoginForm } from "../forms";

export const metadata: Metadata = { title: "Administration", robots: { index: false } };

export default function AdminLogin() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Pharma AI Connect" title="Administration" subtitle="Réglages de la plateforme, validations et suivi des opérations." />
      <Card><AdminLoginForm /></Card>
    </div>
  );
}
