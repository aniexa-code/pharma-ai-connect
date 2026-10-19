import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge, formatDate } from "@/components/badges";
import { AccountPrompt, AutoRefresh, CopyButton, SubmitButton } from "@/components/client";
import { Icon } from "@/components/brand";
import { OrderTimeline } from "@/components/progress";
import { ContactLinks } from "@/components/ContactLinks";
import { NotificationList, Thread } from "@/components/Thread";
import { Alert, Badge, ButtonLink, Card, Eyebrow } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { ORDER_SLOTS, formatMoney } from "@/lib/config";
import { CHANNEL_LABEL } from "@/lib/notify";
import { ANSWER_LABEL, METHOD_LABEL, PAYMENT_LABEL, availableMethods, closureParties, customerModes, isFinal, responsibleFor, trackingUrl } from "@/lib/services/orders";
import { orderByTrackingToken, visibleHandoverCode } from "@/lib/services/tracking";
import { maskPhone } from "@/lib/validation";
import { attachToMyAccount, cancelOrder, newTrackingLink } from "../actions";
import { AccountForm, CloseOrderForm, ConfirmOrderForm, OrderMessageForm } from "../forms";

export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false } };
export const dynamic = "force-dynamic";

const CANCELLABLE = ["PRESCRIPTION_REVIEW", "AWAITING_PAYMENT", "PLACED", "AWAITING_CUSTOMER", "CONFIRMED"];

export default async function TrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const o = await orderByTrackingToken(token);
  if (!o) notFound();
  const customer = await getCustomer();
  const code = visibleHandoverCode(o);
  const payment = o.payments.at(-1);
  const pickup = o.fulfillment === "PICKUP";
  const responsible = responsibleFor(o);
  const awaitingMe = o.status === "AWAITING_CUSTOMER";
  // Le code de remise n'a de sens qu'une fois la commande confirmée par le client.
  const showCode = code && !!o.customerConfirmedAt;
  const qty = (i: (typeof o.items)[number]) => (i.answer === "INSUFFICIENT" ? (i.confirmedQty ?? 0) : i.answer && i.answer !== "AVAILABLE" ? 0 : i.quantity);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.nouvelle && <Alert tone="green">Demande transmise à la pharmacie, qui vérifie maintenant chaque produit en rayon. Conservez ce lien : il vous permet de suivre votre commande sans compte.</Alert>}
      {sp.confirmee && <Alert tone="green">Commande confirmée. Votre code de {pickup ? "retrait" : "remise"} est affiché ci-dessous.</Alert>}
      {sp.paye && <Alert tone="green">Paiement confirmé.</Alert>}
      {sp.lien && <Alert tone="blue">Nouveau lien de suivi créé : l'ancien ne fonctionne plus. Enregistrez celui-ci.</Alert>}

      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Eyebrow>Suivi de commande</Eyebrow>
            <p className="font-mono text-2xl font-bold tracking-wide text-navy" data-testid="order-ref">{o.publicRef}</p>
            {o.customerConfirmedAt && <p className="text-sm text-muted">{pickup ? "Retrait en pharmacie" : "Livraison"} · {o.slot}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span data-testid="order-status"><OrderStatusBadge status={o.status} /></span>
            {!isFinal(o.status) && <AutoRefresh />}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <OrderTimeline
            status={o.status}
            closed={!!o.closedAt}
            fulfillment={o.fulfillment}
            events={o.events}
            createdAt={o.createdAt}
            detail={o.status === "PLACED" ? "La pharmacie vérifie chaque produit en rayon." : o.status === "AWAITING_CUSTOMER" ? "À vous : confirmez votre commande." : o.status === "PRESCRIPTION_REVIEW" ? "Un pharmacien vérifie votre demande." : o.status === "AWAITING_PAYMENT" ? "En attente de votre paiement." : o.courierName && !isFinal(o.status) ? `Livreur : ${o.courierName}` : null}
          />
          <div className="space-y-4">
            {showCode && !isFinal(o.status) && (
              <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-center text-white">
                <div className="tech-grid absolute inset-0 opacity-30 invert" />
                <p className="relative text-xs font-semibold text-white/70">Code de {pickup ? "retrait" : "remise"}, à donner uniquement {pickup ? "au comptoir" : "au livreur, à la réception"}</p>
                <p className="relative mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-turq" data-testid="handover-code">{code}</p>
                <p className="relative mt-2 text-[11px] text-white/60">Valable une seule fois, pour cette commande uniquement.</p>
              </div>
            )}
            {o.status === "AWAITING_PAYMENT" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warn-50 p-4">
                <span className="text-sm font-semibold text-navy">Paiement en attente</span>
                <ButtonLink href={`/suivi/${token}/paiement`}>Payer maintenant</ButtonLink>
              </div>
            )}
            {o.status === "PRESCRIPTION_REVIEW" && <Alert tone="amber">Pensez à apporter l'ordonnance originale au retrait.</Alert>}
            <div className="rounded-2xl border border-line p-4">
              <p className="flex items-center gap-2 font-bold text-navy"><Icon name="store" size={18} className="text-blue" />{o.pharmacy.name}</p>
              <p className="mb-3 mt-0.5 text-xs text-muted">{o.pharmacy.address}, {o.pharmacy.district}</p>
              <ContactLinks phone={o.pharmacy.phone} whatsapp={o.pharmacy.whatsapp} lat={o.pharmacy.lat} lng={o.pharmacy.lng} />
            </div>
          </div>
        </div>
        {responsible && (
          <p className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-navy" data-testid="responsible">
            Étape en cours : <strong>{responsible.you ? "Vous" : responsible.who}</strong> {responsible.you ?? responsible.what}.
          </p>
        )}
        {o.customerConfirmedAt && <p className="text-xs text-muted" data-testid="customer-authorization">Autorisation client : <strong className="text-turq-700">CONFIRMÉE</strong> le {formatDate(o.customerConfirmedAt)}</p>}
      </Card>

      {["DELIVERED", "COLLECTED"].includes(o.status) && (
        <Card className="space-y-3" data-testid="closure">
          <h2 className="font-bold text-navy">{o.closedAt ? "Commande clôturée" : "Clôture de la commande"}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {closureParties(o).map((p) => (
              <li key={p.key} className={`rounded-full px-3 py-1 font-semibold ${p.at ? "bg-turq-50 text-turq-700" : "bg-warn-50 text-[#a8611d]"}`}>
                {p.key === "customer" ? "Vous" : p.label} : {p.at ? "clôturé" : "en attente"}
              </li>
            ))}
          </ul>
          {o.customerIssue && !o.customerClosedAt && <Alert tone="amber">Problème signalé : {o.customerIssue}. La pharmacie vous répond dans l'échange ci-dessous.</Alert>}
          {!o.customerClosedAt && <CloseOrderForm token={token} pickup={pickup} />}
        </Card>
      )}

      {awaitingMe && (
        <Card className="space-y-4 ring-2 ring-blue/30" data-testid="awaiting-customer">
          <div>
            <h2 className="text-lg font-extrabold text-navy">La pharmacie a vérifié votre commande</h2>
            <p className="text-sm text-muted">Voici ce qui est réellement disponible et au prix confirmé. Rien n'est réservé ni payé tant que vous n'avez pas confirmé.</p>
          </div>
          <ul className="divide-y divide-line text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span className={qty(i) ? "" : "text-muted line-through"}>
                  {i.productName} × {qty(i) || i.quantity}
                  <br />
                  <span className={`text-xs font-semibold no-underline ${i.answer === "AVAILABLE" ? "text-turq-700" : "text-[#a8611d]"}`}>
                    {i.answer ? ANSWER_LABEL[i.answer] : ""}{i.answer === "INSUFFICIENT" ? ` : ${i.confirmedQty} sur ${i.quantity}` : ""}{i.answerNote ? ` · ${i.answerNote}` : ""}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold">{qty(i) ? formatMoney(i.unitPrice * qty(i), o.currency) : "—"}</span>
              </li>
            ))}
          </ul>
          <ConfirmOrderForm
            token={token}
            modes={customerModes(o)}
            preferred={o.fulfillment}
            slots={ORDER_SLOTS}
            slot={o.slot}
            address={o.deliveryAddress ?? ""}
            methods={availableMethods(o.pharmacy.paymentMethods).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
            preferredMethod={o.paymentPreference ?? "CASH"}
            totals={{ pickup: formatMoney(o.subtotal, o.currency), delivery: formatMoney(o.subtotal + o.pharmacy.deliveryFee, o.currency), fee: formatMoney(o.pharmacy.deliveryFee, o.currency) }}
          />
        </Card>
      )}

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

      <div className="grid gap-6">
        <Card className="space-y-3">
          <h2 className="font-bold text-navy">Détail</h2>
          <ul className="space-y-1 text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span className={o.verifiedAt && !qty(i) ? "text-muted line-through" : ""}>{i.productName} × {o.verifiedAt ? qty(i) || i.quantity : i.quantity}</span>
                <span>{o.verifiedAt && !qty(i) ? "—" : formatMoney(i.unitPrice * (o.verifiedAt ? qty(i) : i.quantity), o.currency)}</span>
              </li>
            ))}
            {o.deliveryFee > 0 && <li className="flex justify-between"><span>Livraison</span><span>{formatMoney(o.deliveryFee, o.currency)}</span></li>}
            <li className="flex justify-between border-t border-line pt-1 font-semibold"><span>{o.verifiedAt ? "Total" : "Total estimé (avant vérification)"}</span><span>{formatMoney(o.total, o.currency)}</span></li>
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
        <h2 className="font-bold text-navy">Échanger avec la pharmacie</h2>
        <Thread messages={o.messages} />
        {!isFinal(o.status) && <OrderMessageForm token={token} />}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold text-navy">Notifications</h2>
        <NotificationList items={o.notifications} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold text-navy">Ce lien</h2>
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
