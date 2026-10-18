import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatusBadge, formatDate } from "@/components/badges";
import { SubmitButton } from "@/components/client";
import { Thread } from "@/components/Thread";
import { Alert, Badge, ButtonLink, Card, Input, Textarea } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { METHOD_LABEL, PAYMENT_LABEL, STATUS_LABEL, allowedNext } from "@/lib/services/orders";
import { OrderActionForm } from "../../forms";

export const metadata: Metadata = { title: "Commande", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PharmacyOrder({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePharmacyUser();
  const { id } = await params;
  const o = await db.order.findFirst({
    where: { id, pharmacyId: u.pharmacyId },
    include: { items: true, events: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { createdAt: "asc" } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!o) notFound();
  const next = allowedNext(o).filter((s) => s !== "CANCELLED");
  const handover = (o.fulfillment === "PICKUP" && o.status === "READY_FOR_PICKUP") || (o.fulfillment === "DELIVERY" && o.status === "OUT_FOR_DELIVERY");
  const payment = o.payments.at(-1);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ButtonLink variant="secondary" href="/pharmacie">← Tableau de bord</ButtonLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{o.publicRef}</h1>
        <OrderStatusBadge status={o.status} />
        {o.requiresPrescription && <Badge tone="amber">Ordonnance</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-1 text-sm">
          <p className="font-semibold">{o.fulfillment === "PICKUP" ? "Retrait" : "Livraison"} · {o.slot}</p>
          <p>Client : {o.contactName}</p>
          <p>Téléphone : <a href={`tel:${o.phone}`} className="text-brand-700">{o.phone}</a></p>
          {o.deliveryAddress && <p>Adresse : {o.deliveryAddress}{o.deliveryNotes ? ` (${o.deliveryNotes})` : ""}</p>}
          {o.courierName && <p>Livreur : {o.courierName}</p>}
          <p className="pt-2">{payment && <>{METHOD_LABEL[payment.method]} · <strong>{PAYMENT_LABEL[payment.status]}</strong></>}</p>
        </Card>
        <Card className="text-sm">
          <ul className="space-y-1">
            {o.items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.productName} × {i.quantity}{i.regulation === "PRESCRIPTION" ? " (ordonnance)" : ""}</span><span>{formatMoney(i.unitPrice * i.quantity, o.currency)}</span></li>)}
            <li className="flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{formatMoney(o.total, o.currency)}</span></li>
          </ul>
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">Actions</h2>
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
