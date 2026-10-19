import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, StatusDot } from "@/components/badges";
import { Icon, type IconName } from "@/components/brand";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { Card } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { availability, relativeTime } from "@/lib/availability";
import { currency } from "@/lib/config";
import { db } from "@/lib/db";
import { isOnDuty, utcToZonedWallTime } from "@/lib/hours";
import { getSettings } from "@/lib/settings";
import { timezone } from "@/lib/config";
import { pharmacyLogout, quickRespond, updateStock } from "./actions";
import { HoursDutyPanel } from "./forms";

export const metadata: Metadata = { title: "Centre de contrôle pharmacie", robots: { index: false } };
export const dynamic = "force-dynamic";

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function PharmacyDashboard() {
  const u = await requirePharmacyUser();
  const pid = u.pharmacyId;
  const today = startOfDay();
  const [requests, orders, stocks, kRequests, kConfirmed, kOrders] = await Promise.all([
    db.pharmacyRequest.findMany({ where: { pharmacyId: pid, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.order.findMany({ where: { pharmacyId: pid, status: { notIn: ["DELIVERED", "COLLECTED", "CANCELLED"] } }, include: { items: true }, orderBy: { createdAt: "asc" } }),
    db.stock.findMany({ where: { pharmacyId: pid }, include: { product: true }, orderBy: { product: { name: "asc" } } }),
    db.pharmacyRequest.count({ where: { pharmacyId: pid, createdAt: { gte: today } } }),
    db.stock.count({ where: { pharmacyId: pid, source: "PHARMACY", status: { in: ["AVAILABLE", "LOW"] }, confirmedAt: { gte: today } } }),
    db.order.count({ where: { pharmacyId: pid, createdAt: { gte: today } } }),
  ]);
  const now = new Date();
  const { search } = await getSettings(u.pharmacy.country);
  const tz = timezone(u.pharmacy.country);
  const fmt = (d: Date) => d.toLocaleString("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const confirmedAt = u.pharmacy.hoursConfirmedAt;
  const hoursStale = !confirmedAt || now.getTime() - confirmedAt.getTime() > search.hoursMaxAgeDays * 86_400_000;
  const onDutyNow = isOnDuty(u.pharmacy, now);
  const tomorrow8 = new Date(now.getTime() + 86_400_000);
  const defaultUntil = utcToZonedWallTime(onDutyNow ? u.pharmacy.onDutyUntil! : tomorrow8, tz).slice(0, 11) + "08:00";
  const waitingOrders = orders.filter((o) => ["PLACED", "PRESCRIPTION_REVIEW"].includes(o.status)).length;
  const productName = new Map(stocks.map((s) => [s.productId, `${s.product.name} ${s.product.strength ?? ""}`.trim()]));
  const kpis: { label: string; value: number; icon: IconName; accent?: boolean }[] = [
    { label: "demandes", value: kRequests, icon: "chat" },
    { label: "disponibilités confirmées", value: kConfirmed, icon: "check" },
    { label: "commandes", value: kOrders, icon: "bag" },
    { label: "en attente", value: requests.length + waitingOrders, icon: "clock", accent: true },
  ];

  return (
    <div className="space-y-6">
      <section className="relative -mx-4 -mt-8 overflow-hidden bg-navy px-4 pb-8 pt-8 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8">
        <div className="tech-grid absolute inset-0 opacity-25 invert" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-turq">Centre de contrôle</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{u.pharmacy.name}</h1>
            <p className="text-sm text-white/60">{u.name} · {u.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1 [&_span]:text-white/80"><AutoRefresh seconds={30} /></span>
            <form action={pharmacyLogout}>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white/80 hover:bg-white/10"><Icon name="logout" size={16} />Quitter</button>
            </form>
          </div>
        </div>
        <div className="relative mt-6">
          <p className="mb-3 text-sm font-bold text-white/70">Aujourd'hui</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
            {kpis.map((k) => (
              <div key={k.label} className={`rounded-2xl border p-4 ${k.accent ? "border-turq/40 bg-turq/10" : "border-white/10 bg-white/5"}`}>
                <Icon name={k.icon} size={18} className={k.accent ? "text-turq" : "text-white/50"} />
                <p className="mt-2 text-3xl font-extrabold">{k.value}</p>
                <p className="text-xs font-semibold text-white/60">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card>
        <HoursDutyPanel
          hoursLabel={
            hoursStale
              ? `À reconfirmer : les visiteurs voient « Horaires à confirmer » tant que vous ne les avez pas confirmés (validité ${search.hoursMaxAgeDays} jours).`
              : `Confirmés le ${confirmedAt!.toLocaleDateString("fr-FR", { timeZone: tz })}.`
          }
          stale={hoursStale}
          onDuty={onDutyNow}
          dutyLabel={onDutyNow ? `De garde jusqu'au ${fmt(u.pharmacy.onDutyUntil!)}.` : null}
          defaultUntil={defaultUntil}
          minUntil={utcToZonedWallTime(now, tz)}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-extrabold text-navy">
            Demandes en attente <span className="rounded-full bg-warn-50 px-2 text-xs font-bold text-[#a8611d]">{requests.length}</span>
          </h2>
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold text-navy">{r.productId ? `${productName.get(r.productId)}${r.quantity > 1 ? ` × ${r.quantity}` : ""}` : "Question d'un client"}</p>
                  <p className="text-xs text-muted">Demande reçue {relativeTime(r.createdAt)} · <span className="font-mono">{r.publicRef}</span></p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.kind === "VERIFICATION" && (
                    <form action={quickRespond} className="flex gap-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <button name="status" value="CONFIRMED" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-turq px-3 text-xs font-extrabold text-navy hover:brightness-105">Disponible</button>
                      <button name="status" value="UNAVAILABLE" className="inline-flex min-h-9 items-center rounded-lg border border-line-strong px-3 text-xs font-bold text-navy hover:border-danger hover:text-danger">Indisponible</button>
                    </form>
                  )}
                  <Link href={`/pharmacie/demandes/${r.id}`} className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-blue hover:bg-blue-50">Répondre</Link>
                </div>
              </li>
            ))}
            {!requests.length && <li className="py-6 text-center text-sm text-muted">Aucune demande en attente.</li>}
          </ul>
        </Card>

        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-extrabold text-navy">Commandes en cours <span className="rounded-full bg-blue-50 px-2 text-xs font-bold text-blue">{orders.length}</span></h2>
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/pharmacie/commandes/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-blue">
                  <span className="min-w-0">
                    <span className="font-mono text-sm font-bold text-navy">{o.publicRef}</span>
                    <span className="block text-xs text-muted">{o.fulfillment === "PICKUP" ? "Retrait" : "Livraison"} · {o.slot} · {relativeTime(o.createdAt)}</span>
                  </span>
                  <OrderStatusBadge status={o.status} />
                </Link>
              </li>
            ))}
            {!orders.length && <li className="py-6 text-center text-sm text-muted">Aucune commande en cours.</li>}
          </ul>
        </Card>
      </div>

      <Card className="space-y-4">
        <form action={updateStock}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-navy">Stock</h2>
              <p className="text-sm text-muted">Chaque mise à jour est horodatée et visible immédiatement par les patients. Une quantité à 0 passe le produit en indisponible.</p>
            </div>
            <SubmitButton>Mettre à jour le stock</SubmitButton>
          </div>
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                  <th className="px-5 py-2 sm:px-2">Médicament</th>
                  <th className="px-2 py-2">Dosage</th>
                  <th className="px-2 py-2">Disponibilité</th>
                  <th className="px-2 py-2">Quantité</th>
                  <th className="px-2 py-2">Prix ({["XAF", "XOF"].includes(currency(u.pharmacy.country)) ? "FCFA" : currency(u.pharmacy.country)})</th>
                  <th className="px-2 py-2">Dernière mise à jour</th>
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
                      <td className="px-2 py-2.5 text-muted">{s.product.strength ?? "—"}</td>
                      <td className="px-2 py-2.5">
                        <select name={`status_${s.id}`} defaultValue={s.status === "UNKNOWN" ? "AVAILABLE" : s.status} className="min-h-9 rounded-lg border border-line-strong bg-white px-2 text-sm font-semibold text-navy">
                          <option value="AVAILABLE">Disponible</option>
                          <option value="LOW">Stock faible</option>
                          <option value="OUT">Indisponible</option>
                        </select>
                      </td>
                      <td className="px-2 py-2.5"><input name={`qty_${s.id}`} type="number" min={0} defaultValue={s.quantity ?? ""} placeholder="—" className="min-h-9 w-20 rounded-lg border border-line-strong px-2 text-sm" aria-label={`Quantité de ${s.product.name}`} /></td>
                      <td className="px-2 py-2.5"><input name={`price_${s.id}`} type="number" min={0} defaultValue={s.price} className="min-h-9 w-24 rounded-lg border border-line-strong px-2 text-sm" aria-label={`Prix de ${s.product.name}`} /></td>
                      <td className="px-2 py-2.5 text-xs text-muted">{s.confirmedAt ? relativeTime(s.confirmedAt) : "Jamais"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      </Card>
    </div>
  );
}
