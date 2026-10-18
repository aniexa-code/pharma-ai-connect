import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge, formatDate } from "@/components/badges";
import { AccountPrompt, CopyButton, SubmitButton } from "@/components/client";
import { ContactLinks } from "@/components/PharmacyCard";
import { NotificationList, Thread } from "@/components/Thread";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { CHANNEL_LABEL } from "@/lib/notify";
import { METHOD_LABEL, PAYMENT_LABEL, STATUS_LABEL, isFinal, trackingUrl } from "@/lib/services/orders";
import { orderByTrackingToken, visibleHandoverCode } from "@/lib/services/tracking";
import { maskPhone } from "@/lib/validation";
import { attachToMyAccount, cancelOrder, newTrackingLink } from "../actions";
import { AccountForm, OrderMessageForm } from "../forms";

export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false } };
export const dynamic = "force-dynamic";

const CANCELLABLE = ["PRESCRIPTION_REVIEW", "AWAITING_PAYMENT", "PLACED", "CONFIRMED"];

export default async function TrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const o = await orderByTrackingToken(token);
  if (!o) notFound();
  const customer = await getCustomer();
  const code = visibleHandoverCode(o);
  const payment = o.payments.at(-1);
  const pickup = o.fulfillment === "PICKUP";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.nouvelle && <Alert tone="green">Commande enregistrée. Conservez ce lien : il vous permet de suivre votre commande sans compte.</Alert>}
      {sp.paye && <Alert tone="green">Paiement confirmé.</Alert>}
      {sp.lien && <Alert tone="blue">Nouveau lien de suivi créé : l'ancien ne fonctionne plus. Enregistrez celui-ci.</Alert>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">Commande <strong className="font-mono text-ink" data-testid="order-ref">{o.publicRef}</strong></p>
          <span data-testid="order-status"><OrderStatusBadge status={o.status} /></span>
        </div>
        <div>
          <h1 className="text-xl font-bold">{pickup ? "Retrait en pharmacie" : "Livraison"} · {o.slot}</h1>
          <p className="text-sm text-muted">{o.pharmacy.name} · {o.pharmacy.address}, {o.pharmacy.district}</p>
          <ContactLinks phone={o.pharmacy.phone} whatsapp={o.pharmacy.whatsapp} />
        </div>

        {code && !isFinal(o.status) && (
          <div className="rounded-xl border-2 border-dashed border-brand-500 bg-brand-50 p-4 text-center">
            <p className="text-sm">Code de {pickup ? "retrait" : "remise"}, à donner uniquement {pickup ? "au comptoir" : "au livreur, à la réception"}</p>
            <p className="font-mono text-3xl font-bold tracking-[0.3em]" data-testid="handover-code">{code}</p>
            <p className="text-xs text-muted">Valable une seule fois, pour cette commande uniquement.</p>
          </div>
        )}
        {o.status === "PRESCRIPTION_REVIEW" && (
          <Alert tone="amber">Un pharmacien vérifie votre demande. Vous serez notifié dès sa validation. Pensez à apporter l'ordonnance originale au retrait.</Alert>
        )}
        {o.status === "AWAITING_PAYMENT" && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3">
            <span className="text-sm">Paiement en attente.</span>
            <ButtonLink href={`/suivi/${token}/paiement`}>Payer maintenant</ButtonLink>
          </div>
        )}
      </Card>

      {sp.nouvelle && !customer && (
        <Card><AccountPrompt><AccountForm token={token} name={o.contactName} phone={o.phone} email={o.email} /></AccountPrompt></Card>
      )}
      {customer && !o.customerId && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Vous êtes connecté. Ajouter cette commande à votre historique ?</p>
          <form action={attachToMyAccount}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton variant="secondary">Ajouter à mon compte</SubmitButton>
          </form>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">Suivi</h2>
          <ol className="space-y-3 border-l-2 border-line pl-4" data-testid="timeline">
            {o.events.map((e) => (
              <li key={e.id}>
                <p className="text-sm font-medium">{STATUS_LABEL[e.status]}</p>
                <p className="text-xs text-muted">{formatDate(e.createdAt)}{e.note ? ` · ${e.note}` : ""}</p>
              </li>
            ))}
          </ol>
          {o.courierName && <p className="text-sm">Livreur : <strong>{o.courierName}</strong></p>}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Détail</h2>
          <ul className="space-y-1 text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3"><span>{i.productName} × {i.quantity}</span><span>{formatMoney(i.unitPrice * i.quantity, o.currency)}</span></li>
            ))}
            {o.deliveryFee > 0 && <li className="flex justify-between"><span>Livraison</span><span>{formatMoney(o.deliveryFee, o.currency)}</span></li>}
            <li className="flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{formatMoney(o.total, o.currency)}</span></li>
          </ul>
          {payment && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {METHOD_LABEL[payment.method]} <Badge tone={payment.status === "CONFIRMED" ? "green" : payment.status === "PENDING" ? "amber" : payment.status === "REFUNDED" ? "blue" : "red"}><span data-testid="payment-status">{PAYMENT_LABEL[payment.status]}</span></Badge>
            </p>
          )}
          <p className="text-xs text-muted">
            Contact : {o.contactName}, {maskPhone(o.phone)} · Notifications : {CHANNEL_LABEL[o.notifyChannel]}
            {o.deliveryAddress && <><br />Adresse : {o.deliveryAddress}</>}
          </p>
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">Échanger avec la pharmacie</h2>
        <Thread messages={o.messages} />
        {!isFinal(o.status) && <OrderMessageForm token={token} />}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Notifications</h2>
        <NotificationList items={o.notifications} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Ce lien</h2>
        <p className="text-sm text-muted">
          Toute personne qui possède ce lien peut voir cette commande. Ne le partagez qu'avec quelqu'un de confiance (par exemple la personne qui récupère la commande).
          Valable jusqu'au {formatDate(o.trackingExpiresAt)}.
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={trackingUrl(token)} />
          <form action={newTrackingLink}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton variant="secondary">Désactiver ce lien et en créer un nouveau</SubmitButton>
          </form>
          {CANCELLABLE.includes(o.status) && (
            <form action={cancelOrder}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton variant="danger">Annuler la commande</SubmitButton>
            </form>
          )}
        </div>
      </Card>
      <p className="text-center text-sm text-muted"><Link href="/" className="hover:underline">Nouvelle recherche</Link></p>
    </div>
  );
}
