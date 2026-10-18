"use client";
import { useActionState, useState } from "react";
import { ContactFields } from "@/components/ContactFields";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/brand";
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
  formatTotal: { pickup: string; delivery: string; fee: string };
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
        <legend className="mb-2 text-sm font-bold text-navy">Comment récupérer votre médicament ?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {p.pickup && (
            <label className="relative flex cursor-pointer gap-3 rounded-2xl border border-line p-4 transition has-[:checked]:border-blue has-[:checked]:bg-blue-50/60 has-[:checked]:ring-4 has-[:checked]:ring-blue/10">
              <input type="radio" name="fulfillment" value="PICKUP" checked={mode === "PICKUP"} onChange={() => setMode("PICKUP")} className="sr-only" />
              <Icon name="store" size={22} className="mt-0.5 text-blue" />
              <span><span className="block font-bold text-navy">Retrait en pharmacie</span><span className="text-xs text-muted">Gratuit · code de retrait</span></span>
            </label>
          )}
          <label className={`relative flex gap-3 rounded-2xl border border-line p-4 transition has-[:checked]:border-blue has-[:checked]:bg-blue-50/60 has-[:checked]:ring-4 has-[:checked]:ring-blue/10 ${canDeliver ? "cursor-pointer" : "opacity-50"}`}>
            <input type="radio" name="fulfillment" value="DELIVERY" disabled={!canDeliver} checked={mode === "DELIVERY"} onChange={() => setMode("DELIVERY")} className="sr-only" />
            <Icon name="truck" size={22} className="mt-0.5 text-blue" />
            <span><span className="block font-bold text-navy">Livraison</span><span className="text-xs text-muted">{p.delivery ? `${p.formatTotal.fee} · code de remise` : "Non proposée par cette pharmacie"}</span></span>
          </label>
        </div>
        {p.prescription && <p className="text-xs font-semibold text-[#a8611d]">Produit sur ordonnance : retrait en pharmacie uniquement, ordonnance originale vérifiée au comptoir.</p>}
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
        <legend className="mb-2 text-sm font-bold text-navy">Paiement</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {p.methods.map((m, i) => (
            <label key={m.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 text-sm font-semibold text-navy transition has-[:checked]:border-blue has-[:checked]:bg-blue-50/60">
              <input type="radio" name="paymentMethod" value={m.value} defaultChecked={i === 0} className="accent-[#176B87]" />
              {m.label}
            </label>
          ))}
        </div>
        {p.prescription && <p className="text-xs text-muted">Le paiement en ligne ne sera demandé qu'après validation par le pharmacien.</p>}
      </fieldset>

      <div className="space-y-1 rounded-2xl bg-navy p-4 text-white">
        <p className="flex justify-between text-sm text-white/70"><span>Mode</span><span>{mode === "DELIVERY" ? "Livraison" : "Retrait en pharmacie"}</span></p>
        {mode === "DELIVERY" && <p className="flex justify-between text-sm text-white/70"><span>Frais de livraison</span><span>{p.formatTotal.fee}</span></p>}
        <p className="flex items-end justify-between pt-1"><span className="font-semibold">Total</span><span className="text-2xl font-extrabold text-turq" data-testid="order-total">{mode === "DELIVERY" ? p.formatTotal.delivery : p.formatTotal.pickup}</span></p>
      </div>

      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full min-h-12 text-base">Confirmer la demande</SubmitButton>
      <p className="text-xs text-muted">Aucun mot de passe ni compte demandé. Vos coordonnées servent uniquement au traitement de cette commande.</p>
    </form>
  );
}
