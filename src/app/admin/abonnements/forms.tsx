"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Input } from "@/components/ui";
import { markInvoicePaidAction, runBillingAction } from "./actions";

export function MarkPaidForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(markInvoicePaidAction, {});
  if (state.ok) return <Alert tone="green">{state.ok}</Alert>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Input name="providerRef" placeholder="Référence Mobile Money reçue" className="w-56" />
      <SubmitButton variant="secondary">Marquer payée</SubmitButton>
      {state.error && <div className="w-full"><Alert>{state.error}</Alert></div>}
    </form>
  );
}

export function RunBillingForm() {
  const [state, action] = useActionState(runBillingAction, {});
  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant="secondary">Lancer la facturation maintenant</SubmitButton>
      <Alert tone="green">{state.ok}</Alert>
    </form>
  );
}
