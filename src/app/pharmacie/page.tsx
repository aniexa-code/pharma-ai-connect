import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/badges";
import { Icon, type IconName } from "@/components/brand";
import { AutoRefresh } from "@/components/client";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { relativeTime } from "@/lib/availability";
import { db } from "@/lib/db";
import { isOnDuty, utcToZonedWallTime } from "@/lib/hours";
import { getSettings } from "@/lib/settings";
import { billingOverview } from "@/lib/services/billing";
import { timezone } from "@/lib/config";
import { pharmacyLogout, quickRespond } from "./actions";
import { HoursDutyPanel } from "./forms";

export const metadata: Metadata = { title: "Centre de contrôle pharmacie", robots: { index: false } };
export const dynamic = "force-dynamic";

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Abonnement : essai qui se termine, échéance impayée ou suspension, avec le lien pour régler. */
async function BillingBanner({ pharmacyId }: { pharmacyId: string }) {
  const { subscription: s, due, daysLeft } = await billingOverview(pharmacyId);
  const { billing } = await getSettings();
  if (s.exempt) return null;
  const soon = daysLeft !== null && daysLeft <= billing.reminderDays && !due.length;
  if (s.status === "ACTIVE" && !soon && !due.length) return null;
  const tone = s.status === "SUSPENDED" ? "red" : s.status === "PAST_DUE" || due.length ? "amber" : "blue";
  const text =
    s.status === "SUSPENDED"
      ? "Votre pharmacie est suspendue pour impayé : elle n'est plus visible et ne reçoit plus de commandes. Réglez la facture pour la réactiver immédiatement."
      : s.status === "PAST_DUE"
        ? `Paiement en retard : réglez votre facture avant ${billing.graceDays} jours après l'échéance pour éviter la suspension.`
        : s.status === "TRIAL"
          ? `Essai gratuit : ${Math.max(0, daysLeft ?? 0)} jour${(daysLeft ?? 0) > 1 ? "s" : ""} restant${(daysLeft ?? 0) > 1 ? "s" : ""}. Choisissez votre formule pour continuer sans interruption.`
          : `Votre abonnement arrive à échéance dans ${daysLeft} jour${(daysLeft ?? 0) > 1 ? "s" : ""}.`;
  return (
    <div data-testid="billing-banner">
      <Alert tone={tone}>
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span>{text}</span>
          <Link href="/pharmacie/abonnement" className="font-bold underline">Mon abonnement</Link>
        </span>
      </Alert>
    </div>
  );
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
  const staleBefore = new Date(now.getTime() - 48 * 3_600_000);
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
            <Link href="/pharmacie/abonnement" className="inline-flex min-h-10 items-center rounded-xl border border-white/20 px-3 text-sm font-semibold text-white/80 hover:bg-white/10">Abonnement</Link>
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

      <BillingBanner pharmacyId={pid} />

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

      <Card className="flex flex-wrap items-center justify-between gap-4" data-testid="stock-summary">
        <div>
          <h2 className="font-extrabold text-navy">Stock numérique</h2>
          <p className="text-sm text-muted">
            {stocks.length} produits · {stocks.filter((s) => s.status === "OUT").length} indisponibles ·{" "}
            {stocks.filter((s) => !s.confirmedAt || s.confirmedAt < staleBefore).length} à mettre à jour (plus de 48 h)
          </p>
        </div>
        <ButtonLink href="/pharmacie/stock">Gérer le stock, importer, exporter</ButtonLink>
      </Card>
    </div>
  );
}
