import type { Metadata } from "next";
import Link from "next/link";
import type { VerificationStatus } from "@prisma/client";
import { formatDate } from "@/components/badges";
import { Badge, Card, buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { STATUS_LABEL, STATUS_TONE, verificationQueue } from "@/lib/services/onboarding";
import { AdminNav } from "../AdminNav";

export const metadata: Metadata = { title: "Inscriptions", robots: { index: false } };
export const dynamic = "force-dynamic";

const FILTERS: { key: VerificationStatus | "TODO"; label: string }[] = [
  { key: "TODO", label: "À traiter" },
  { key: "APPROVED", label: "Validés" },
  { key: "REJECTED", label: "Refusés" },
  { key: "SUSPENDED", label: "Suspendus" },
];

export default async function Inscriptions({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const a = await requireAdmin();
  const statut = (await searchParams).statut;
  const filter = FILTERS.find((f) => f.key === statut)?.key ?? "TODO";
  const rows = await verificationQueue(filter);
  return (
    <div className="mx-auto max-w-4xl">
      <AdminNav name={a.name} current="/admin/inscriptions" />
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Inscriptions</h1>
      <p className="mb-4 text-sm text-muted">Une pharmacie n'est visible, et un livreur ne reçoit de missions, qu'après validation de son dossier ici.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/inscriptions?statut=${f.key}`} className={buttonClass(f.key === filter ? "primary" : "secondary", "min-h-9")}>{f.label}</Link>
        ))}
      </div>
      <Card className="p-0" data-testid="verification-queue">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">Aucun dossier dans cette liste.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/inscriptions/${r.owner === "PHARMACY" ? "pharmacie" : "livreur"}/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-icy">
                  <span>
                    <span className="block font-bold text-navy">{r.name}</span>
                    <span className="text-xs text-muted">{r.owner === "PHARMACY" ? "Pharmacie" : "Livreur"} · {r.place || "zone non précisée"} · reçu le {formatDate(r.submittedAt)}</span>
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
