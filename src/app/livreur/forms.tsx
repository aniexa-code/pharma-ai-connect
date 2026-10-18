"use client";
import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input } from "@/components/ui";
import { courierLogin, missionAction } from "./actions";

export function CourierLoginForm() {
  const [state, action] = useActionState(courierLogin, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail"><Input name="email" type="email" required /></Field>
      <Field label="Mot de passe"><Input name="password" type="password" required /></Field>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Se connecter</SubmitButton>
    </form>
  );
}

export function MissionForm({ orderId, action, children, className = "" }: { orderId: string; action: string; children: ReactNode; className?: string }) {
  const [state, run] = useActionState(missionAction, {});
  return (
    <form action={run} className={className}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="action" value={action} />
      {children}
      {state.error && <div className="mt-2 w-full"><Alert>{state.error}</Alert></div>}
    </form>
  );
}
