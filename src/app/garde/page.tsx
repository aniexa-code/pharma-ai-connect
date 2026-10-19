import { countryInfo } from "@/lib/config";
import type { Metadata } from "next";
import { Icon } from "@/components/brand";
import { PharmacyMapList } from "@/components/NetworkMap";
import { hoursLines, type WeeklyHours } from "@/lib/hours";
import { toMapItem } from "@/lib/map-items";
import { lastStockUpdates } from "@/lib/services/pharmacies";
import { resolvePlace, searchPharmacies } from "@/lib/services/search";

export const metadata: Metadata = { title: "Pharmacies de garde" };
export const dynamic = "force-dynamic";

export default async function OnDutyPage() {
  const center = await resolvePlace(countryInfo().defaultCity);
  const results = (await searchPharmacies({ point: center, radiusKm: 50 })).filter((r) => r.onDuty);
  const updates = await lastStockUpdates(results.map((r) => r.pharmacy.id));
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-8 text-white sm:px-10">
        <div className="tech-grid absolute inset-0 opacity-40 invert" />
        <div className="relative space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-turq px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-navy"><Icon name="moon" size={13} /> De garde</span>
          <h1 className="text-3xl font-extrabold">Pharmacies de garde</h1>
          <p className="max-w-xl text-white/70">Ouvertes en dehors des horaires habituels. Appelez avant de vous déplacer la nuit.</p>
        </div>
      </section>
      <PharmacyMapList items={results.map((r) => toMapItem(r, { lastUpdate: updates.get(r.pharmacy.id) }))} user={center} emptyText="Aucune pharmacie de garde déclarée pour le moment." />
      <div className="grid gap-4 sm:grid-cols-2">
        {results.map((r) => (
          <div key={r.pharmacy.id} className="rounded-2xl border border-line bg-white p-5">
            <p className="mb-3 font-bold text-navy">Horaires · {r.pharmacy.name}</p>
            <ul className="space-y-1 text-sm">
              {hoursLines(r.pharmacy.openingHours as WeeklyHours).map((l) => (
                <li key={l.day} className="flex justify-between"><span className="text-muted">{l.day}</span><span className="font-semibold text-navy">{l.text === "00:00 – 24:00" ? "24 h / 24" : l.text}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
