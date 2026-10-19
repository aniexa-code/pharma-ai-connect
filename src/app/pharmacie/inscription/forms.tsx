"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/client";
import { DocumentInput, checkUploadSize } from "@/components/DocumentInput";
import { Alert, Field, Honeypot, Input } from "@/components/ui";
import { addPharmacyDocumentsAction, registerPharmacyAction } from "./actions";

type Doc = { kind: string; label: string; required: boolean };

export function PharmacySignupForm({ docs, city }: { docs: Doc[]; city: string }) {
  const [state, action] = useActionState(registerPharmacyAction, {});
  const [tooBig, setTooBig] = useState<string | null>(null);
  return (
    <form
      action={action}
      className="space-y-6"
      data-testid="pharmacy-signup"
      onSubmit={(e) => {
        const err = checkUploadSize(e.currentTarget);
        setTooBig(err);
        if (err) e.preventDefault();
      }}
    >
      <Honeypot />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-extrabold text-navy">La pharmacie</legend>
        <Field label="Nom de la pharmacie"><Input name="name" required maxLength={100} /></Field>
        <Field label="Numéro d'autorisation d'ouverture"><Input name="licenseNumber" required maxLength={60} /></Field>
        <Field label="Pharmacien titulaire"><Input name="ownerName" required maxLength={80} /></Field>
        <Field label="Téléphone de la pharmacie"><Input name="phone" type="tel" required placeholder="+229 01 97 12 34 56" /></Field>
        <Field label="Adresse"><Input name="address" required maxLength={200} placeholder="Rue, repère" /></Field>
        <Field label="Quartier"><Input name="district" required maxLength={80} placeholder="Ex. Ganhi" /></Field>
        <Field label="Ville"><Input name="city" required defaultValue={city} maxLength={80} /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm text-navy"><input type="checkbox" name="offersDelivery" /> Nous proposons la livraison</label>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-extrabold text-navy">Pièces justificatives</legend>
        <p className="text-xs text-muted">Photos ou PDF, 2 Mo au plus chacune. Elles ne sont vues que par l'équipe de vérification.</p>
        {docs.map((d) => <DocumentInput key={d.kind} name={`doc_${d.kind}`} label={d.label} required={d.required} />)}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-extrabold text-navy">Accès à l'espace pharmacie</legend>
        <Field label="E-mail de connexion"><Input name="email" type="email" required autoComplete="username" /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum"><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-navy">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>Je certifie que ces informations et ces pièces sont exactes, et j'accepte qu'elles soient vérifiées avant toute mise en ligne.</span>
      </label>
      <Alert>{tooBig ?? state.error}</Alert>
      <SubmitButton className="min-h-12 w-full text-base">Envoyer mon dossier</SubmitButton>
    </form>
  );
}

export function AddDocumentsForm({ docs }: { docs: Doc[] }) {
  const [state, action] = useActionState(addPharmacyDocumentsAction, {});
  const [tooBig, setTooBig] = useState<string | null>(null);
  if (state.ok) return <Alert tone="green">{state.ok}</Alert>;
  return (
    <form action={action} className="space-y-3" onSubmit={(e) => { const err = checkUploadSize(e.currentTarget); setTooBig(err); if (err) e.preventDefault(); }}>
      {docs.map((d) => <DocumentInput key={d.kind} name={`doc_${d.kind}`} label={d.label} />)}
      <Alert>{tooBig ?? state.error}</Alert>
      <SubmitButton>Envoyer les pièces</SubmitButton>
    </form>
  );
}
