"use client";
import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { orderAction, pharmacyLogin, respondToRequest } from "./actions";

export function PharmacyLoginForm() {
  const [state, action] = useActionState(pharmacyLogin, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail"><Input name="email" type="email" required /></Field>
      <Field label="Mot de passe"><Input name="password" type="password" required /></Field>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Se connecter</SubmitButton>
    </form>
  );
}

/** Formulaire d'action sur une commande, avec retour d'erreur. */
export function OrderActionForm({ orderId, action, children, className = "" }: { orderId: string; action: string; children: ReactNode; className?: string }) {
  const [state, run] = useActionState(orderAction, {});
  return (
    <form action={run} className={`space-y-2 ${className}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="action" value={action} />
      {children}
      <Alert>{state.error}</Alert>
    </form>
  );
}

export function RespondForm({ requestId, verification, price }: { requestId: string; verification: boolean; price?: number }) {
  const [state, action] = useActionState(respondToRequest, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Réponse">
          <Select name="status" defaultValue={verification ? "CONFIRMED" : "ANSWERED"}>
            {verification && <option value="CONFIRMED">Disponible</option>}
            {verification && <option value="UNAVAILABLE">Indisponible</option>}
            <option value="ANSWERED">Réponse simple</option>
          </Select>
        </Field>
        {verification && <Field label="Prix unitaire (facultatif)"><Input name="price" type="number" min={0} defaultValue={price || ""} /></Field>}
      </div>
      <Field label="Message au client"><Textarea name="message" rows={2} maxLength={1000} placeholder="Ex. : 2 boîtes mises de côté jusqu'à 18 h" /></Field>
      <Alert tone="green">{state.info}</Alert>
      <Alert>{state.error}</Alert>
      <SubmitButton>Envoyer la réponse</SubmitButton>
    </form>
  );
}
