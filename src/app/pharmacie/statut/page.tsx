import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon } from "@/components/brand";
import { Alert, Card, PageTitle, buttonClass } from "@/components/ui";
import { getPharmacyUser } from "@/lib/auth";
import { formatDate } from "@/components/badges";
import { PHARMACY_DOCS, STATUS_LABEL, docLabel, documentsOf } from "@/lib/services/onboarding";
import { pharmacyLogout } from "../actions";
import { AddDocumentsForm } from "../inscription/forms";

export const metadata: Metadata = { title: "Mon dossier", robots: { index: false } };
export const dynamic = "force-dynamic";

const TEXT = {
  PENDING: "Votre dossier est en cours de vérification. Votre pharmacie n'est pas encore visible et ne peut pas recevoir de commandes.",
  NEEDS_INFO: "Notre équipe a besoin d'éléments complémentaires avant de valider votre dossier.",
  REJECTED: "Votre dossier n'a pas été validé.",
  SUSPENDED: "Votre pharmacie est suspendue : elle n'est plus visible et ne reçoit plus de commandes.",
} as const;

export default async function PharmacyStatus({ searchParams }: { searchParams: Promise<{ nouvelle?: string }> }) {
  const u = await getPharmacyUser();
  if (!u) redirect("/pharmacie/connexion");
  const p = u.pharmacy;
  if (p.verificationStatus === "APPROVED") redirect("/pharmacie");
  const docs = await documentsOf("PHARMACY", p.id);
  const canAdd = p.verificationStatus === "PENDING" || p.verificationStatus === "NEEDS_INFO";
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle eyebrow="Espace pharmacie" title={p.name} subtitle={`${p.district}, ${p.city}`} />
      {(await searchParams).nouvelle && <Alert tone="green">Dossier envoyé. Nous vérifions vos pièces avant toute mise en ligne.</Alert>}
      <Card className="space-y-3" data-testid="verification-status">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">Statut du dossier</p>
        <p className="text-xl font-extrabold text-navy">{STATUS_LABEL[p.verificationStatus]}</p>
        <p className="text-sm text-muted">{TEXT[p.verificationStatus]}</p>
        {p.verificationNote && <Alert tone="amber">Message de l'équipe : {p.verificationNote}</Alert>}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold text-navy">Pièces envoyées</h2>
        <ul className="space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2"><Icon name="check" size={16} className="text-turq-700" />{docLabel("PHARMACY", d.kind)} <span className="text-muted">· {formatDate(d.createdAt)}</span></li>
          ))}
        </ul>
        {canAdd && (
          <div className="space-y-2 border-t border-line pt-3">
            <h3 className="text-sm font-bold text-navy">Ajouter ou remplacer une pièce</h3>
            <AddDocumentsForm docs={PHARMACY_DOCS.map((d) => ({ kind: d.kind, label: d.label, required: false }))} />
          </div>
        )}
      </Card>
      <form action={pharmacyLogout}><button className={buttonClass("ghost")}><Icon name="logout" size={16} />Se déconnecter</button></form>
    </div>
  );
}
