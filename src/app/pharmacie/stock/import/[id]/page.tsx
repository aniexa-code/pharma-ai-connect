import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Card, type Tone } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { pendingImport, VERDICT_LABEL, type RowVerdict } from "@/lib/services/stock";
import { cancelImportAction } from "../../../actions";
import { PublishImportForm } from "../../../forms";

export const metadata: Metadata = { title: "Rapport d'import · Stock", robots: { index: false } };
export const dynamic = "force-dynamic";

const TONE: Record<RowVerdict, Tone> = { OK: "green", INCORRECT: "red", UNKNOWN_PRODUCT: "amber", DUPLICATE: "gray", MISSING: "red", FORMAT: "red" };
const ORDER: RowVerdict[] = ["OK", "INCORRECT", "UNKNOWN_PRODUCT", "DUPLICATE", "MISSING", "FORMAT"];

export default async function ImportReport({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePharmacyUser();
  const imp = await pendingImport(u.pharmacyId, (await params).id);
  if (!imp) notFound();
  const rows = [...imp.rows].sort((a, b) => (a.verdict === "OK" ? 1 : 0) - (b.verdict === "OK" ? 1 : 0) || a.line - b.line);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pharmacie/stock" className="text-sm font-semibold text-blue">← Stock</Link>
        <h1 className="mt-1 text-2xl font-extrabold text-navy">Rapport de validation</h1>
        <p className="text-sm text-muted">{imp.fileName} · {imp.counts.total} ligne{imp.counts.total > 1 ? "s" : ""} analysée{imp.counts.total > 1 ? "s" : ""}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="import-summary">
        {ORDER.map((v) => (
          <Card key={v} className="p-4">
            <p className="text-2xl font-extrabold text-navy">{imp.counts[v]}</p>
            <p className="text-xs text-muted">{VERDICT_LABEL[v]}{imp.counts[v] > 1 && v !== "MISSING" && v !== "FORMAT" ? "s" : ""}</p>
          </Card>
        ))}
      </div>

      {imp.status === "PENDING" ? (
        <Card className="space-y-3">
          {imp.counts.OK > 0 ? (
            <>
              <p className="text-sm text-navy">
                {imp.counts.OK > 1 ? <>Seules les <strong>{imp.counts.OK}</strong> lignes correctes seront publiées.</> : <>Seule la ligne correcte sera publiée.</>}
                {imp.counts.OK < imp.counts.total && " Les autres sont ignorées : corrigez-les dans votre fichier puis importez-le à nouveau."}
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <PublishImportForm importId={imp.id} count={imp.counts.OK} />
                <form action={cancelImportAction}>
                  <input type="hidden" name="importId" value={imp.id} />
                  <button className="min-h-11 px-3 text-sm font-semibold text-muted hover:text-navy">Annuler l'import</button>
                </form>
              </div>
            </>
          ) : (
            <>
              <Alert tone="amber">Aucune ligne n'est publiable. Corrigez le fichier d'après le rapport ci-dessous, puis importez-le à nouveau.</Alert>
              <form action={cancelImportAction}>
                <input type="hidden" name="importId" value={imp.id} />
                <button className="text-sm font-semibold text-blue">Revenir au stock</button>
              </form>
            </>
          )}
        </Card>
      ) : (
        <Alert tone="gray">Cet import a été {imp.status === "PUBLISHED" ? "publié" : "annulé"}.</Alert>
      )}

      <Card>
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[760px] text-sm" data-testid="import-rows">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                <th className="px-5 py-2 sm:px-2">Ligne</th>
                <th className="px-2 py-2">Verdict</th>
                <th className="px-2 py-2">Dans le fichier</th>
                <th className="px-2 py-2">Produit retenu</th>
                <th className="px-2 py-2">Prix · quantité</th>
                <th className="px-2 py-2">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.line} className="align-top">
                  <td className="px-5 py-2.5 font-mono text-xs text-muted sm:px-2">{r.line}</td>
                  <td className="whitespace-nowrap px-2 py-2.5"><Badge tone={TONE[r.verdict]}>{VERDICT_LABEL[r.verdict]}</Badge></td>
                  <td className="px-2 py-2.5 text-navy">{[r.input.code, r.input.name, r.input.strength, r.input.form].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-2 py-2.5 text-muted">{r.productLabel ?? "—"}</td>
                  <td className="px-2 py-2.5 text-muted">{r.input.price || "—"}{r.input.quantity ? ` · ${r.input.quantity}` : ""}</td>
                  <td className="px-2 py-2.5 text-xs text-muted">{r.messages.join(" ") || "Prête à publier."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
