import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { countryInfo, currency, defaultCountryCode } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { readPath, SETTING_SECTIONS } from "@/lib/settings-fields";
import { AdminNav } from "../AdminNav";
import { SettingsForm } from "../forms";

export const metadata: Metadata = { title: "Réglages · Administration", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const a = await requireAdmin();
  const country = defaultCountryCode();
  const settings = await getSettings(country);
  const sections = SETTING_SECTIONS.map((s) => ({
    title: s.title,
    fields: s.fields.map((f) => {
      const v = readPath(settings, f.path);
      return { ...f, value: Array.isArray(v) ? v.join(", ") : String(v ?? "") };
    }),
  }));
  return (
    <div className="mx-auto max-w-4xl">
      <AdminNav name={a.name} current="/admin/reglages" />
      <h1 className="text-2xl font-extrabold text-navy">Réglages · {countryInfo(country).name}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Montants en {currency(country)}. Aucune règle financière n'est figée dans le code : chaque modification s'applique immédiatement et reste tracée dans le journal d'audit.
      </p>
      <SettingsForm country={country} currency={currency(country)} sections={sections} />
    </div>
  );
}
