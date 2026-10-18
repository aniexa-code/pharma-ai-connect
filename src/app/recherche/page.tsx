import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/brand";
import { SubmitButton } from "@/components/client";
import { PharmacyMapList } from "@/components/NetworkMap";
import { SearchForm } from "@/components/SearchForm";
import { Alert, Badge } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { availability } from "@/lib/availability";
import { db } from "@/lib/db";
import { toMapItem } from "@/lib/map-items";
import { lastStockUpdates } from "@/lib/services/pharmacies";
import { resolvePlace, searchPharmacies, searchProducts } from "@/lib/services/search";
import { toggleFavoriteProduct } from "../compte/actions";

export const metadata: Metadata = { title: "Recherche" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

const REG_LABEL = { PRESCRIPTION: "Sur ordonnance", RESTRICTED: "Délivrance encadrée, non commandable en ligne" } as const;
const FILTERS = [
  { key: "dispo", label: "Disponible", needsProduct: true },
  { key: "ouvert", label: "Ouvert maintenant" },
  { key: "garde", label: "De garde" },
  { key: "retrait", label: "Retrait" },
  { key: "livraison", label: "Livraison" },
] as const;
const RADII = ["1", "3", "5", "10", "20"];

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const lieu = (sp.lieu ?? "").trim();
  const rayon = Math.min(50, Math.max(1, Number(sp.rayon) || 5));
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const hasGeo = !!sp.lat && !!sp.lng && Number.isFinite(lat) && Number.isFinite(lng);

  const products = q ? await searchProducts(q) : [];
  const product = sp.produit
    ? await db.product.findUnique({ where: { slug: sp.produit } })
    : products.length === 1
      ? products[0]
      : (products.find((p) => p.name.toLowerCase() === q.toLowerCase()) ?? null);

  const place = hasGeo ? { lat, lng, label: "votre position" } : lieu ? await resolvePlace(lieu) : await resolvePlace("Brazzaville");
  // Sans lieu précisé, on part du centre-ville sans limiter le rayon.
  const located = hasGeo || !!lieu;
  const all = q && !product ? [] : await searchPharmacies({ productId: product?.id, point: place, radiusKm: located ? rayon : 50, place: place ? undefined : lieu });
  const results = all.filter(
    (r) =>
      (!sp.dispo || availability(r.stock).state === "AVAILABLE") &&
      (!sp.ouvert || r.open.open) &&
      (!sp.garde || r.pharmacy.onDuty) &&
      (!sp.retrait || r.pharmacy.offersPickup) &&
      (!sp.livraison || r.pharmacy.offersDelivery),
  );
  const updates = product ? new Map() : await lastStockUpdates(results.map((r) => r.pharmacy.id));
  const items = results.map((r) => toMapItem(r, { productSlug: product?.slug, lastUpdate: updates.get(r.pharmacy.id) }));

  const base = { q, lieu, rayon: String(rayon), lat: sp.lat ?? "", lng: sp.lng ?? "", produit: product?.slug ?? "", ...Object.fromEntries(FILTERS.map((f) => [f.key, sp[f.key] ?? ""])) };
  const link = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) u.set(k, v);
    return `/recherche?${u}`;
  };
  const customer = await getCustomer();
  const favorite = customer && product ? await db.favoriteProduct.findUnique({ where: { customerId_productId: { customerId: customer.id, productId: product.id } } }) : null;

  return (
    <div className="space-y-6">
      <SearchForm size="md" q={q} lieu={lieu} rayon={String(rayon)} lat={sp.lat} lng={sp.lng} />

      {q && products.length === 0 && <Alert tone="amber">Aucun médicament ne correspond à « {q} ». Vérifiez l'orthographe ou cherchez par molécule.</Alert>}
      {lieu && !hasGeo && !place && <Alert tone="amber">Lieu « {lieu} » non reconnu : résultats filtrés par nom de ville ou de quartier.</Alert>}

      {products.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">Précisez le produit :</p>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => (
              <Link key={p.id} href={link({ produit: p.slug })} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${product?.id === p.id ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-blue"}`}>
                {p.name} {p.strength} · {p.form}
              </Link>
            ))}
          </div>
        </div>
      )}

      {(!q || product) && (
        <div className="space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              {product ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue"><Icon name="pill" /></span>
                    <h1 className="text-xl font-extrabold text-navy">{product.name}</h1>
                    {product.strength && <Badge tone="blue">{product.strength}</Badge>}
                    {product.regulation !== "OTC" && <Badge tone="amber">{REG_LABEL[product.regulation]}</Badge>}
                  </div>
                  <p className="text-sm text-muted">{product.dci} · {product.form}{place ? ` · autour de ${place.label}` : ""}</p>
                </>
              ) : (
                <h1 className="text-xl font-extrabold text-navy">Pharmacies {place ? `autour de ${place.label}` : lieu ? `à ${lieu}` : ""}</h1>
              )}
            </div>
            {customer && product && (
              <form action={toggleFavoriteProduct}>
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton variant="secondary">{favorite ? "♥ Favori" : "♡ Favori"}</SubmitButton>
              </form>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-faint"><Icon name="filter" size={14} /> Filtres</span>
            {located && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-icy p-0.5">
              {RADII.map((r) => (
                <Link key={r} href={link({ rayon: r })} className={`rounded-full px-2.5 py-1 text-xs font-bold ${String(rayon) === r ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"}`}>{r} km</Link>
              ))}
            </span>}
            {FILTERS.filter((f) => !("needsProduct" in f) || product).map((f) => {
              const on = !!sp[f.key];
              return (
                <Link key={f.key} href={link({ [f.key]: on ? "" : "1" })} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-blue bg-blue text-white" : "border-line bg-white text-navy hover:border-blue"}`}>
                  {on && <Icon name="x" size={12} />}{f.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(!q || product) && (
        <>
          <p className="text-sm font-semibold text-navy" data-testid="result-count">
            <span className="text-2xl font-extrabold">{results.length}</span> pharmacie{results.length > 1 ? "s" : ""} correspond{results.length > 1 ? "ent" : ""} à votre recherche
          </p>
          <PharmacyMapList items={items} user={place} emptyText="Aucune pharmacie ne correspond : élargissez le rayon ou retirez un filtre." />
        </>
      )}
    </div>
  );
}
