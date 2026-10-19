import type { Metadata } from "next";
import { formatDate } from "@/components/badges";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { ACCOUNT_LABEL, ledgerTotals } from "@/lib/services/ledger";
import { AdminNav } from "../AdminNav";
import { PayoutDecisionForm } from "./forms";

export const metadata: Metadata = { title: "Finances", robots: { index: false } };
export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "30", label: "30 derniers jours", days: 30 },
  { key: "tout", label: "Depuis le début", days: 0 },
];

export default async function Finances({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const a = await requireAdmin();
  const { periode } = await searchParams;
  const period = PERIODS.find((p) => p.key === periode) ?? PERIODS[0];
  const since = period.days ? new Date(Date.now() - period.days * 86_400_000) : undefined;
  const [totals, payouts, recent] = await Promise.all([
    ledgerTotals(since),
    db.payoutRequest.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "asc" } }),
    db.ledgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const couriers = new Map((await db.courier.findMany({ where: { id: { in: payouts.map((p) => p.courierId) } } })).map((c) => [c.id, c]));
  const platform = totals.filter((t) => t.account.startsWith("PLATFORM_")).reduce((n, t) => n + t.amount, 0);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AdminNav name={a.name} current="/admin/finances" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Finances</h1>
          <p className="text-sm text-muted">Grand livre immuable : chaque écriture est définitive, une correction s'ajoute en écriture inverse.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {PERIODS.map((p) => <a key={p.key} href={`?periode=${p.key}`} className={`rounded-full px-3 py-1 font-semibold ${p === period ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-line"}`}>{p.label}</a>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="ledger-totals">
        <div className="rounded-2xl bg-navy p-4 text-white"><p className="text-2xl font-extrabold text-turq">{formatMoney(platform)}</p><p className="text-xs text-white/70">Revenus de la plateforme</p></div>
        {totals.map((t) => (
          <Card key={t.account + t.currency} className="p-4">
            <p className="text-xl font-extrabold text-navy">{formatMoney(t.amount, t.currency)}</p>
            <p className="text-xs text-muted">{ACCOUNT_LABEL[t.account] ?? t.account} · {t.count} écriture{t.count > 1 ? "s" : ""}</p>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-5">
        <h2 className="font-extrabold text-navy">Retraits à payer</h2>
        {payouts.length === 0 && <p className="text-sm text-muted">Aucune demande en attente.</p>}
        <ul className="divide-y divide-line">
          {payouts.map((p) => (
            <li key={p.id} className="space-y-2 py-3 text-sm">
              <p><span className="font-bold text-navy">{couriers.get(p.courierId)?.name}</span> · {formatMoney(p.amount, p.currency)} · {p.method === "MOOV_MONEY" ? "Moov Money" : "Mobile Money"} {p.phone} · {formatDate(p.createdAt)}</p>
              <PayoutDecisionForm id={p.id} />
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-extrabold text-navy">Dernières écritures</h2>
        <ul className="divide-y divide-line text-sm">
          {recent.map((e) => (
            <li key={e.id} className="flex justify-between gap-3 py-1.5">
              <span><span className="font-semibold text-navy">{ACCOUNT_LABEL[e.account] ?? e.account}</span> · {e.note} <span className="text-xs text-muted">{formatDate(e.createdAt)}</span></span>
              <span className="whitespace-nowrap font-bold">{formatMoney(e.amount, e.currency)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
