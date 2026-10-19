import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/brand";
import { SubmitButton } from "@/components/client";
import { PharmacyMapList } from "@/components/NetworkMap";
import { SearchForm } from "@/components/SearchForm";
import { Alert, Badge, buttonClass } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { availability } from "@/lib/availability";
import { countryInfo } from "@/lib/config";
import { db } from "@/lib/db";
import { toMapItem } from "@/lib/map-items";
import { lastStockUpdates } from "@/lib/services/pharmacies";
import { nearestZone, prioritizeOnDuty, resolvePlace, searchPharmacies, searchProducts, widerRadii } from "@/lib/services/search";
import { getSettings } from "@/lib/settings";
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

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const lieu = (sp.lieu ?? "").trim();
  const { search } = await getSettings();
  const rayon = Math.round(Math.min(search.maxRadiusKm, Math.max(1, Number(sp.rayon) || search.defaultRadiusKm)) * 10) / 10;
  const radii = [...new Set([...search.radiusOptionsKm, rayon])].sort((a, b) => a - b);
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  // Un lieu saisi à la main l'emporte sur une position précédemment partagée.
  const hasGeo = !!sp.lat && !!sp.lng && Number.isFinite(lat) && Number.isFinite(lng) && (!lieu || lieu === "Ma position");

  const products = q ? await searchProducts(q) : [];
  const product = sp.produit
    ? await db.product.findUnique({ where: { slug: sp.produit } })
    : products.length === 1
      ? products[0]
      : (products.find((p) => p.name.toLowerCase() === q.toLowerCase()) ?? null);

  const near = hasGeo ? await nearestZone({ lat, lng }) : null;
  const place = hasGeo
    ? { lat, lng, label: near ? `votre position · près de ${near.name}` : "votre position" }
    : lieu
      ? await resolvePlace(lieu)
      : await resolvePlace(countryInfo().defaultCity);
  // Sans lieu précisé, on part du centre-ville sans limiter le rayon.
  const located = hasGeo || !!lieu;
  const all = q && !product ? [] : await searchPharmacies({ productId: product?.id, point: place, radiusKm: located ? rayon : search.maxRadiusKm, place: place ? undefined : lieu });
  const filtered = all.filter(
    (r) =>
      (!sp.dispo || availability(r.stock).state === "AVAILABLE") &&
      (!sp.ouvert || r.open.open) &&
      (!sp.garde || r.onDuty) &&
      (!sp.retrait || r.pharmacy.offersPickup) &&
      (!sp.livraison || r.pharmacy.offersDelivery),
  );
  const { results, night } = prioritizeOnDuty(filtered);
  // « Pertinent » : une pharmacie où le produit n'est pas déclaré indisponible.
  const relevant = results.filter((r) => !product || availability(r.stock).state !== "UNAVAILABLE");
  const expand = located && place ? widerRadii(rayon, search.maxRadiusKm) : [];
  const updates = product ? new Map() : await lastStockUpdates(results.map((r) => r.pharmacy.id));
  const items = results.map((r) => toMapItem(r, { productSlug: product?.slug, lastUpdate: updates.get(r.pharmacy.id) }));

  const base = { q, lieu, rayon: String(rayon), lat: hasGeo ? (sp.lat ?? "") : "", lng: hasGeo ? (sp.lng ?? "") : "", produit: product?.slug ?? "", ...Object.fromEntries(FILTERS.map((f) => [f.key, sp[f.key] ?? ""])) };
  const link = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) u.set(k, v);
    return `/recherche?${u}`;
  };
  const customer = await getCustomer();
  const favorite = customer && product ? await db.favoriteProduct.findUnique({ where: { customerId_productId: { customerId: customer.id, productId: product.id } } }) : null;

  return (
    <div className="space-y-6">
      <SearchForm size="md" q={q} lieu={lieu} rayon={String(rayon)} lat={base.lat} lng={base.lng} />

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
              {radii.map((r) => (
                <Link key={r} href={link({ rayon: String(r) })} className={`rounded-full px-2.5 py-1 text-xs font-bold ${rayon === r ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"}`}>{r} km</Link>
              ))}
            </span>}
            {located && (
              <form action="/recherche" method="get" className="inline-flex items-center gap-1" aria-label="Rayon personnalisé">
                {Object.entries(base).filter(([k, v]) => v && k !== "rayon").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                <input name="rayon" type="number" min={1} max={search.maxRadiusKm} step="0.5" placeholder="Autre" aria-label={`Rayon personnalisé en km (maximum ${search.maxRadiusKm})`} className="h-8 w-20 rounded-full border border-line bg-white px-3 text-xs font-bold text-navy outline-none focus:border-blue" />
                <button className="h-8 rounded-full border border-line bg-white px-2.5 text-xs font-bold text-navy hover:border-blue">km</button>
              </form>
            )}
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
          {night && (
            <Alert tone="blue">
              {results.some((r) => r.onDuty)
                ? "Aucune pharmacie classique n'est ouverte en ce moment dans votre zone : les pharmacies de garde sont affichées en premier."
                : "Aucune pharmacie classique n'est ouverte en ce moment, et aucune pharmacie de garde n'est déclarée dans votre zone."}
            </Alert>
          )}
          {relevant.length === 0 && expand.length > 0 && (
            <div className="space-y-4 rounded-2xl border border-line bg-white p-5 text-center sm:p-8" data-testid="expand-zone">
              <p className="mx-auto max-w-xl font-semibold text-navy">
                Nous n'avons trouvé aucune pharmacie correspondant à votre recherche dans votre zone actuelle. Voulez-vous élargir votre zone de recherche ?
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {expand.map((r, i) => (
                  <Link key={r} href={link({ rayon: String(r) })} className={buttonClass(i === 0 ? "primary" : "secondary")}>Élargir à {r} km</Link>
                ))}
                <a href="#lieu" className={buttonClass("ghost")}>Modifier ma zone</a>
              </div>
            </div>
          )}
          {(results.length > 0 || expand.length === 0) && (
            <PharmacyMapList items={items} user={place} emptyText="Aucune pharmacie ne correspond : retirez un filtre ou modifiez votre zone." />
          )}
        </>
      )}
    </div>
  );
}
