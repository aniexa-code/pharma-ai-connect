import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/brand";
import { Alert, Badge, ButtonLink, Card, PageTitle } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { readCart } from "@/lib/cart";
import { ORDER_SLOTS, formatMoney } from "@/lib/config";
import { cartView } from "@/lib/services/checkout";
import { removeCartLine, updateCartLine } from "./actions";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Panier", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const groups = await cartView(await readCart());
  const customer = await getCustomer();
  const orderable = groups.filter((g) => g.lines.some((l) => l.orderable));
  const total = groups.reduce((n, g) => n + g.lines.filter((l) => l.orderable).reduce((m, l) => m + l.stock.price * l.quantity, 0), 0);

  if (!groups.length)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageTitle eyebrow="Sans compte" title="Votre panier est vide" subtitle="Ajoutez des médicaments depuis la fiche d'une ou plusieurs pharmacies." />
        <ButtonLink href="/recherche"><Icon name="search" size={18} />Rechercher un médicament</ButtonLink>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle eyebrow="Sans compte" title="Votre panier" subtitle={`${groups.length} pharmacie${groups.length > 1 ? "s" : ""} · une commande par pharmacie, chacune vérifiée en rayon avant votre confirmation.`} />
      {sp.ajout && <Alert tone="green">Ajouté au panier. Vous pouvez continuer vos achats dans d'autres pharmacies.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4" data-testid="cart">
          {groups.map((g) => (
            <Card key={g.pharmacy.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/pharmacies/${g.pharmacy.slug}`} className="flex items-center gap-2 font-bold text-navy hover:text-blue"><Icon name="store" size={18} className="text-blue" />{g.pharmacy.name}</Link>
                <Badge tone="gray">{g.pharmacy.offersDelivery ? "Retrait ou livraison" : "Retrait uniquement"}</Badge>
              </div>
              <ul className="divide-y divide-line text-sm">
                {g.lines.map((l) => (
                  <li key={l.stock.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className={l.orderable ? "" : "text-muted"}>
                      <span className="font-semibold text-navy">{l.stock.product.name} {l.stock.product.strength}</span>
                      {l.stock.product.regulation === "PRESCRIPTION" && <> <Badge tone="amber">Ordonnance</Badge></>}
                      {l.reason && <><br /><span className="text-xs text-[#a8611d]">{l.reason}</span></>}
                    </span>
                    <span className="flex items-center gap-2">
                      <form action={updateCartLine} className="flex items-center gap-1">
                        <input type="hidden" name="pharmacyId" value={g.pharmacy.id} />
                        <input type="hidden" name="productId" value={l.stock.productId} />
                        <input name="quantity" type="number" min={0} max={10} defaultValue={l.quantity} aria-label={`Quantité de ${l.stock.product.name}`} className="h-9 w-16 rounded-lg border border-line-strong px-2 text-center" />
                        <button className="text-xs font-semibold text-blue">OK</button>
                      </form>
                      <span className="w-24 text-right font-semibold text-navy">{formatMoney(l.stock.price * l.quantity)}</span>
                      <form action={removeCartLine}>
                        <input type="hidden" name="pharmacyId" value={g.pharmacy.id} />
                        <input type="hidden" name="productId" value={l.stock.productId} />
                        <button aria-label={`Retirer ${l.stock.product.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-danger-50 hover:text-danger"><Icon name="x" size={16} /></button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <p className="flex justify-between rounded-2xl bg-navy p-4 text-white">
            <span className="font-semibold">Total indicatif</span>
            <span className="text-xl font-extrabold text-turq">{formatMoney(total)}</span>
          </p>
          <p className="text-xs text-muted">Prix indicatifs du stock numérique : chaque pharmacie confirme ses prix après vérification. Les frais de livraison s'ajoutent si vous choisissez la livraison.</p>
        </div>
        {orderable.length > 0 ? (
          <Card>
            <CheckoutForm
              slots={ORDER_SLOTS}
              pharmacies={orderable.length}
              anyDelivery={orderable.some((g) => g.pharmacy.offersDelivery)}
              defaults={{ name: customer?.name, phone: customer?.phone ?? undefined, email: customer?.email, channel: customer?.notifyChannel }}
            />
          </Card>
        ) : (
          <Alert tone="amber">Aucun produit de votre panier ne peut être commandé en ligne.</Alert>
        )}
      </div>
    </div>
  );
}
