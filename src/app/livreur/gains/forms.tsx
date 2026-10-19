"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Select } from "@/components/ui";
import { payoutAction } from "./actions";

export function PayoutForm({ balance, minimum, methods, phone, currencyLabel }: { balance: number; minimum: number; methods: { value: string; label: string }[]; phone: string; currencyLabel: string }) {
  const [state, action] = useActionState(payoutAction, {});
  if (state.ok) return <Alert tone="green">{state.ok}</Alert>;
  return (
    <form action={action} className="space-y-3" data-testid="payout-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Montant (${currencyLabel})`} hint={`Minimum ${minimum}`}><Input name="amount" type="number" min={minimum} max={balance} step={1} defaultValue={balance} required /></Field>
        <Field label="Recevoir par">
          <Select name="method">{methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
        </Field>
      </div>
      <Field label="Numéro qui reçoit le paiement"><Input name="phone" type="tel" defaultValue={phone} required /></Field>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Demander le paiement</SubmitButton>
    </form>
  );
}
