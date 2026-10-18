import Link from "next/link";
import type { Metadata } from "next";
import { PharmacyCard } from "@/components/PharmacyCard";
import { SearchForm } from "@/components/SearchForm";
import { Alert, Badge, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { toggleFavoriteProduct } from "../compte/actions";
import { resolvePlace, searchPharmacies, searchProducts } from "@/lib/services/search";

export const metadata: Metadata = { title: "Recherche" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

const REG_LABEL = { PRESCRIPTION: "Sur ordonnance", RESTRICTED: "Délivrance encadrée : non commandable en ligne" } as const;

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const lieu = (sp.lieu ?? "").trim();
  const rayon = Math.min(50, Math.max(1, Number(sp.rayon) || 5));
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && sp.lat !== "" && sp.lng !== "" && sp.lat !== undefined;

  const products = q ? await searchProducts(q) : [];
  const product = sp.produit
    ? await db.product.findUnique({ where: { slug: sp.produit } })
    : products.length === 1
      ? products[0]
      : (products.find((p) => p.name.toLowerCase() === q.toLowerCase()) ?? null);

  const place = hasGeo ? { lat, lng, label: "votre position" } : lieu ? await resolvePlace(lieu) : null;
  const results = q && !product ? [] : await searchPharmacies({ productId: product?.id, point: place, radiusKm: rayon, place: place ? undefined : lieu });

  const customer = await getCustomer();
  const favorite = customer && product ? await db.favoriteProduct.findUnique({ where: { customerId_productId: { customerId: customer.id, productId: product.id } } }) : null;

  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, lieu, rayon: String(rayon), lat: sp.lat ?? "", lng: sp.lng ?? "", ...extra })) if (v) u.set(k, v);
    return `/recherche?${u}`;
  };

  return (
    <div className="space-y-6">
      <Card><SearchForm q={q} lieu={lieu} rayon={String(rayon)} lat={sp.lat} lng={sp.lng} /></Card>

      {q && products.length === 0 && <Alert tone="amber">Aucun médicament ne correspond à « {q} ». Vérifiez l'orthographe ou cherchez par molécule.</Alert>}
      {lieu && !hasGeo && !place && <Alert tone="amber">Lieu « {lieu} » non reconnu : résultats filtrés par nom de ville ou de quartier.</Alert>}

      {products.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Précisez le produit :</p>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => (
              <Link key={p.id} href={keep({ produit: p.slug })} className={`rounded-full border px-3 py-1.5 text-sm ${product?.id === p.id ? "border-brand-600 bg-brand-50 font-semibold" : "border-line bg-white hover:border-brand-500"}`}>
                {p.name} {p.strength} · {p.form}
              </Link>
            ))}
          </div>
        </div>
      )}

      {product && (
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{product.name} {product.strength}</h1>
          <span className="text-sm text-muted">{product.dci} · {product.form}</span>
          {product.regulation !== "OTC" && <Badge tone="amber">{REG_LABEL[product.regulation]}</Badge>}
          {customer && (
            <form action={toggleFavoriteProduct}>
              <input type="hidden" name="productId" value={product.id} />
              <SubmitButton variant="secondary">{favorite ? "♥ Favori" : "♡ Ajouter aux favoris"}</SubmitButton>
            </form>
          )}
        </div>
      )}
      {!q && <h1 className="text-xl font-bold">Pharmacies {place ? `autour de ${place.label}` : lieu ? `à ${lieu}` : ""}</h1>}

      {(!q || product) && (
        <p className="text-sm text-muted" data-testid="result-count">
          {results.length} pharmacie{results.length > 1 ? "s" : ""}{place ? ` dans un rayon de ${rayon} km` : ""}.
        </p>
      )}
      <div className="space-y-4">
        {results.map((r) => (
          <PharmacyCard key={r.pharmacy.id} r={r} product={product} />
        ))}
      </div>
    </div>
  );
}
