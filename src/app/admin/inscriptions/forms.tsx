"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input } from "@/components/ui";
import { decideAction } from "./actions";

type Choice = { decision: string; label: string; variant: "primary" | "secondary" | "danger" };

export function DecisionForm({ owner, id, choices, geo }: { owner: string; id: string; choices: Choice[]; geo?: { lat: number; lng: number } }) {
  const [state, action] = useActionState(decideAction, {});
  if (!choices.length) return null;
  return (
    <form action={action} className="space-y-4" data-testid="decision-form">
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" defaultValue="" />
      {geo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latitude" hint="Position affichée sur la carte : vérifiez-la avant de valider."><Input name="lat" defaultValue={geo.lat.toFixed(6)} inputMode="decimal" /></Field>
          <Field label="Longitude"><Input name="lng" defaultValue={geo.lng.toFixed(6)} inputMode="decimal" /></Field>
        </div>
      )}
      <Field label="Message au demandeur" hint="Obligatoire pour une demande de compléments, un refus ou une suspension.">
        <textarea name="note" rows={3} maxLength={1000} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-blue" />
      </Field>
      <Alert>{state.error}</Alert>
      <Alert tone="green">{state.ok}</Alert>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <span key={c.decision} onClickCapture={(e) => { (e.currentTarget.closest("form")!.elements.namedItem("decision") as HTMLInputElement).value = c.decision; }}>
            <SubmitButton variant={c.variant}>{c.label}</SubmitButton>
          </span>
        ))}
      </div>
    </form>
  );
}
