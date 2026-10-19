"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { SettingField } from "@/lib/settings-fields";
import { adminLogin, updateSettings } from "./actions";

export function AdminLoginForm() {
  const [state, action] = useActionState(adminLogin, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail"><Input name="email" type="email" required autoComplete="username" /></Field>
      <Field label="Mot de passe"><Input name="password" type="password" required autoComplete="current-password" /></Field>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Se connecter</SubmitButton>
    </form>
  );
}

type Section = { title: string; fields: (SettingField & { value: string })[] };

export function SettingsForm({ country, currency, sections }: { country: string; currency: string; sections: Section[] }) {
  const [state, action] = useActionState(updateSettings, {});
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="country" value={country} />
      {sections.map((s) => (
        <fieldset key={s.title} className="rounded-2xl border border-line bg-white p-5">
          <legend className="px-1 text-sm font-extrabold text-navy">{s.title}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {s.fields.map((f) => {
              const unit = f.kind === "money" ? currency : f.kind === "percent" ? "%" : f.unit;
              const label = unit ? `${f.label} (${unit})` : f.label;
              return (
                <Field key={f.path} label={label} hint={f.hint}>
                  {f.kind === "choice" ? (
                    <Select name={f.path} defaultValue={f.value}>
                      {f.choices!.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </Select>
                  ) : (
                    <Input
                      name={f.path}
                      defaultValue={f.value}
                      type={f.kind === "time" ? "time" : f.kind === "list" ? "text" : "number"}
                      min={f.min}
                      max={f.max}
                      step={f.kind === "money" ? 1 : "any"}
                      required
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
      <Alert>{state.error}</Alert>
      <Alert tone="green">{state.ok}</Alert>
      <SubmitButton>Enregistrer les réglages</SubmitButton>
    </form>
  );
}
