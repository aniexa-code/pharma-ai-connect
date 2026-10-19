"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/client";
import { DocumentInput, checkUploadSize } from "@/components/DocumentInput";
import { Alert, Field, Honeypot, Input, Select } from "@/components/ui";
import { addCourierDocumentsAction, registerCourierAction } from "./actions";

type Doc = { kind: string; label: string; required: boolean | "motorized" };

export function CourierSignupForm({ docs, vehicles, city, zones }: { docs: Doc[]; vehicles: { value: string; label: string }[]; city: string; zones: string[] }) {
  const [state, action] = useActionState(registerCourierAction, {});
  const [vehicle, setVehicle] = useState("MOTO");
  const [tooBig, setTooBig] = useState<string | null>(null);
  const motorized = vehicle === "MOTO" || vehicle === "VOITURE";
  return (
    <form action={action} className="space-y-6" data-testid="courier-signup" onSubmit={(e) => { const err = checkUploadSize(e.currentTarget); setTooBig(err); if (err) e.preventDefault(); }}>
      <Honeypot />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-extrabold text-navy">Vous</legend>
        <Field label="Nom et prénom"><Input name="name" required maxLength={80} /></Field>
        <Field label="Téléphone (Mobile Money)"><Input name="phone" type="tel" required placeholder="+229 01 97 12 34 56" /></Field>
        <Field label="Numéro de pièce d'identité"><Input name="idNumber" required maxLength={40} /></Field>
        <Field label="Moyen de déplacement">
          <Select name="vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            {vehicles.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Ville"><Input name="city" required defaultValue={city} maxLength={80} /></Field>
        <Field label="Zone habituelle">
          <Input name="zone" required maxLength={80} list="zones" placeholder="Ex. Akpakpa" />
        </Field>
        <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-extrabold text-navy">Pièces justificatives</legend>
        <p className="text-xs text-muted">Photos ou PDF, 2 Mo au plus chacune. Elles ne sont vues que par l'équipe de vérification.</p>
        {docs.map((d) => <DocumentInput key={d.kind} name={`doc_${d.kind}`} label={d.label} required={d.required === "motorized" ? motorized : d.required} />)}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-extrabold text-navy">Accès au centre de livraison</legend>
        <Field label="E-mail de connexion"><Input name="email" type="email" required autoComplete="username" /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum"><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-navy">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>Je certifie que ces informations et ces pièces sont exactes. Je sais que je ne recevrai aucune mission avant la validation de mon dossier.</span>
      </label>
      <Alert>{tooBig ?? state.error}</Alert>
      <SubmitButton className="min-h-12 w-full text-base">Envoyer mon dossier</SubmitButton>
    </form>
  );
}

export function AddCourierDocumentsForm({ docs }: { docs: { kind: string; label: string }[] }) {
  const [state, action] = useActionState(addCourierDocumentsAction, {});
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
