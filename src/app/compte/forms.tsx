"use client";
import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Select } from "@/components/ui";
import { askClaimCode, confirmClaim, login, register, saveProfile } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Mot de passe"><Input name="password" type="password" required autoComplete="current-password" /></Field>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Se connecter</SubmitButton>
      <p className="text-sm text-muted">Pas encore de compte ? <Link href="/compte/inscription" className="font-medium text-brand-700">Créer un compte</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(register, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Nom"><Input name="name" required autoComplete="name" /></Field>
      <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Mot de passe" hint="8 caractères minimum."><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Téléphone (facultatif)"><Input name="phone" type="tel" autoComplete="tel" /></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1" /> Je souhaite créer un compte Pharma AI Connect.</label>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Créer mon compte</SubmitButton>
    </form>
  );
}

export function ProfileForm({ name, phone, channel, marketing }: { name: string; phone: string; channel: string; marketing: boolean }) {
  const [state, action] = useActionState(saveProfile, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom"><Input name="name" required defaultValue={name} /></Field>
        <Field label="Téléphone"><Input name="phone" type="tel" defaultValue={phone} /></Field>
        <Field label="Notifications par">
          <Select name="notifyChannel" defaultValue={channel}>
            <option value="EMAIL">E-mail</option>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="marketingOptIn" defaultChecked={marketing} /> Recevoir les offres et avantages fidélité</label>
      <Alert tone="green">{state.info}</Alert>
      <Alert>{state.error}</Alert>
      <SubmitButton variant="secondary">Enregistrer</SubmitButton>
    </form>
  );
}

export function ClaimForm() {
  const [asked, ask] = useActionState(askClaimCode, {});
  const [confirmed, confirm] = useActionState(confirmClaim, {});
  const state = confirmed.step ? confirmed : asked;
  if (state.step !== "code")
    return (
      <form action={ask} className="space-y-4">
        <Field label="Référence de commande"><Input name="ref" required placeholder="CMD-XXXX-XXXX" className="font-mono uppercase" /></Field>
        <Field label="Téléphone utilisé pour la commande"><Input name="phone" type="tel" required /></Field>
        <Alert>{asked.error}</Alert>
        <SubmitButton>Recevoir un code</SubmitButton>
      </form>
    );
  return (
    <form action={confirm} className="space-y-4">
      <input type="hidden" name="ref" value={state.ref} />
      <Alert tone="blue">{asked.info}</Alert>
      {asked.demoCode && <Alert tone="amber">Mode démonstration : code <strong className="font-mono">{asked.demoCode}</strong></Alert>}
      <Field label="Code reçu"><Input name="code" inputMode="numeric" required className="font-mono" /></Field>
      <Alert>{confirmed.error}</Alert>
      <SubmitButton>Rattacher la commande</SubmitButton>
    </form>
  );
}
