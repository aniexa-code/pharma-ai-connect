"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Input } from "@/components/ui";
import { payoutDecisionAction } from "./actions";

export function PayoutDecisionForm({ id }: { id: string }) {
  const [state, action] = useActionState(payoutDecisionAction, {});
  if (state.ok) return <Alert tone="green">{state.ok}</Alert>;
  const set = (v: string) => (e: React.MouseEvent<HTMLSpanElement>) => {
    (e.currentTarget.closest("form")!.elements.namedItem("decision") as HTMLInputElement).value = v;
  };
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid="payout-decision">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" defaultValue="" />
      <Input name="providerRef" placeholder="Référence Mobile Money" className="w-48" />
      <span onClickCapture={set("PAID")}><SubmitButton>Marquer payé</SubmitButton></span>
      <Input name="note" placeholder="Motif si refus" className="w-40" />
      <span onClickCapture={set("REJECTED")}><SubmitButton variant="danger">Refuser</SubmitButton></span>
      {state.error && <div className="w-full"><Alert>{state.error}</Alert></div>}
    </form>
  );
}
