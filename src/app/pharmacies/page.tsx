import { countryInfo } from "@/lib/config";
import type { Metadata } from "next";
import { PharmacyMapList } from "@/components/NetworkMap";
import { SearchForm } from "@/components/SearchForm";
import { PageTitle } from "@/components/ui";
import { toMapItem } from "@/lib/map-items";
import { lastStockUpdates } from "@/lib/services/pharmacies";
import { resolvePlace, searchPharmacies } from "@/lib/services/search";

export const metadata: Metadata = { title: "Pharmacies" };
export const dynamic = "force-dynamic";

export default async function PharmaciesPage() {
  const center = await resolvePlace(countryInfo().defaultCity);
  const results = await searchPharmacies({ point: center, radiusKm: 50 });
  const updates = await lastStockUpdates(results.map((r) => r.pharmacy.id));
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Réseau" title="Pharmacies connectées" subtitle={`${results.length} pharmacies partagent leurs horaires et leurs disponibilités en temps réel.`} />
      <SearchForm size="md" />
      <PharmacyMapList items={results.map((r) => toMapItem(r, { lastUpdate: updates.get(r.pharmacy.id) }))} user={center} />
    </div>
  );
}
