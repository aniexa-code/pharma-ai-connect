import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { countryInfo } from "@/lib/config";
import { db } from "@/lib/db";
import { isOnDuty } from "@/lib/hours";
import { getSettings } from "@/lib/settings";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Administration", robots: { index: false } };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  SETTINGS_UPDATED: "Réglages modifiés",
  HOURS_CONFIRMED: "Horaires confirmés",
  DUTY_DECLARED: "Garde déclarée",
  DUTY_ENDED: "Garde terminée",
};

export default async function AdminHome() {
  const a = await requireAdmin();
  const now = new Date();
  const { search } = await getSettings();
  const staleBefore = new Date(now.getTime() - search.hoursMaxAgeDays * 86_400_000);
  const [pharmacies, couriers, ordersToday, logs] = await Promise.all([
    db.pharmacy.findMany({ orderBy: { name: "asc" } }),
    db.courier.count({ where: { active: true } }),
    db.order.count({ where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const stale = pharmacies.filter((p) => p.active && (!p.hoursConfirmedAt || p.hoursConfirmedAt < staleBefore));
  const onDuty = pharmacies.filter((p) => p.active && isOnDuty(p, now));

  const stats = [
    { label: "Pharmacies actives", value: pharmacies.filter((p) => p.active).length },
    { label: "De garde en ce moment", value: onDuty.length },
    { label: "Livreurs actifs", value: couriers },
    { label: "Commandes (24 h)", value: ordersToday },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <AdminNav name={a.name} current="/admin" />
      <h1 className="mb-4 text-2xl font-extrabold text-navy">Vue d'ensemble · {countryInfo().name}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-2xl font-extrabold text-navy">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-extrabold text-navy">Alertes</h2>
        {stale.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Aucune alerte : toutes les pharmacies ont des horaires confirmés depuis moins de {search.hoursMaxAgeDays} jours.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {stale.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">Horaires à confirmer</Badge>
                <span className="font-semibold text-navy">{p.name}</span>
                <span className="text-muted">
                  {p.hoursConfirmedAt ? `confirmés le ${p.hoursConfirmedAt.toLocaleDateString("fr-FR")}` : "jamais confirmés"} · affichée « à confirmer » au public
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-extrabold text-navy">Journal d'audit</h2>
        <p className="text-xs text-muted">Toute modification sensible est enregistrée avec son auteur, sa date et les valeurs avant / après.</p>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune opération enregistrée pour l'instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><span className="font-semibold text-navy">{ACTION_LABEL[l.action] ?? l.action}</span> · {l.entity}</span>
                <span className="text-muted">{l.actorType} · {l.createdAt.toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
