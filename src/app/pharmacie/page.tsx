import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, ReliabilityBadge, StockBadge, formatDate } from "@/components/badges";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Input, Select } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { reliability } from "@/lib/reliability";
import { REQUEST_STATUS_LABEL } from "@/lib/services/requests";
import { pharmacyLogout, updateStock } from "./actions";

export const metadata: Metadata = { title: "Tableau de bord pharmacie", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PharmacyDashboard() {
  const u = await requirePharmacyUser();
  const pid = u.pharmacyId;
  const [requests, orders, stocks] = await Promise.all([
    db.pharmacyRequest.findMany({ where: { pharmacyId: pid, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.order.findMany({ where: { pharmacyId: pid, status: { notIn: ["DELIVERED", "COLLECTED", "CANCELLED"] } }, include: { items: true }, orderBy: { createdAt: "asc" } }),
    db.stock.findMany({ where: { pharmacyId: pid }, include: { product: true }, orderBy: { product: { name: "asc" } } }),
  ]);
  const productName = new Map(stocks.map((s) => [s.productId, `${s.product.name} ${s.product.strength ?? ""}`]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{u.pharmacy.name}</h1>
          <p className="text-sm text-muted">{u.name} · {u.email}</p>
        </div>
        <form action={pharmacyLogout}><SubmitButton variant="secondary">Se déconnecter</SubmitButton></form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Demandes en attente <Badge tone="amber">{requests.length}</Badge></h2>
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="py-2">
                <Link href={`/pharmacie/demandes/${r.id}`} className="flex flex-wrap justify-between gap-2 hover:text-brand-700">
                  <span className="text-sm"><span className="font-mono font-semibold">{r.publicRef}</span> · {r.productId ? `${productName.get(r.productId)} × ${r.quantity}` : "Question"}</span>
                  <span className="text-xs text-muted">{formatDate(r.createdAt)} · {REQUEST_STATUS_LABEL[r.status]}</span>
                </Link>
              </li>
            ))}
            {!requests.length && <li className="py-2 text-sm text-muted">Aucune demande en attente.</li>}
          </ul>
        </Card>

        <Card className="space-y-2">
          <h2 className="font-semibold">Commandes en cours <Badge tone="blue">{orders.length}</Badge></h2>
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="py-2">
                <Link href={`/pharmacie/commandes/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:text-brand-700">
                  <span className="text-sm"><span className="font-mono font-semibold">{o.publicRef}</span> · {o.fulfillment === "PICKUP" ? "Retrait" : "Livraison"} · {o.slot}</span>
                  <OrderStatusBadge status={o.status} />
                </Link>
              </li>
            ))}
            {!orders.length && <li className="py-2 text-sm text-muted">Aucune commande en cours.</li>}
          </ul>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">Disponibilités</h2>
        <p className="text-sm text-muted">Chaque mise à jour est horodatée : les visiteurs voient une disponibilité « Fiable » pendant 6 h.</p>
        <ul className="divide-y divide-line">
          {stocks.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{s.product.name} {s.product.strength}</p>
                <div className="flex flex-wrap items-center gap-2"><StockBadge status={s.status} /><ReliabilityBadge r={reliability(s)} confirmedAt={s.confirmedAt} /></div>
              </div>
              <form action={updateStock} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="stockId" value={s.id} />
                <Select name="status" defaultValue={s.status === "UNKNOWN" ? "AVAILABLE" : s.status} className="w-36">
                  <option value="AVAILABLE">Disponible</option>
                  <option value="LOW">Stock faible</option>
                  <option value="OUT">Indisponible</option>
                </Select>
                <Input name="price" type="number" min={0} defaultValue={s.price} className="w-28" aria-label="Prix" />
                <SubmitButton variant="secondary">Confirmer</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Prix en {formatMoney(0).replace(/^0\s*/, "")}.</p>
      </Card>
    </div>
  );
}
