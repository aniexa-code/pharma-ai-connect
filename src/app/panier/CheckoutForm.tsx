"use client";
import { useActionState, useState } from "react";
import { ContactFields } from "@/components/ContactFields";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/brand";
import { Alert, Field, Honeypot, Input, Select } from "@/components/ui";
import { checkoutCart } from "./actions";

export function CheckoutForm({ slots, anyDelivery, pharmacies, defaults }: { slots: string[]; anyDelivery: boolean; pharmacies: number; defaults: { name?: string; phone?: string; email?: string; channel?: string } }) {
  const [state, action] = useActionState(checkoutCart, {});
  const [mode, setMode] = useState("PICKUP");
  return (
    <form action={action} className="space-y-5" data-testid="checkout-form">
      <Honeypot />
      <div className="flex gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-navy">
        <Icon name="shield" size={20} className="mt-0.5 shrink-0 text-blue" />
        <p>
          {pharmacies > 1 ? `Votre panier part vers ${pharmacies} pharmacies : chacune vérifie physiquement ses produits.` : "La pharmacie vérifie physiquement chaque produit."} Vous confirmerez ensuite chaque commande, avec ses prix confirmés : <strong>rien n'est payé maintenant</strong>.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-navy">Mode souhaité</legend>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue-50/60">
            <input type="radio" name="fulfillment" value="PICKUP" checked={mode === "PICKUP"} onChange={() => setMode("PICKUP")} /> Retrait en pharmacie
          </label>
          {anyDelivery && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue-50/60">
              <input type="radio" name="fulfillment" value="DELIVERY" checked={mode === "DELIVERY"} onChange={() => setMode("DELIVERY")} /> Livraison si possible
            </label>
          )}
        </div>
        <p className="text-xs text-muted">Chaque pharmacie indique ensuite ce qu'elle autorise ; vous choisirez définitivement à la confirmation.</p>
      </fieldset>
      {mode === "DELIVERY" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresse ou point de livraison"><Input name="deliveryAddress" required minLength={5} placeholder="Rue, repère, quartier" /></Field>
          <Field label="Indications pour le livreur (facultatif)"><Input name="deliveryNotes" maxLength={300} /></Field>
        </div>
      )}
      <Field label="Créneau souhaité">
        <Select name="slot">{slots.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <ContactFields phoneRequired defaults={defaults} />
      <input type="hidden" name="paymentMethod" value={mode === "DELIVERY" ? "MOBILE_MONEY" : "CASH"} />
      <Alert>{state.error}</Alert>
      <SubmitButton className="min-h-12 w-full text-base">Envoyer {pharmacies > 1 ? "aux pharmacies" : "à la pharmacie"} pour vérification</SubmitButton>
    </form>
  );
}
