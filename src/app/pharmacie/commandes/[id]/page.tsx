import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatusBadge, formatDate } from "@/components/badges";
import { SubmitButton } from "@/components/client";
import { Thread } from "@/components/Thread";
import { Alert, Badge, ButtonLink, Card, Input, Textarea } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { ANSWER_LABEL, METHOD_LABEL, MODE_LABEL, PAYMENT_LABEL, STATUS_LABEL, allowedNext, closureParties, responsibleFor } from "@/lib/services/orders";
import { OrderActionForm, VerifyOrderForm } from "../../forms";

export const metadata: Metadata = { title: "Commande", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PharmacyOrder({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePharmacyUser();
  const { id } = await params;
  const o = await db.order.findFirst({
    where: { id, pharmacyId: u.pharmacyId },
    include: { pharmacy: true, items: true, events: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { createdAt: "asc" } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!o) notFound();
  const next = allowedNext(o).filter((s) => s !== "CANCELLED");
  const handover = (o.fulfillment === "PICKUP" && o.status === "READY_FOR_PICKUP") || (o.fulfillment === "DELIVERY" && o.status === "OUT_FOR_DELIVERY");
  const payment = o.payments.at(-1);
  const responsible = responsibleFor(o);
  const confirmedByCustomer = !!o.customerConfirmedAt;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ButtonLink variant="secondary" href="/pharmacie">← Tableau de bord</ButtonLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{o.publicRef}</h1>
        <OrderStatusBadge status={o.status} />
        {o.requiresPrescription && <Badge tone="amber">Ordonnance</Badge>}
      </div>

      {responsible && (
        <p className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-navy" data-testid="responsible">
          Étape en cours : <strong>{responsible.who}</strong> {responsible.what}.
        </p>
      )}
      {o.verifiedAt && (
        <p className="text-sm text-muted">
          Vérifiée le {formatDate(o.verifiedAt)}{o.allowedModes ? ` · ${MODE_LABEL[o.allowedModes]}` : ""} · Autorisation client :{" "}
          <strong className={confirmedByCustomer ? "text-turq-700" : "text-[#a8611d]"}>{confirmedByCustomer ? "CONFIRMÉE" : "EN ATTENTE"}</strong>
          {o.customerConfirmedAt && ` le ${formatDate(o.customerConfirmedAt)}`}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-1 text-sm">
          <p className="font-semibold">{confirmedByCustomer ? (o.fulfillment === "PICKUP" ? "Retrait" : "Livraison") : `Souhait du client : ${o.fulfillment === "PICKUP" ? "retrait" : "livraison"}`} · {o.slot}</p>
          <p>Client : {o.contactName}</p>
          <p>Téléphone : <a href={`tel:${o.phone}`} className="text-brand-700">{o.phone}</a></p>
          {o.deliveryAddress && <p>Adresse : {o.deliveryAddress}{o.deliveryNotes ? ` (${o.deliveryNotes})` : ""}</p>}
          {o.courierName && <p>Livreur : {o.courierName}</p>}
          <p className="pt-2">{payment && <>{METHOD_LABEL[payment.method]} · <strong>{PAYMENT_LABEL[payment.status]}</strong></>}</p>
        </Card>
        <Card className="text-sm">
          <ul className="space-y-1">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span>
                  {i.productName} × {i.answer === "INSUFFICIENT" ? `${i.confirmedQty} (sur ${i.quantity})` : i.quantity}{i.regulation === "PRESCRIPTION" ? " (ordonnance)" : ""}
                  {i.answer && <><br /><span className="text-xs text-muted">{ANSWER_LABEL[i.answer]}{i.answerNote ? ` · ${i.answerNote}` : ""}</span></>}
                </span>
                <span>{formatMoney(i.unitPrice * (i.answer === "INSUFFICIENT" ? i.confirmedQty ?? 0 : i.quantity), o.currency)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{formatMoney(o.total, o.currency)}</span></li>
          </ul>
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">Actions</h2>
        {o.status === "PLACED" && (
          <VerifyOrderForm
            orderId={o.id}
            pickup={o.pharmacy.offersPickup}
            delivery={o.pharmacy.offersDelivery}
            currencyLabel={["XAF", "XOF"].includes(o.currency) ? "FCFA" : o.currency}
            items={o.items.map((i) => ({ id: i.id, name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, prescription: i.regulation === "PRESCRIPTION" }))}
          />
        )}
        {o.status === "AWAITING_CUSTOMER" && <Alert tone="blue">Réponse envoyée : en attente de la confirmation du client.</Alert>}
        {o.courierId && ["COURIER_ASSIGNED", "PICKED_UP"].includes(o.status) && !o.pharmacyClosedAt && (
          <OrderActionForm orderId={o.id} action="handoff" className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3">
            <span className="text-sm text-navy">Le livreur {o.courierName} vient chercher la commande. Confirmez quand vous la lui avez remise.</span>
            <SubmitButton>Confirmer la remise au livreur</SubmitButton>
          </OrderActionForm>
        )}
        {o.courierId && o.pharmacyClosedAt && ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(o.status) && (
          <Alert tone="green"><span data-testid="handed-off">Remise au livreur confirmée le {formatDate(o.pharmacyClosedAt)}.</span></Alert>
        )}
        {["DELIVERED", "COLLECTED"].includes(o.status) && (
          <div className="space-y-2" data-testid="closure">
            <p className="text-sm font-semibold text-navy">{o.closedAt ? `Commande clôturée le ${formatDate(o.closedAt)}` : "Clôture en attente"}</p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {closureParties(o).map((p) => (
                <li key={p.key} className={`rounded-full px-3 py-1 font-semibold ${p.at ? "bg-turq-50 text-turq-700" : "bg-warn-50 text-[#a8611d]"}`}>{p.label} : {p.at ? "clôturé" : "en attente"}</li>
              ))}
            </ul>
            {o.customerIssue && !o.customerClosedAt && <Alert tone="amber">Problème signalé par le client : {o.customerIssue}</Alert>}
          </div>
        )}
        {o.status === "PRESCRIPTION_REVIEW" && (
          <div className="space-y-2">
            <Alert tone="amber">Validez la demande au regard du produit et du client. L'ordonnance originale sera vérifiée à la remise.</Alert>
            <div className="flex flex-wrap gap-2">
              <OrderActionForm orderId={o.id} action="approve"><SubmitButton>Valider</SubmitButton></OrderActionForm>
              <OrderActionForm orderId={o.id} action="reject" className="flex flex-wrap gap-2">
                <Input name="note" placeholder="Motif du refus" className="w-56" />
                <SubmitButton variant="danger">Refuser</SubmitButton>
              </OrderActionForm>
            </div>
          </div>
        )}
        {next.map((s) => (
          <OrderActionForm key={s} orderId={o.id} action="advance" className="flex flex-wrap items-start gap-2">
            <input type="hidden" name="next" value={s} />
            {s === "COURIER_ASSIGNED" && <Input name="courierName" placeholder="Nom du livreur" required className="w-56" />}
            <SubmitButton variant="secondary">→ {STATUS_LABEL[s]}</SubmitButton>
          </OrderActionForm>
        ))}
        {handover && (
          <OrderActionForm orderId={o.id} action="handover" className="flex flex-wrap items-start gap-2">
            <Input name="code" inputMode="numeric" placeholder="Code du client" required className="w-40 font-mono" />
            <SubmitButton>{o.fulfillment === "PICKUP" ? "Valider le retrait" : "Valider la livraison"}</SubmitButton>
          </OrderActionForm>
        )}
        {handover && o.handoverAttempts >= 5 && (
          <OrderActionForm orderId={o.id} action="regenerate"><SubmitButton variant="secondary">Envoyer un nouveau code au client</SubmitButton></OrderActionForm>
        )}
        {allowedNext(o).includes("CANCELLED") && (
          <OrderActionForm orderId={o.id} action="advance" className="flex flex-wrap gap-2 border-t border-line pt-3">
            <input type="hidden" name="next" value="CANCELLED" />
            <Input name="note" placeholder="Motif d'annulation" className="w-56" />
            <SubmitButton variant="danger">Annuler la commande</SubmitButton>
          </OrderActionForm>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Historique</h2>
        <ol className="space-y-1 border-l-2 border-line pl-4 text-sm">
          {o.events.map((e) => <li key={e.id}>{STATUS_LABEL[e.status]} <span className="text-xs text-muted">· {formatDate(e.createdAt)} · {e.actor}{e.note ? ` · ${e.note}` : ""}</span></li>)}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Messages</h2>
        <Thread messages={o.messages} mine="PHARMACY" />
        <OrderActionForm orderId={o.id} action="message">
          <Textarea name="body" rows={2} required placeholder="Écrire au client" />
          <SubmitButton variant="secondary">Envoyer</SubmitButton>
        </OrderActionForm>
      </Card>
    </div>
  );
}
