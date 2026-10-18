import Link from "next/link";
import type { Product } from "@prisma/client";
import { formatMoney } from "@/lib/config";
import { formatDistance } from "@/lib/geo";
import type { PharmacyResult } from "@/lib/services/search";
import { ReliabilityBadge, StockBadge } from "./badges";
import { Badge, ButtonLink, Card } from "./ui";

export function ContactLinks({ phone, whatsapp }: { phone: string; whatsapp?: string | null }) {
  return (
    <span className="flex flex-wrap gap-3 text-sm">
      <a href={`tel:${phone}`} className="font-medium text-brand-700 hover:underline">Appeler</a>
      {whatsapp && (
        <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          WhatsApp
        </a>
      )}
    </span>
  );
}

export function PharmacyCard({ r, product }: { r: PharmacyResult; product?: Product | null }) {
  const p = r.pharmacy;
  const orderable = product && product.regulation !== "RESTRICTED" && r.stock && ["AVAILABLE", "LOW"].includes(r.stock.status);
  return (
    <Card className="space-y-3" data-testid="pharmacy-result">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/pharmacies/${p.slug}`} className="text-lg font-semibold hover:text-brand-700">{p.name}</Link>
          <p className="text-sm text-muted">
            {p.address}, {p.district}
            {r.distance !== null && <> · <strong className="text-ink">{formatDistance(r.distance)}</strong></>}
          </p>
        </div>
        <Badge tone={r.open.open ? (r.open.closesSoon ? "amber" : "green") : "gray"}>{r.open.label}</Badge>
      </div>

      {product && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3">
          <span className="text-sm font-medium">{product.name} {product.strength}</span>
          <StockBadge status={r.stock?.status} />
          {r.reliability && <ReliabilityBadge r={r.reliability} confirmedAt={r.stock?.confirmedAt} />}
          {r.stock && r.stock.price > 0 && <span className="text-sm font-semibold">{formatMoney(r.stock.price)}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {p.offersPickup && <Badge>Retrait en pharmacie</Badge>}
        {p.offersDelivery ? <Badge tone="blue">Livraison ({formatMoney(p.deliveryFee)})</Badge> : <Badge>Pas de livraison</Badge>}
        <ContactLinks phone={p.phone} whatsapp={p.whatsapp} />
      </div>

      {product && (
        <div className="flex flex-wrap gap-2">
          {orderable && <ButtonLink href={`/commander?pharmacie=${p.slug}&p=${product.id}:1`}>Commander</ButtonLink>}
          <ButtonLink variant={orderable ? "secondary" : "primary"} href={`/demande/nouvelle?pharmacie=${p.slug}&produit=${product.slug}`}>
            Demander une vérification
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}
