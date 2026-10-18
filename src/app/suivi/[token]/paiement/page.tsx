import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/client";
import { Alert, Card, PageTitle } from "@/components/ui";
import { formatMoney } from "@/lib/config";
import { METHOD_LABEL, PAYMENT_LABEL, availableMethods } from "@/lib/services/orders";
import { orderByTrackingToken } from "@/lib/services/tracking";
import { changePaymentMethod, sandboxPay } from "../../actions";

export const metadata: Metadata = { title: "Paiement", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await orderByTrackingToken(token);
  if (!o) notFound();
  if (o.status !== "AWAITING_PAYMENT") redirect(`/suivi/${token}`);
  const current = o.payments.findLast((p) => p.status === "PENDING");
  const last = o.payments.at(-1);
  const methods = availableMethods(o.pharmacy.paymentMethods);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageTitle title="Paiement" subtitle={`Commande ${o.publicRef} · ${formatMoney(o.total, o.currency)}`} />
      {last && ["FAILED", "CANCELLED"].includes(last.status) && (
        <Alert tone="red">Dernière tentative : {PAYMENT_LABEL[last.status].toLowerCase()}. Vous pouvez réessayer ou choisir un autre moyen.</Alert>
      )}
      {current && current.method !== "CASH" ? (
        <Card className="space-y-4">
          <p className="text-sm">{METHOD_LABEL[current.method]} : {formatMoney(current.amount, o.currency)}</p>
          {process.env.PAYMENT_PROVIDER === "sandbox" && (
            <Alert tone="amber">Prestataire de paiement en mode test : aucun débit réel. Choisissez l'issue à simuler.</Alert>
          )}
          <form action={sandboxPay} className="flex flex-wrap gap-2">
            <input type="hidden" name="token" value={token} />
            <SubmitButton name="outcome" value="CONFIRMED">Payer {formatMoney(current.amount, o.currency)}</SubmitButton>
            <SubmitButton name="outcome" value="FAILED" variant="secondary">Simuler un échec</SubmitButton>
            <SubmitButton name="outcome" value="CANCELLED" variant="secondary">Annuler le paiement</SubmitButton>
          </form>
        </Card>
      ) : null}
      <Card className="space-y-3">
        <p className="text-sm font-medium">{current ? "Changer de moyen de paiement" : "Choisir un moyen de paiement"}</p>
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <form key={m} action={changePaymentMethod}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="method" value={m} />
              <SubmitButton variant="secondary">{METHOD_LABEL[m]}</SubmitButton>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
