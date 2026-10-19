"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert } from "@/components/ui";
import { chooseBillingAction, payInvoiceAction } from "./actions";

type Option = { value: string; title: string; price: string; detail: string };

export function BillingChoiceForm({ options, current }: { options: Option[]; current: string }) {
  const [state, action] = useActionState(chooseBillingAction, {});
  return (
    <form action={action} className="space-y-3" data-testid="billing-choice">
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-blue has-[:checked]:bg-blue-50/60">
            <input type="radio" name="choice" value={o.value} defaultChecked={o.value === current} className="mt-1 accent-[#176B87]" />
            <span>
              <span className="block font-bold text-navy">{o.title}</span>
              <span className="block text-lg font-extrabold text-blue">{o.price}</span>
              <span className="block text-xs text-muted">{o.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <Alert>{state.error}</Alert>
      <Alert tone="green">{state.ok}</Alert>
      <SubmitButton>Enregistrer ma formule</SubmitButton>
    </form>
  );
}

export function PayInvoiceForm({ invoiceId, amount, sandbox }: { invoiceId: string; amount: string; sandbox: boolean }) {
  const [state, action] = useActionState(payInvoiceAction, {});
  if (state.ok) return <Alert tone="green">{state.ok}</Alert>;
  const set = (v: string) => (e: React.MouseEvent<HTMLSpanElement>) => {
    (e.currentTarget.closest("form")!.elements.namedItem("outcome") as HTMLInputElement).value = v;
  };
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid="pay-invoice">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="outcome" defaultValue="" />
      {sandbox ? (
        <>
          <span onClickCapture={set("CONFIRMED")}><SubmitButton>Payer {amount} (Mobile Money)</SubmitButton></span>
          <span onClickCapture={set("FAILED")}><SubmitButton variant="secondary">Simuler un échec</SubmitButton></span>
        </>
      ) : (
        <p className="text-sm text-muted">Réglez {amount} par Mobile Money au numéro indiqué par notre équipe : la facture passe à « payée » dès réception confirmée.</p>
      )}
      {state.error && <div className="w-full"><Alert>{state.error}</Alert></div>}
    </form>
  );
}
