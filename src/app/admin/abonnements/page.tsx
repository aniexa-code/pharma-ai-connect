import type { Metadata } from "next";
import { formatDate } from "@/components/badges";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { PLAN_LABEL, SUB_STATUS_LABEL, type Plan } from "@/lib/services/billing";
import { AdminNav } from "../AdminNav";
import { MarkPaidForm, RunBillingForm } from "./forms";

export const metadata: Metadata = { title: "Abonnements", robots: { index: false } };
export const dynamic = "force-dynamic";

const TONE = { TRIAL: "blue", ACTIVE: "green", PAST_DUE: "amber", SUSPENDED: "red" } as const;
const ORDER = { SUSPENDED: 0, PAST_DUE: 1, TRIAL: 2, ACTIVE: 3 } as const;

export default async function Subscriptions() {
  const a = await requireAdmin();
  const subs = await db.subscription.findMany({ where: { exempt: false }, include: { pharmacy: true, invoices: { where: { status: "DUE" }, orderBy: { dueAt: "asc" } } } });
  subs.sort((x, y) => ORDER[x.status] - ORDER[y.status]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AdminNav name={a.name} current="/admin/abonnements" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Abonnements des pharmacies</h1>
          <p className="text-sm text-muted">La facturation tourne chaque jour : factures, retards, puis suspension automatique après le délai de grâce.</p>
        </div>
        <RunBillingForm />
      </div>
      <Card className="p-0" data-testid="subscriptions">
        {subs.length === 0 && <p className="p-5 text-sm text-muted">Aucune pharmacie facturée pour l'instant (les pharmacies de démonstration ne le sont jamais).</p>}
        <ul className="divide-y divide-line">
          {subs.map((s) => (
            <li key={s.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-navy">{s.pharmacy.name}</span>
                <Badge tone={TONE[s.status]}>{SUB_STATUS_LABEL[s.status]}</Badge>
                <span className="text-muted">
                  {s.model === "COMMISSION" ? "Commission sur ventes" : `Forfait ${PLAN_LABEL[(s.plan ?? "MONTHLY") as Plan].toLowerCase()}`}
                  {s.status === "TRIAL" && s.trialEndsAt ? ` · essai jusqu'au ${formatDate(s.trialEndsAt)}` : ""}
                  {s.currentPeriodEnd ? ` · payé jusqu'au ${formatDate(s.currentPeriodEnd)}` : ""}
                </span>
              </div>
              {s.invoices.map((i) => (
                <div key={i.id} className="space-y-1 rounded-xl bg-icy p-3">
                  <p>{i.label} · <strong>{formatMoney(i.amount, i.currency)}</strong> · échéance {formatDate(i.dueAt)}</p>
                  <MarkPaidForm invoiceId={i.id} />
                </div>
              ))}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
