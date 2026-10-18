"use client";
import { useState } from "react";
import { Field, Input, Select } from "./ui";

/** On ne demande que la coordonnée nécessaire au canal choisi. */
export function ContactFields({ phoneRequired = false, defaults = {} }: { phoneRequired?: boolean; defaults?: { name?: string; phone?: string; email?: string; channel?: string } }) {
  const [channel, setChannel] = useState(defaults.channel ?? "SMS");
  const needsPhone = phoneRequired || channel === "SMS" || channel === "WHATSAPP";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nom ou prénom">
        <Input name="contactName" required minLength={2} defaultValue={defaults.name} autoComplete="given-name" />
      </Field>
      <Field label="Recevoir les informations par">
        <Select name="notifyChannel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="SMS">SMS</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="EMAIL">E-mail</option>
          <option value="LINK">Lien sécurisé uniquement</option>
        </Select>
      </Field>
      {needsPhone && (
        <Field label="Téléphone" hint={phoneRequired ? "Pour que la pharmacie puisse vous joindre au sujet de la commande." : undefined}>
          <Input name="phone" type="tel" required defaultValue={defaults.phone} placeholder="+242 06 123 45 67" autoComplete="tel" />
        </Field>
      )}
      {channel === "EMAIL" && (
        <Field label="E-mail">
          <Input name="email" type="email" required defaultValue={defaults.email} autoComplete="email" />
        </Field>
      )}
    </div>
  );
}
