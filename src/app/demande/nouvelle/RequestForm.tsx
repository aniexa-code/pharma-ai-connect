"use client";
import { useActionState } from "react";
import { ContactFields } from "@/components/ContactFields";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Honeypot, Input, Textarea } from "@/components/ui";
import { submitRequest } from "../actions";

export function RequestForm(props: { kind: "VERIFICATION" | "QUESTION"; pharmacyId: string; productId?: string; defaults: { name?: string; phone?: string; email?: string } }) {
  const [state, action] = useActionState(submitRequest, {});
  return (
    <form action={action} className="relative space-y-4">
      <Honeypot />
      <input type="hidden" name="kind" value={props.kind} />
      <input type="hidden" name="pharmacyId" value={props.pharmacyId} />
      {props.productId && <input type="hidden" name="productId" value={props.productId} />}
      {props.kind === "VERIFICATION" && (
        <Field label="Quantité souhaitée">
          <Input name="quantity" type="number" min={1} max={10} defaultValue={1} className="w-28" />
        </Field>
      )}
      <ContactFields defaults={props.defaults} />
      <Field label={props.kind === "QUESTION" ? "Votre message" : "Précision (facultatif)"}>
        <Textarea name="message" rows={3} maxLength={1000} required={props.kind === "QUESTION"} placeholder={props.kind === "QUESTION" ? "Votre question à la pharmacie" : "Ex. : boîte de 16 comprimés"} />
      </Field>
      <Alert>{state.error}</Alert>
      <SubmitButton>{props.kind === "QUESTION" ? "Envoyer le message" : "Demander la vérification"}</SubmitButton>
      <p className="text-xs text-muted">Aucun compte n'est nécessaire. Vous recevrez une référence et un lien sécurisé pour lire la réponse.</p>
    </form>
  );
}
