"use client";
import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { addStockAction, hoursAction, importStockAction, orderAction, pharmacyLogin, publishImportAction, respondToRequest } from "./actions";

export function PharmacyLoginForm() {
  const [state, action] = useActionState(pharmacyLogin, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail"><Input name="email" type="email" required /></Field>
      <Field label="Mot de passe"><Input name="password" type="password" required /></Field>
      <Alert>{state.error}</Alert>
      <SubmitButton className="w-full">Se connecter</SubmitButton>
    </form>
  );
}

/** Formulaire d'action sur une commande, avec retour d'erreur. */
export function OrderActionForm({ orderId, action, children, className = "" }: { orderId: string; action: string; children: ReactNode; className?: string }) {
  const [state, run] = useActionState(orderAction, {});
  return (
    <form action={run} className={`space-y-2 ${className}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="action" value={action} />
      {children}
      <Alert>{state.error}</Alert>
    </form>
  );
}

export function RespondForm({ requestId, verification, price }: { requestId: string; verification: boolean; price?: number }) {
  const [state, action] = useActionState(respondToRequest, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Réponse">
          <Select name="status" defaultValue={verification ? "CONFIRMED" : "ANSWERED"}>
            {verification && <option value="CONFIRMED">Disponible</option>}
            {verification && <option value="UNAVAILABLE">Indisponible</option>}
            <option value="ANSWERED">Réponse simple</option>
          </Select>
        </Field>
        {verification && <Field label="Prix unitaire (facultatif)"><Input name="price" type="number" min={0} defaultValue={price || ""} /></Field>}
      </div>
      <Field label="Message au client"><Textarea name="message" rows={2} maxLength={1000} placeholder="Ex. : 2 boîtes mises de côté jusqu'à 18 h" /></Field>
      <Alert tone="green">{state.info}</Alert>
      <Alert>{state.error}</Alert>
      <SubmitButton>Envoyer la réponse</SubmitButton>
    </form>
  );
}

/** Horaires et garde : la pharmacie confirme ses horaires et déclare une garde avec une heure de fin. */
export function HoursDutyPanel({ hoursLabel, stale, dutyLabel, onDuty, defaultUntil, minUntil }: {
  hoursLabel: string; stale: boolean; dutyLabel: string | null; onDuty: boolean; defaultUntil: string; minUntil: string;
}) {
  const [state, run] = useActionState(hoursAction, {});
  return (
    <div className="space-y-4" data-testid="hours-duty">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-navy">Horaires d'ouverture</p>
          <p className={`text-sm ${stale ? "font-semibold text-[#a8611d]" : "text-muted"}`}>{hoursLabel}</p>
        </div>
        <form action={run}>
          <input type="hidden" name="action" value="confirm" />
          <SubmitButton variant={stale ? "primary" : "secondary"} className="min-h-10">Confirmer mes horaires</SubmitButton>
        </form>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
        <div>
          <p className="text-sm font-bold text-navy">Pharmacie de garde</p>
          <p className="text-sm text-muted">{dutyLabel ?? "Pas de garde en cours."}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form action={run} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="action" value="duty" />
            <label className="text-xs font-semibold text-muted">
              {onDuty ? "Prolonger jusqu'au" : "De garde jusqu'au"}
              <Input name="until" type="datetime-local" defaultValue={defaultUntil} min={minUntil} required className="mt-1 block min-h-10" />
            </label>
            <SubmitButton variant="secondary" className="min-h-10">{onDuty ? "Prolonger" : "Déclarer la garde"}</SubmitButton>
          </form>
          {onDuty && (
            <form action={run}>
              <input type="hidden" name="action" value="end" />
              <SubmitButton variant="ghost" className="min-h-10">Terminer la garde</SubmitButton>
            </form>
          )}
        </div>
      </div>
      <Alert>{state.error}</Alert>
    </div>
  );
}

export function ImportStockForm() {
  const [state, run] = useActionState(importStockAction, {});
  return (
    <form action={run} className="space-y-3" data-testid="import-form">
      <Field label="Fichier CSV ou Excel (.xlsx), 2 Mo au maximum" hint="Colonnes : Produit (ou Code), Prix, et si possible Dosage, Forme, Conditionnement, Quantité, Statut.">
        <Input name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
      </Field>
      <Alert>{state.error}</Alert>
      <SubmitButton variant="secondary">Analyser le fichier</SubmitButton>
      <p className="text-xs text-muted">Rien n'est publié à cette étape : vous verrez d'abord le rapport de validation.</p>
    </form>
  );
}

export function AddStockForm({ products, currencyLabel }: { products: { id: string; label: string }[]; currencyLabel: string }) {
  const [state, run] = useActionState(addStockAction, {});
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-2" data-testid="add-stock">
      <div className="sm:col-span-2">
        <Field label="Produit du référentiel">
          <Select name="productId" required defaultValue="">
            <option value="" disabled>Choisir un produit…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={`Prix (${currencyLabel})`}><Input name="price" type="number" min={1} required /></Field>
      <Field label="Quantité (facultatif)"><Input name="quantity" type="number" min={0} /></Field>
      <Field label="Disponibilité">
        <Select name="status" defaultValue="AVAILABLE">
          <option value="AVAILABLE">Disponible</option>
          <option value="LOW">Stock faible</option>
          <option value="OUT">Indisponible</option>
        </Select>
      </Field>
      <Field label="Conditionnement (facultatif)"><Input name="packaging" maxLength={80} placeholder="Boîte de 16" /></Field>
      <div className="space-y-2 sm:col-span-2">
        <Alert>{state.error}</Alert>
        <Alert tone="green">{state.info}</Alert>
        <SubmitButton>Ajouter au stock</SubmitButton>
      </div>
    </form>
  );
}

export function PublishImportForm({ importId, count }: { importId: string; count: number }) {
  const [state, run] = useActionState(publishImportAction, {});
  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="importId" value={importId} />
      <Alert>{state.error}</Alert>
      <SubmitButton>{count > 1 ? `Publier les ${count} lignes correctes` : "Publier la ligne correcte"}</SubmitButton>
    </form>
  );
}
