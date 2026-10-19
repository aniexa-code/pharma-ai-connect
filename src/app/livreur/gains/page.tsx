import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDate } from "@/components/badges";
import { Alert, Badge, Card } from "@/components/ui";
import { requireCourier } from "@/lib/auth";
import { countryInfo, formatMoney } from "@/lib/config";
import { courierEarnings } from "@/lib/services/ledger";
import { getSettings } from "@/lib/settings";
import { PayoutForm } from "./forms";

export const metadata: Metadata = { title: "Mes gains", robots: { index: false } };
export const dynamic = "force-dynamic";

const METHOD = { MOBILE_MONEY: "Mobile Money (MTN)", MOOV_MONEY: "Moov Money" } as Record<string, string>;
const PAYOUT = { REQUESTED: { label: "En cours", tone: "amber" }, PAID: { label: "Payé", tone: "green" }, REJECTED: { label: "Refusé", tone: "red" } } as const;

export default async function Earnings() {
  const c = await requireCourier();
  if (c.verificationStatus !== "APPROVED" || !c.active) redirect("/livreur");
  const [e, settings] = await Promise.all([courierEarnings(c.id), getSettings()]);
  const rules = settings.courier;
  const info = countryInfo();
  const pending = e.payouts.find((p) => p.status === "REQUESTED");
  const kpis = [
    { label: "Aujourd'hui", ...e.today },
    { label: "7 derniers jours", ...e.week },
    { label: "Depuis le début", ...e.total },
  ];
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/livreur" className="text-sm font-semibold text-blue">← Missions</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-navy">Mes gains</h1>
        <p className="text-sm text-muted">Votre part des frais de livraison, après la commission de la plateforme ({settings.delivery.commissionPct} %). Un gain n'est crédité qu'une fois la livraison validée par le code du client.</p>
      </div>
      <div className="rounded-2xl bg-navy p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Solde disponible</p>
        <p className="text-3xl font-extrabold text-turq" data-testid="balance">{formatMoney(e.balance, info.currency)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3">
            <p className="font-extrabold text-navy">{formatMoney(k.amount, info.currency)}</p>
            <p className="text-[11px] text-muted">{k.label} · {k.count} course{k.count > 1 ? "s" : ""}</p>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-5">
        <h2 className="font-extrabold text-navy">Retirer mes gains</h2>
        {pending ? (
          <Alert tone="blue">Demande de {formatMoney(pending.amount, pending.currency)} en cours de traitement, vers le {pending.phone}.</Alert>
        ) : e.balance < rules.payoutMinimum ? (
          <p className="text-sm text-muted">Le retrait est possible à partir de {formatMoney(rules.payoutMinimum, info.currency)}.</p>
        ) : (
          <PayoutForm
            balance={e.balance}
            minimum={rules.payoutMinimum}
            methods={info.payoutMethods.map((m) => ({ value: m, label: METHOD[m] ?? m }))}
            phone={c.phone}
            currencyLabel={["XOF", "XAF"].includes(info.currency) ? "FCFA" : info.currency}
          />
        )}
      </Card>
      <Card className="space-y-2 p-5">
        <h2 className="font-extrabold text-navy">Historique</h2>
        {e.entries.length === 0 && <p className="text-sm text-muted">Aucune opération pour l'instant.</p>}
        <ul className="divide-y divide-line text-sm" data-testid="earning-entries">
          {e.entries.map((x) => (
            <li key={x.id} className="flex justify-between gap-3 py-2">
              <span><span className="font-semibold text-navy">{x.note}</span><br /><span className="text-xs text-muted">{formatDate(x.createdAt)}</span></span>
              <span className={`whitespace-nowrap font-bold ${x.amount >= 0 ? "text-turq-700" : "text-navy"}`}>{x.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(x.amount), x.currency)}</span>
            </li>
          ))}
        </ul>
        {e.payouts.length > 0 && (
          <ul className="space-y-1 border-t border-line pt-3 text-sm">
            {e.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span>Retrait {formatMoney(p.amount, p.currency)} · {formatDate(p.createdAt)}</span>
                <Badge tone={PAYOUT[p.status].tone}>{PAYOUT[p.status].label}</Badge>
                {p.providerRef && <span className="text-xs text-muted">réf. {p.providerRef}</span>}
                {p.status === "REJECTED" && p.note && <span className="text-xs text-muted">{p.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
