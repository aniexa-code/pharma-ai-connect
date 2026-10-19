"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { askRecoveryCode, closeOrder, confirmOrder, confirmRecoveryCode, createAccountAfterOrder, sendOrderMessage } from "./actions";

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
          <Input name="phone" type="tel" required placeholder="+229 01 97 12 34 56" />
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

type ConfirmProps = {
  token: string;
  modes: ("PICKUP" | "DELIVERY")[];
  preferred: "PICKUP" | "DELIVERY";
  slots: string[];
  slot: string;
  address: string;
  methods: { value: string; label: string }[];
  preferredMethod: string;
  totals: { pickup: string; delivery: string; fee: string; service: string | null; note: string };
};

export function ConfirmOrderForm(p: ConfirmProps) {
  const [state, action] = useActionState(confirmOrder, {});
  const [mode, setMode] = useState(p.modes.includes(p.preferred) ? p.preferred : p.modes[0]);
  const methods = p.methods.filter((m) => mode !== "DELIVERY" || m.value !== "CASH");
  const defaultMethod = methods.some((m) => m.value === p.preferredMethod) ? p.preferredMethod : methods[0]?.value;
  return (
    <form action={action} className="space-y-4" data-testid="confirm-form">
      <input type="hidden" name="token" value={p.token} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-navy">Retrait ou livraison</legend>
        <div className="flex flex-wrap gap-2">
          {p.modes.map((m) => (
            <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue-50/60">
              <input type="radio" name="fulfillment" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[#176B87]" />
              {m === "PICKUP" ? "Retrait en pharmacie" : `Livraison (${p.totals.fee})`}
            </label>
          ))}
        </div>
        {p.modes.length === 1 && <p className="text-xs text-muted">La pharmacie autorise uniquement {p.modes[0] === "PICKUP" ? "le retrait" : "la livraison"} pour cette commande.</p>}
      </fieldset>
      {mode === "DELIVERY" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Adresse ou point de livraison"><Input name="deliveryAddress" required minLength={5} defaultValue={p.address} /></Field>
          <Field label="Indications pour le livreur (facultatif)"><Input name="deliveryNotes" maxLength={300} /></Field>
        </div>
      )}
      <Field label={mode === "PICKUP" ? "Créneau de retrait" : "Créneau de livraison"}>
        <Select name="slot" defaultValue={p.slots.includes(p.slot) ? p.slot : p.slots[0]}>
          {p.slots.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-navy">Paiement</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {methods.map((m) => (
            <label key={`${mode}-${m.value}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 text-sm font-semibold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue-50/60">
              <input type="radio" name="paymentMethod" value={m.value} defaultChecked={m.value === defaultMethod} className="accent-[#176B87]" />
              {m.label}
            </label>
          ))}
        </div>
        {mode === "DELIVERY" && <p className="text-xs text-muted">Une livraison se règle en ligne, avant le départ du livreur.</p>}
      </fieldset>
      <div className="space-y-1 text-xs text-muted" data-testid="fees">
        {p.totals.service && <p>Frais de service Pharma AI Connect : {p.totals.service}</p>}
        {mode === "DELIVERY" && <p>{p.totals.note}</p>}
      </div>
      <p className="flex items-end justify-between rounded-2xl bg-navy p-4 text-white">
        <span className="font-semibold">Total</span>
        <span className="text-2xl font-extrabold text-turq">{mode === "DELIVERY" ? p.totals.delivery : p.totals.pickup}</span>
      </p>
      <Alert>{state.error}</Alert>
      {methods.length === 0 ? (
        <Alert tone="amber">Aucun paiement en ligne n'est disponible : choisissez le retrait, ou contactez la pharmacie.</Alert>
      ) : (
        <SubmitButton className="min-h-12 w-full text-base">Je confirme ma commande</SubmitButton>
      )}
    </form>
  );
}

export function CloseOrderForm({ token, pickup }: { token: string; pickup: boolean }) {
  const [state, action] = useActionState(closeOrder, {});
  const [problem, setProblem] = useState(false);
  if (state.info) return <Alert tone="green">{state.info}</Alert>;
  return (
    <div className="space-y-3" data-testid="close-form">
      {!problem ? (
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="received" value="1" />
          <SubmitButton>J'ai bien reçu ma commande</SubmitButton>
          <button type="button" onClick={() => setProblem(true)} className="min-h-11 px-3 text-sm font-semibold text-danger hover:underline">Signaler un problème</button>
        </form>
      ) : (
        <form action={action} className="space-y-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="received" value="0" />
          <Textarea name="note" rows={3} required maxLength={1000} placeholder={pickup ? "Ex. un produit manquait dans le sachet" : "Ex. colis incomplet, produit abîmé"} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger">Envoyer le signalement</SubmitButton>
            <button type="button" onClick={() => setProblem(false)} className="min-h-11 px-3 text-sm font-semibold text-muted">Annuler</button>
          </div>
        </form>
      )}
      <Alert>{state.error}</Alert>
    </div>
  );
}
