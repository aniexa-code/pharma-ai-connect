import { availability, relativeTime } from "./availability";
import { formatDistance } from "./geo";
import type { PharmacyResult } from "./services/search";
import type { MapItem } from "@/components/NetworkMap";

export function directionsUrl(p: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

/** Résultat de recherche → élément de liste/carte (sérialisable pour le composant client). */
export function toMapItem(r: PharmacyResult, opts: { productSlug?: string | null; lastUpdate?: Date | null; query?: string } = {}): MapItem {
  const p = r.pharmacy;
  const a = opts.productSlug ? availability(r.stock) : null;
  const qs = new URLSearchParams();
  if (opts.productSlug) qs.set("produit", opts.productSlug);
  if (r.distance !== null) qs.set("d", r.distance.toFixed(2));
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    district: p.district,
    lat: p.lat,
    lng: p.lng,
    href: `/pharmacies/${p.slug}${qs.size ? `?${qs}` : ""}`,
    state: a?.state ?? null,
    stateLabel: a?.label ?? "",
    updated: a ? a.updated : opts.lastUpdate ? `Stock mis à jour ${relativeTime(opts.lastUpdate)}` : null,
    open: r.open.open,
    openLabel: r.open.label,
    onDuty: p.onDuty,
    distance: r.distance !== null ? formatDistance(r.distance) : null,
    directions: directionsUrl(p),
  };
}
