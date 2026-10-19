import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/components/badges";
import { Alert, Badge, Card } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { PLAN_LABEL, PLAN_MONTHS, SUB_STATUS_LABEL, billingOverview, type Plan } from "@/lib/services/billing";
import { getSettings } from "@/lib/settings";
import { BillingChoiceForm, PayInvoiceForm } from "./forms";

export const metadata: Metadata = { title: "Abonnement", robots: { index: false } };
export const dynamic = "force-dynamic";

const TONE = { TRIAL: "blue", ACTIVE: "green", PAST_DUE: "amber", SUSPENDED: "red" } as const;

export default async function BillingPage() {
  const u = await requirePharmacyUser();
  const [{ subscription: s, invoices, due, daysLeft }, { billing }] = await Promise.all([billingOverview(u.pharmacyId), getSettings(u.pharmacy.country)]);
  const plans = Object.keys(PLAN_MONTHS) as Plan[];
  const options = [
    ...plans.map((p) => ({
      value: p,
      title: `Forfait ${PLAN_LABEL[p].toLowerCase()}`,
      price: formatMoney(billing.plans[p]),
      detail: `Pour ${PLAN_MONTHS[p]} mois${p !== "MONTHLY" ? `, soit ${formatMoney(Math.round(billing.plans[p] / PLAN_MONTHS[p]))} par mois` : ""}. Aucune commission sur vos ventes.`,
    })),
    { value: "COMMISSION", title: "Sans abonnement", price: `${billing.commissionPct} % des ventes`, detail: "Facturé chaque mois sur les ventes réalisées via Pharma AI Connect. Rien à payer sans vente." },
  ];
  const current = s.model === "COMMISSION" ? "COMMISSION" : (s.plan ?? "MONTHLY");
  const sandbox = process.env.PAYMENT_PROVIDER === "sandbox";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/pharmacie" className="text-sm font-semibold text-blue">← Centre de contrôle</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-navy">Abonnement</h1>
        <Badge tone={TONE[s.status]}><span data-testid="subscription-status">{SUB_STATUS_LABEL[s.status]}</span></Badge>
      </div>
      {s.exempt ? (
        <Alert tone="blue">Pharmacie de démonstration : aucune facturation.</Alert>
      ) : (
        <>
          {s.status === "TRIAL" && daysLeft !== null && <p className="text-sm text-muted">Essai gratuit jusqu'au {formatDate(s.trialEndsAt!)} ({Math.max(0, daysLeft)} jours restants).</p>}
          {s.status === "ACTIVE" && s.model === "SUBSCRIPTION" && s.currentPeriodEnd && <p className="text-sm text-muted">Abonnement payé jusqu'au {formatDate(s.currentPeriodEnd)}.</p>}
          {s.status === "SUSPENDED" && <Alert>Pharmacie suspendue pour impayé : invisible pour les patients et sans nouvelles commandes. Le règlement la réactive immédiatement.</Alert>}
          {due.length > 0 && (
            <Card className="space-y-3 p-5 ring-2 ring-warn/40" data-testid="invoices-due">
              <h2 className="font-extrabold text-navy">À régler</h2>
              {due.map((i) => (
                <div key={i.id} className="space-y-2 border-t border-line pt-3 first:border-0 first:pt-0">
                  <p className="text-sm"><span className="font-semibold text-navy">{i.label}</span> · {formatMoney(i.amount, i.currency)} · échéance {formatDate(i.dueAt)}</p>
                  <PayInvoiceForm invoiceId={i.id} amount={formatMoney(i.amount, i.currency)} sandbox={sandbox} />
                </div>
              ))}
              <p className="text-xs text-muted">Sans règlement {billing.graceDays} jours après l'échéance, la pharmacie est suspendue automatiquement.</p>
            </Card>
          )}
          <Card className="space-y-3 p-5">
            <h2 className="font-extrabold text-navy">Ma formule</h2>
            <BillingChoiceForm options={options} current={current} />
          </Card>
        </>
      )}
      <Card className="p-5">
        <h2 className="mb-2 font-extrabold text-navy">Factures</h2>
        {invoices.length === 0 && <p className="text-sm text-muted">Aucune facture pour l'instant.</p>}
        <ul className="divide-y divide-line text-sm">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{i.label}<br /><span className="text-xs text-muted">{formatDate(i.createdAt)}{i.providerRef ? ` · réf. ${i.providerRef}` : ""}</span></span>
              <span className="flex items-center gap-2 font-bold text-navy">{formatMoney(i.amount, i.currency)} <Badge tone={i.status === "PAID" ? "green" : i.status === "DUE" ? "amber" : "gray"}>{i.status === "PAID" ? "Payée" : i.status === "DUE" ? "À régler" : "Annulée"}</Badge></span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
