"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { askRecoveryCode, confirmRecoveryCode, createAccountAfterOrder, sendOrderMessage } from "./actions";

export function RecoveryForm() {
  const [asked, ask] = useActionState(askRecoveryCode, {});
  const [confirmed, confirm] = useActionState(confirmRecoveryCode, {});
  const state = confirmed.step ? confirmed : asked;
  if (state.step !== "code")
    return (
      <form action={ask} className="space-y-4">
        <Field label="Entrez votre référence de commande" hint="Ex. CMD-7KQ2-M9XD, indiquée dans le message de confirmation.">
          <Input name="ref" required placeholder="CMD-XXXX-XXXX" className="font-mono uppercase" />
        </Field>
        <Field label="Téléphone utilisé pour la commande">
          <Input name="phone" type="tel" required placeholder="+242 06 123 45 67" />
        </Field>
        <Alert>{asked.error}</Alert>
        <SubmitButton className="w-full">Recevoir mon code de suivi</SubmitButton>
      </form>
    );
  return (
    <form action={confirm} className="space-y-4">
      <input type="hidden" name="ref" value={state.ref} />
      <Alert tone="blue">{asked.info}</Alert>
      {asked.demoCode && (
        <Alert tone="amber">
          Mode démonstration : aucun fournisseur SMS n'est configuré, le code est donc affiché ici : <strong className="font-mono" data-testid="demo-code">{asked.demoCode}</strong>
        </Alert>
      )}
      <Field label="Code de suivi (6 chiffres)">
        <Input name="code" inputMode="numeric" pattern="\d{6}" required className="font-mono tracking-widest" />
      </Field>
      <Alert>{confirmed.error}</Alert>
      <SubmitButton>Accéder à ma commande</SubmitButton>
    </form>
  );
}

export function OrderMessageForm({ token }: { token: string }) {
  const [state, action] = useActionState(sendOrderMessage, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Textarea name="body" rows={2} required maxLength={1000} placeholder="Écrire à la pharmacie au sujet de cette commande" />
      <Alert>{state.error}</Alert>
      <SubmitButton variant="secondary">Envoyer</SubmitButton>
    </form>
  );
}

export function AccountForm({ token, name, phone, email }: { token: string; name: string; phone: string; email?: string | null }) {
  const [state, action] = useActionState(createAccountAfterOrder, {});
  if (state.info) return <Alert tone="green">Compte créé. Vous êtes connecté.</Alert>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom"><Input name="name" required defaultValue={name} /></Field>
        <Field label="E-mail"><Input name="email" type="email" required defaultValue={email ?? ""} /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum."><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
        <Field label="Téléphone (facultatif)"><Input name="phone" type="tel" defaultValue={phone} /></Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="attach" defaultChecked className="mt-1" /> Ajouter cette commande à mon compte
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-1" /> Je souhaite créer un compte Pharma AI Connect.
      </label>
      <Alert>{state.error}</Alert>
      <SubmitButton>Créer mon compte</SubmitButton>
    </form>
  );
}
