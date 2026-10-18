import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, ButtonLink, Card, PageTitle } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { METHOD_LABEL, availableMethods } from "@/lib/services/orders";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = { title: "Commander" };
export const dynamic = "force-dynamic";

const SLOTS = ["Dès que possible", "Aujourd'hui, 12 h – 14 h", "Aujourd'hui, 14 h – 17 h", "Aujourd'hui, 17 h – 20 h", "Demain, 8 h – 12 h", "Demain, 14 h – 18 h"];

export default async function OrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const slug = String(sp.pharmacie ?? "");
  const pharmacy = await db.pharmacy.findFirst({ where: { slug, active: true } });
  if (!pharmacy) notFound();

  // Panier transmis par l'URL : « p=id:qté » (répétable) ou « q_id=qté » depuis la fiche pharmacie.
  const wanted = new Map<string, number>();
  for (const v of ([] as string[]).concat(sp.p ?? [])) {
    const [id, q] = v.split(":");
    if (id) wanted.set(id, Number(q) || 1);
  }
  for (const [k, v] of Object.entries(sp)) if (k.startsWith("q_") && Number(v) > 0) wanted.set(k.slice(2), Number(v));

  const stocks = await db.stock.findMany({ where: { pharmacyId: pharmacy.id, productId: { in: [...wanted.keys()] } }, include: { product: true } });
  if (!stocks.length)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="amber">Aucun produit sélectionné.</Alert>
        <ButtonLink href={`/pharmacies/${pharmacy.slug}`}>Choisir des produits</ButtonLink>
      </div>
    );

  const lines = stocks.map((s) => ({ s, qty: Math.min(10, wanted.get(s.productId)!) }));
  const restricted = lines.filter((l) => l.s.product.regulation === "RESTRICTED" || l.s.status === "OUT");
  const orderable = lines.filter((l) => !restricted.includes(l));
  const subtotal = orderable.reduce((n, l) => n + l.s.price * l.qty, 0);
  const prescription = orderable.some((l) => l.s.product.regulation === "PRESCRIPTION");
  const customer = await getCustomer();
  const addresses = customer ? await db.address.findMany({ where: { customerId: customer.id } }) : [];

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-4">
        <PageTitle title="Votre commande" subtitle={pharmacy.name} />
        <Card className="space-y-3">
          <ul className="divide-y divide-line text-sm">
            {lines.map(({ s, qty }) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span>{s.product.name} {s.product.strength} × {qty}</span>
                <span className="font-medium">{formatMoney(s.price * qty)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between text-sm font-semibold"><span>Sous-total</span><span>{formatMoney(subtotal)}</span></p>
          {pharmacy.offersDelivery && <p className="text-xs text-muted">Livraison : {formatMoney(pharmacy.deliveryFee)}</p>}
        </Card>
        {restricted.length > 0 && (
          <Alert tone="amber">
            {restricted.map((l) => l.s.product.name).join(", ")} : non commandable en ligne pour l'instant. Retirez-le de la commande ou contactez la pharmacie.
          </Alert>
        )}
      </div>
      {orderable.length > 0 && <Card>
        <OrderForm
          pharmacyId={pharmacy.id}
          items={orderable.map((l) => `${l.s.productId}:${l.qty}`)}
          pickup={pharmacy.offersPickup}
          delivery={pharmacy.offersDelivery}
          prescription={prescription}
          methods={availableMethods(pharmacy.paymentMethods).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
          slots={SLOTS}
          subtotal={formatMoney(subtotal)}
          deliveryFee={pharmacy.deliveryFee}
          formatTotal={{ pickup: formatMoney(subtotal), delivery: formatMoney(subtotal + pharmacy.deliveryFee) }}
          addresses={addresses.map((a) => ({ id: a.id, label: a.label, line: [a.line, a.district, a.city].filter(Boolean).join(", ") }))}
          defaults={{ name: customer?.name, phone: customer?.phone ?? undefined, email: customer?.email, channel: customer?.notifyChannel }}
        />
      </Card>}
    </div>
  );
}
