import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { VerificationStatus } from "@prisma/client";
import { formatDate } from "@/components/badges";
import { Alert, Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { STATUS_LABEL, STATUS_TONE, VEHICLES, docLabel, docSpecs, documentsOf } from "@/lib/services/onboarding";
import { AdminNav } from "../../../AdminNav";
import { DecisionForm } from "../../forms";

export const metadata: Metadata = { title: "Dossier", robots: { index: false } };
export const dynamic = "force-dynamic";

function choices(s: VerificationStatus) {
  if (s === "PENDING" || s === "NEEDS_INFO")
    return [
      { decision: "APPROVE", label: "Valider le dossier", variant: "primary" as const },
      ...(s === "PENDING" ? [{ decision: "NEEDS_INFO", label: "Demander des compléments", variant: "secondary" as const }] : []),
      { decision: "REJECT", label: "Refuser", variant: "danger" as const },
    ];
  if (s === "APPROVED") return [{ decision: "SUSPEND", label: "Suspendre", variant: "danger" as const }];
  if (s === "SUSPENDED") return [{ decision: "REACTIVATE", label: "Réactiver", variant: "primary" as const }];
  return [];
}

export default async function Dossier({ params }: { params: Promise<{ owner: string; id: string }> }) {
  const a = await requireAdmin();
  const { owner: o, id } = await params;
  const owner = o === "pharmacie" ? "PHARMACY" : o === "livreur" ? "COURIER" : null;
  if (!owner) notFound();
  const subject = owner === "PHARMACY" ? await db.pharmacy.findUnique({ where: { id }, include: { staff: true } }) : await db.courier.findUnique({ where: { id } });
  if (!subject) notFound();
  const [docs, history] = await Promise.all([
    documentsOf(owner, id),
    db.auditLog.findMany({ where: { entity: `${owner === "PHARMACY" ? "Pharmacy" : "Courier"}:${id}` }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const have = docs.map((d) => d.kind);
  const rows: [string, string | null | undefined][] =
    "slug" in subject
      ? [
          ["Pharmacien titulaire", subject.ownerName],
          ["Numéro d'autorisation", subject.licenseNumber],
          ["Adresse", `${subject.address}, ${subject.district}, ${subject.city}`],
          ["Téléphone", subject.phone],
          ["E-mail", subject.email ?? subject.staff[0]?.email],
          ["Livraison", subject.offersDelivery ? "Oui" : "Non"],
        ]
      : [
          ["Téléphone", subject.phone],
          ["E-mail", subject.email],
          ["Pièce d'identité n°", subject.idNumber],
          ["Déplacement", VEHICLES.find((v) => v.value === subject.vehicle)?.label ?? subject.vehicle],
          ["Zone", [subject.zone, subject.city].filter(Boolean).join(", ")],
        ];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AdminNav name={a.name} current="/admin/inscriptions" />
      <Link href="/admin/inscriptions" className="text-sm font-semibold text-blue">← Tous les dossiers</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-navy">{subject.name}</h1>
        <Badge tone={STATUS_TONE[subject.verificationStatus]}>{STATUS_LABEL[subject.verificationStatus]}</Badge>
        <span className="text-sm text-muted">{owner === "PHARMACY" ? "Pharmacie" : "Livreur"}</span>
      </div>
      {subject.verificationNote && <Alert tone="amber">Dernier message envoyé : {subject.verificationNote}</Alert>}
      <Card className="p-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold text-navy">{v || "—"}</dd></div>
          ))}
        </dl>
      </Card>
      <Card className="space-y-3 p-5" data-testid="documents">
        <h2 className="font-extrabold text-navy">Pièces justificatives</h2>
        <ul className="space-y-2 text-sm">
          {docSpecs(owner).map((spec) => {
            const files = docs.filter((d) => d.kind === spec.kind);
            const required = typeof spec.required === "function" ? spec.required({ vehicle: "vehicle" in subject ? (subject.vehicle ?? "") : "" }) : spec.required;
            return (
              <li key={spec.kind} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-navy">{spec.label}</span>
                {files.length === 0 && <Badge tone={required ? "red" : "gray"}>{required ? "manquante" : "non fournie"}</Badge>}
                {files.map((f) => (
                  <a key={f.id} href={`/admin/documents/${f.id}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue hover:underline">
                    Ouvrir ({f.mime === "application/pdf" ? "PDF" : "photo"}, {Math.max(1, Math.round(f.size / 1024))} Ko, {formatDate(f.createdAt)})
                  </a>
                ))}
              </li>
            );
          })}
        </ul>
        {!have.length && <p className="text-sm text-muted">Aucune pièce reçue.</p>}
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-extrabold text-navy">Décision</h2>
        <DecisionForm owner={owner} id={id} choices={choices(subject.verificationStatus)} geo={"slug" in subject ? { lat: subject.lat, lng: subject.lng } : undefined} />
        {choices(subject.verificationStatus).length === 0 && <p className="text-sm text-muted">Dossier refusé : aucune action possible. Le demandeur peut déposer une nouvelle inscription.</p>}
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-extrabold text-navy">Historique</h2>
        <ul className="space-y-1 text-sm">
          {history.map((h) => (
            <li key={h.id}><span className="text-muted">{formatDate(h.createdAt)}</span> · <span className="font-semibold text-navy">{h.action}</span>{h.note ? ` · ${h.note}` : ""}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
