import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, formatDate } from "@/components/badges";
import { SubmitButton } from "@/components/client";
import { Alert, ButtonLink, Card, Input, PageTitle } from "@/components/ui";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { isFinal } from "@/lib/services/orders";
import { addAddress, destroyAccount, logout, removeAddress, removeFavorite } from "./actions";
import { ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ rattachee?: string }> }) {
  const c = await requireCustomer();
  const { rattachee } = await searchParams;
  const [orders, addresses, favPharmacies, favProducts] = await Promise.all([
    db.order.findMany({ where: { customerId: c.id }, include: { pharmacy: true }, orderBy: { createdAt: "desc" } }),
    db.address.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "asc" } }),
    db.favoritePharmacy.findMany({ where: { customerId: c.id }, include: { pharmacy: true } }),
    db.favoriteProduct.findMany({ where: { customerId: c.id }, include: { product: true } }),
  ]);
  const current = orders.filter((o) => !isFinal(o.status));
  const past = orders.filter((o) => isFinal(o.status));
  const row = (o: (typeof orders)[number]) => (
    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <Link href={`/compte/commandes/${o.id}`} className="space-y-0.5">
        <p className="font-mono text-sm font-semibold">{o.publicRef}</p>
        <p className="text-xs text-muted">{o.pharmacy.name} · {formatDate(o.createdAt)} · {formatMoney(o.total, o.currency)}</p>
      </Link>
      <OrderStatusBadge status={o.status} />
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle title={`Bonjour ${c.name}`} subtitle={c.email} />
        <form action={logout}><SubmitButton variant="secondary">Se déconnecter</SubmitButton></form>
      </div>
      {rattachee && <Alert tone="green">Commande ajoutée à votre compte.</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Commandes en cours</h2>
            <ButtonLink variant="secondary" href="/compte/rattacher">Rattacher une commande</ButtonLink>
          </div>
          {current.length ? <ul className="divide-y divide-line">{current.map(row)}</ul> : <p className="text-sm text-muted">Aucune commande en cours.</p>}
          {past.length > 0 && (
            <>
              <h3 className="pt-3 text-sm font-semibold">Commandes précédentes</h3>
              <ul className="divide-y divide-line">{past.map(row)}</ul>
            </>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Favoris</h2>
          <ul className="space-y-2 text-sm">
            {favPharmacies.map((f) => (
              <li key={f.pharmacyId} className="flex items-center justify-between gap-2">
                <Link href={`/pharmacies/${f.pharmacy.slug}`} className="hover:text-brand-700">★ {f.pharmacy.name}</Link>
                <form action={removeFavorite}><input type="hidden" name="id" value={f.pharmacyId} /><button className="text-xs text-muted hover:text-rose-700">Retirer</button></form>
              </li>
            ))}
            {favProducts.map((f) => (
              <li key={f.productId} className="flex items-center justify-between gap-2">
                <Link href={`/recherche?q=${encodeURIComponent(f.product.name)}&produit=${f.product.slug}`} className="hover:text-brand-700">♥ {f.product.name} {f.product.strength}</Link>
                <form action={removeFavorite}><input type="hidden" name="kind" value="product" /><input type="hidden" name="id" value={f.productId} /><button className="text-xs text-muted hover:text-rose-700">Retirer</button></form>
              </li>
            ))}
            {!favPharmacies.length && !favProducts.length && <li className="text-muted">Ajoutez des favoris depuis une pharmacie ou un produit.</li>}
          </ul>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Adresses enregistrées</h2>
          <ul className="space-y-2 text-sm">
            {addresses.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span><strong>{a.label}</strong> · {[a.line, a.district, a.city].filter(Boolean).join(", ")}</span>
                <form action={removeAddress}><input type="hidden" name="id" value={a.id} /><button className="text-xs text-muted hover:text-rose-700">Supprimer</button></form>
              </li>
            ))}
          </ul>
          <form action={addAddress} className="grid gap-2 sm:grid-cols-2">
            <Input name="label" placeholder="Nom (Maison, Bureau)" required />
            <Input name="line" placeholder="Adresse et repère" required />
            <Input name="district" placeholder="Quartier" />
            <Input name="city" placeholder="Ville" defaultValue="Brazzaville" />
            <SubmitButton variant="secondary">Ajouter</SubmitButton>
          </form>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Informations et notifications</h2>
          <ProfileForm name={c.name} phone={c.phone ?? ""} channel={c.notifyChannel} marketing={c.marketingOptIn} />
          <form action={destroyAccount} className="border-t border-line pt-3">
            <p className="mb-2 text-xs text-muted">Supprimer le compte : vos commandes restent suivables par leur lien, mais ne sont plus liées à un compte.</p>
            <SubmitButton variant="danger">Supprimer mon compte</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
