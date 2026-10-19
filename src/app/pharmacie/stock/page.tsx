import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { StatusDot } from "@/components/badges";
import { Icon } from "@/components/brand";
import { SubmitButton } from "@/components/client";
import { Alert, ButtonLink, Card, buttonClass } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { availability, relativeTime } from "@/lib/availability";
import { currency } from "@/lib/config";
import { db } from "@/lib/db";
import { removeStockAction, updateStock } from "../actions";
import { AddStockForm, ImportStockForm } from "../forms";

export const metadata: Metadata = { title: "Stock · Centre de contrôle pharmacie", robots: { index: false } };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

const FILTERS = [
  { key: "", label: "Tous" },
  { key: "dispo", label: "Disponibles" },
  { key: "faible", label: "Stock faible" },
  { key: "indispo", label: "Indisponibles" },
  { key: "ancien", label: "À mettre à jour" },
];

export default async function StockPage({ searchParams }: { searchParams: SP }) {
  const u = await requirePharmacyUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filtre = sp.filtre ?? "";
  const categorie = sp.categorie ?? "";
  const money = ["XAF", "XOF"].includes(currency(u.pharmacy.country)) ? "FCFA" : currency(u.pharmacy.country);
  const staleBefore = new Date(Date.now() - 48 * 3_600_000);

  const where: Prisma.StockWhereInput = {
    pharmacyId: u.pharmacyId,
    ...(filtre === "dispo" ? { status: "AVAILABLE" } : filtre === "faible" ? { status: "LOW" } : filtre === "indispo" ? { status: "OUT" } : {}),
    ...(filtre === "ancien" ? { OR: [{ confirmedAt: null }, { confirmedAt: { lt: staleBefore } }] } : {}),
    product: {
      ...(categorie ? { category: categorie } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { dci: { contains: q, mode: "insensitive" } }] } : {}),
    },
  };
  const [stocks, total, categories, catalog] = await Promise.all([
    db.stock.findMany({ where, include: { product: true }, orderBy: { product: { name: "asc" } } }),
    db.stock.count({ where: { pharmacyId: u.pharmacyId } }),
    db.product.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    db.product.findMany({ where: { stocks: { none: { pharmacyId: u.pharmacyId } } }, orderBy: { name: "asc" } }),
  ]);
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, filtre, categorie, ...extra })) if (v) p.set(k, v);
    return `/pharmacie/stock${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/pharmacie" className="text-sm font-semibold text-blue">← Tableau de bord</Link>
          <h1 className="mt-1 text-2xl font-extrabold text-navy">Stock de {u.pharmacy.name}</h1>
          <p className="text-sm text-muted">{total} produit{total > 1 ? "s" : ""} référencé{total > 1 ? "s" : ""}. Le stock affiché aux patients reste indicatif tant que vous ne l'avez pas confirmé pour une demande précise.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/pharmacie/stock/export?format=csv" className={buttonClass("secondary", "min-h-10")}>Exporter en CSV</a>
          <a href="/pharmacie/stock/export?format=xlsx" className={buttonClass("secondary", "min-h-10")}>Exporter en Excel</a>
        </div>
      </div>

      {sp.publie && <Alert tone="green">Import publié : {sp.publie} ligne{Number(sp.publie) > 1 ? "s" : ""} mise{Number(sp.publie) > 1 ? "s" : ""} à jour.</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-extrabold text-navy">Importer un fichier</h2>
          <ImportStockForm />
        </Card>
        <Card className="space-y-3">
          <h2 className="font-extrabold text-navy">Ajouter un produit</h2>
          {catalog.length ? (
            <AddStockForm currencyLabel={money} products={catalog.map((p) => ({ id: p.id, label: [p.name, p.strength, p.form].filter(Boolean).join(" · ") }))} />
          ) : (
            <p className="text-sm text-muted">Tous les produits du référentiel sont déjà dans votre stock.</p>
          )}
        </Card>
      </div>

      <Card className="space-y-4">
        <form action="/pharmacie/stock" method="get" className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line-strong bg-white px-3">
            <Icon name="search" size={18} className="text-blue" />
            <input name="q" defaultValue={q} placeholder="Rechercher un produit ou une molécule" aria-label="Rechercher dans le stock" className="min-h-10 w-full bg-transparent text-sm font-semibold text-navy outline-none" />
          </label>
          <select name="categorie" defaultValue={categorie} aria-label="Catégorie" className="min-h-10 rounded-xl border border-line-strong bg-white px-2 text-sm font-semibold text-navy">
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
          </select>
          {filtre && <input type="hidden" name="filtre" value={filtre} />}
          <button className={buttonClass("secondary", "min-h-10")}>Filtrer</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={link({ filtre: f.key })} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${filtre === f.key ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-blue"}`}>{f.label}</Link>
          ))}
        </div>

        <form action={updateStock}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{stocks.length} ligne{stocks.length > 1 ? "s" : ""} affichée{stocks.length > 1 ? "s" : ""}. Chaque mise à jour est horodatée ; une quantité à 0 passe le produit en indisponible.</p>
            {stocks.length > 0 && <SubmitButton>Mettre à jour le stock</SubmitButton>}
          </div>
          {stocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucun produit ne correspond.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[900px] text-sm" data-testid="stock-table">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                    <th className="px-5 py-2 sm:px-2">Médicament</th>
                    <th className="px-2 py-2">Dosage · forme</th>
                    <th className="px-2 py-2">Conditionnement</th>
                    <th className="px-2 py-2">Disponibilité</th>
                    <th className="px-2 py-2">Quantité</th>
                    <th className="px-2 py-2">Prix ({money})</th>
                    <th className="px-2 py-2">Mise à jour</th>
                    <th className="px-2 py-2"><span className="sr-only">Retirer</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stocks.map((s) => {
                    const a = availability(s);
                    return (
                      <tr key={s.id}>
                        <td className="px-5 py-2.5 font-bold text-navy sm:px-2">
                          <input type="hidden" name="stockId" value={s.id} />
                          <span className="inline-flex items-center gap-2"><StatusDot state={a.state} fresh={a.fresh} />{s.product.name}</span>
                        </td>
                        <td className="px-2 py-2.5 text-muted">{[s.product.strength, s.product.form].filter(Boolean).join(" · ")}</td>
                        <td className="px-2 py-2.5 text-muted">{s.packaging ?? s.product.packaging ?? "—"}</td>
                        <td className="px-2 py-2.5">
                          <select name={`status_${s.id}`} defaultValue={s.status === "UNKNOWN" ? "AVAILABLE" : s.status} className="min-h-9 rounded-lg border border-line-strong bg-white px-2 text-sm font-semibold text-navy" aria-label={`Disponibilité de ${s.product.name}`}>
                            <option value="AVAILABLE">Disponible</option>
                            <option value="LOW">Stock faible</option>
                            <option value="OUT">Indisponible</option>
                          </select>
                        </td>
                        <td className="px-2 py-2.5"><input name={`qty_${s.id}`} type="number" min={0} defaultValue={s.quantity ?? ""} placeholder="—" className="min-h-9 w-20 rounded-lg border border-line-strong px-2 text-sm" aria-label={`Quantité de ${s.product.name}`} /></td>
                        <td className="px-2 py-2.5"><input name={`price_${s.id}`} type="number" min={0} defaultValue={s.price} className="min-h-9 w-24 rounded-lg border border-line-strong px-2 text-sm" aria-label={`Prix de ${s.product.name}`} /></td>
                        <td className="px-2 py-2.5 text-xs text-muted">{s.confirmedAt ? relativeTime(s.confirmedAt) : "Jamais"}{s.source === "IMPORT" ? " · import" : ""}</td>
                        <td className="px-2 py-2.5">
                          <button formAction={removeStockAction} name="remove" value={s.id} formNoValidate className="text-xs font-semibold text-danger hover:underline" aria-label={`Retirer ${s.product.name} du stock`}>Retirer</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </Card>
      <ButtonLink variant="secondary" href="/pharmacie">← Tableau de bord</ButtonLink>
    </div>
  );
}
