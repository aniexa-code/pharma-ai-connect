import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/badges";
import { AutoRefresh, CopyButton } from "@/components/client";
import { Icon } from "@/components/brand";
import { Alert, Card, Eyebrow, buttonClass } from "@/components/ui";
import { formatMoney, siteUrl } from "@/lib/config";
import { trackingToken } from "@/lib/crypto";
import { checkoutByToken } from "@/lib/services/checkout";
import { responsibleFor } from "@/lib/services/orders";

export const metadata: Metadata = { title: "Suivi du panier", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutTracking({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const data = await checkoutByToken(token);
  if (!data) notFound();
  const { checkout, orders } = data;
  const toConfirm = orders.filter((o) => o.status === "AWAITING_CUSTOMER").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.nouvelle && <Alert tone="green">Panier envoyé : {orders.length > 1 ? `${orders.length} commandes ont été transmises, une par pharmacie` : "votre commande a été transmise"}. Conservez ce lien pour tout suivre au même endroit.</Alert>}
      <Card className="space-y-2">
        <Eyebrow>Suivi du panier</Eyebrow>
        <p className="font-mono text-2xl font-bold tracking-wide text-navy" data-testid="checkout-ref">{checkout.publicRef}</p>
        <p className="text-sm text-muted">{orders.length} commande{orders.length > 1 ? "s" : ""}{toConfirm ? ` · ${toConfirm} à confirmer par vous` : ""}</p>
        <AutoRefresh />
      </Card>
      <div className="space-y-3" data-testid="checkout-orders">
        {orders.map((o) => {
          const r = responsibleFor(o);
          return (
            <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-bold text-navy"><Icon name="store" size={18} className="text-blue" />{o.pharmacy.name}</p>
                <p className="font-mono text-xs text-muted">{o.publicRef} · {o.items.length} produit{o.items.length > 1 ? "s" : ""} · {formatMoney(o.total, o.currency)}{o.verifiedAt ? "" : " (estimé)"}</p>
                {r && <p className="text-xs text-navy">Étape en cours : <strong>{r.you ? "Vous" : r.who}</strong> {r.you ?? r.what}.</p>}
              </div>
              <div className="flex items-center gap-2">
                <OrderStatusBadge status={o.status} />
                {o.trackingNonce && (
                  <Link href={`/suivi/${trackingToken(o.trackingNonce)}`} className={buttonClass(o.status === "AWAITING_CUSTOMER" ? "primary" : "secondary", "min-h-10")}>
                    {o.status === "AWAITING_CUSTOMER" ? "Confirmer" : "Voir"}
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="space-y-2">
        <p className="text-sm text-muted">Toute personne qui possède ce lien peut voir ces commandes. Ne le partagez qu'avec une personne de confiance.</p>
        <CopyButton text={`${siteUrl()}/suivi/groupe/${token}`} />
      </Card>
    </div>
  );
}
