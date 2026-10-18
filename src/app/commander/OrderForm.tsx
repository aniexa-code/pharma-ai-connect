"use client";
import { useActionState, useState } from "react";
import { ContactFields } from "@/components/ContactFields";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Honeypot, Input, Select } from "@/components/ui";
import { placeOrder } from "./actions";

type Props = {
  pharmacyId: string;
  items: string[];
  pickup: boolean;
  delivery: boolean;
  prescription: boolean;
  methods: { value: string; label: string }[];
  slots: string[];
  subtotal: string;
  deliveryFee: number;
  formatTotal: { pickup: string; delivery: string };
  addresses: { id: string; label: string; line: string }[];
  defaults: { name?: string; phone?: string; email?: string; channel?: string };
};

export function OrderForm(p: Props) {
  const [state, action] = useActionState(placeOrder, {});
  const canDeliver = p.delivery && !p.prescription;
  const [mode, setMode] = useState(p.pickup ? "PICKUP" : "DELIVERY");
  const [address, setAddress] = useState("");
  return (
    <form action={action} className="relative space-y-5">
      <Honeypot />
      <input type="hidden" name="pharmacyId" value={p.pharmacyId} />
      {p.items.map((i) => <input key={i} type="hidden" name="item" value={i} />)}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Mode de réception</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {p.pickup && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="fulfillment" value="PICKUP" checked={mode === "PICKUP"} onChange={() => setMode("PICKUP")} />
              Retrait en pharmacie
            </label>
          )}
          <label className={`flex items-center gap-2 rounded-xl border border-line p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 ${canDeliver ? "cursor-pointer" : "opacity-50"}`}>
            <input type="radio" name="fulfillment" value="DELIVERY" disabled={!canDeliver} checked={mode === "DELIVERY"} onChange={() => setMode("DELIVERY")} />
            Livraison {p.delivery ? "" : "(non proposée)"}
          </label>
        </div>
        {p.prescription && <p className="text-xs text-amber-700">Produit sur ordonnance : retrait en pharmacie uniquement, ordonnance originale vérifiée au comptoir.</p>}
      </fieldset>

      {mode === "DELIVERY" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {p.addresses.length > 0 && (
            <Field label="Adresse enregistrée">
              <Select onChange={(e) => setAddress(e.target.value)} defaultValue="">
                <option value="">Saisir une adresse</option>
                {p.addresses.map((a) => <option key={a.id} value={a.line}>{a.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Adresse ou point de livraison">
            <Input name="deliveryAddress" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, repère, quartier" />
          </Field>
          <Field label="Indications pour le livreur (facultatif)">
            <Input name="deliveryNotes" maxLength={300} />
          </Field>
        </div>
      )}

      <Field label={mode === "PICKUP" ? "Créneau de retrait" : "Créneau de livraison"}>
        <Select name="slot" required>
          {p.slots.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>

      <ContactFields phoneRequired defaults={p.defaults} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Paiement</legend>
        {p.methods.map((m, i) => (
          <label key={m.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="paymentMethod" value={m.value} defaultChecked={i === 0} />
            {m.label}
          </label>
        ))}
        {p.prescription && <p className="text-xs text-muted">Le paiement en ligne ne sera demandé qu'après validation par le pharmacien.</p>}
      </fieldset>

      <div className="flex items-center justify-between rounded-xl bg-surface p-3 font-semibold">
        <span>Total</span>
        <span>{mode === "DELIVERY" ? p.formatTotal.delivery : p.formatTotal.pickup}</span>
      </div>

      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Valider la commande</SubmitButton>
      <p className="text-xs text-muted">Aucun mot de passe ni compte demandé. Vos coordonnées servent uniquement au traitement de cette commande.</p>
    </form>
  );
}
