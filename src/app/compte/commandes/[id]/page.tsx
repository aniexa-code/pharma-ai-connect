import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatusBadge, formatDate } from "@/components/badges";
import { NotificationList } from "@/components/Thread";
import { Card, PageTitle } from "@/components/ui";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { PAYMENT_LABEL, STATUS_LABEL, isFinal } from "@/lib/services/orders";
import { visibleHandoverCode } from "@/lib/services/tracking";

export const metadata: Metadata = { title: "Commande" };
export const dynamic = "force-dynamic";

export default async function AccountOrder({ params }: { params: Promise<{ id: string }> }) {
  const c = await requireCustomer();
  const { id } = await params;
  // Accès réservé au compte auquel la commande est rattachée.
  const o = await db.order.findFirst({
    where: { id, customerId: c.id },
    include: { pharmacy: true, items: true, events: { orderBy: { createdAt: "asc" } }, payments: true, notifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!o) notFound();
  const code = visibleHandoverCode(o);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={o.publicRef} subtitle={`${o.pharmacy.name} · ${formatDate(o.createdAt)}`} />
      <Card className="space-y-3">
        <OrderStatusBadge status={o.status} />
        {code && !isFinal(o.status) && <p>Code de {o.fulfillment === "PICKUP" ? "retrait" : "remise"} : <strong className="font-mono text-xl tracking-widest">{code}</strong></p>}
        <ul className="text-sm">
          {o.items.map((i) => <li key={i.id}>{i.productName} × {i.quantity}</li>)}
        </ul>
        <p className="text-sm font-semibold">Total {formatMoney(o.total, o.currency)} · Paiement : {PAYMENT_LABEL[o.payments.at(-1)?.status ?? "PENDING"]}</p>
        <ol className="space-y-1 border-l-2 border-line pl-4 text-sm">
          {o.events.map((e) => <li key={e.id}>{STATUS_LABEL[e.status]} <span className="text-xs text-muted">· {formatDate(e.createdAt)}</span></li>)}
        </ol>
      </Card>
      <Card><NotificationList items={o.notifications} /></Card>
    </div>
  );
}
