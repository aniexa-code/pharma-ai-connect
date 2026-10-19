import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand";
import { Stepper } from "@/components/progress";
import { Alert, ButtonLink, Card, Eyebrow, PageTitle } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { ORDER_SLOTS, formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { METHOD_LABEL, availableMethods } from "@/lib/services/orders";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = { title: "Commander" };
export const dynamic = "force-dynamic";


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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-line bg-white px-4 py-3">
        <Stepper steps={["Médicament", "Votre demande", "Vérification en pharmacie", "Votre confirmation"]} current={1} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
        <div className="space-y-4">
          <PageTitle eyebrow="Commande sans compte" title="Votre commande" />
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-white"><Icon name="store" size={20} /></span>
              <div>
                <Eyebrow>Pharmacie</Eyebrow>
                <p className="font-bold text-navy">{pharmacy.name}</p>
                <p className="text-xs text-muted">{pharmacy.address}, {pharmacy.district}</p>
              </div>
            </div>
            <ul className="divide-y divide-line border-y border-line text-sm">
              {lines.map(({ s, qty }) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue"><Icon name="pill" size={16} /></span>
                    <span><span className="font-bold text-navy">{s.product.name} {s.product.strength}</span><br /><span className="text-xs text-muted">Quantité : {qty}</span></span>
                  </span>
                  <span className="whitespace-nowrap font-bold text-navy">{s.price > 0 ? formatMoney(s.price * qty) : "Prix à confirmer"}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between text-sm"><span className="text-muted">Sous-total</span><span className="font-bold text-navy">{formatMoney(subtotal)}</span></p>
            {pharmacy.offersDelivery && <p className="flex justify-between text-sm"><span className="text-muted">Frais de livraison (si livraison)</span><span className="font-semibold text-navy">{formatMoney(pharmacy.deliveryFee)}</span></p>}
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
            slots={ORDER_SLOTS}
            subtotal={formatMoney(subtotal)}
            deliveryFee={pharmacy.deliveryFee}
            formatTotal={{ pickup: formatMoney(subtotal), delivery: formatMoney(subtotal + pharmacy.deliveryFee), fee: formatMoney(pharmacy.deliveryFee) }}
            addresses={addresses.map((a) => ({ id: a.id, label: a.label, line: [a.line, a.district, a.city].filter(Boolean).join(", ") }))}
            defaults={{ name: customer?.name, phone: customer?.phone ?? undefined, email: customer?.email, channel: customer?.notifyChannel }}
          />
        </Card>}
      </div>
    </div>
  );
}
