import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ReliabilityBadge, StockBadge } from "@/components/badges";
import { ContactLinks } from "@/components/PharmacyCard";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, Input } from "@/components/ui";
import { getCustomer, requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { hoursLines, openStatus, type WeeklyHours } from "@/lib/hours";
import { reliability } from "@/lib/reliability";

export const dynamic = "force-dynamic";

async function toggleFavorite(formData: FormData) {
  "use server";
  const c = await requireCustomer();
  const pharmacyId = String(formData.get("pharmacyId"));
  const key = { customerId_pharmacyId: { customerId: c.id, pharmacyId } };
  if (await db.favoritePharmacy.findUnique({ where: key })) await db.favoritePharmacy.delete({ where: key });
  else await db.favoritePharmacy.create({ data: { customerId: c.id, pharmacyId } });
  revalidatePath(`/pharmacies/${formData.get("slug")}`);
}

export default async function PharmacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await db.pharmacy.findFirst({
    where: { slug, active: true },
    include: { stocks: { include: { product: true }, orderBy: { product: { name: "asc" } } } },
  });
  if (!p) notFound();
  const customer = await getCustomer();
  const fav = customer ? await db.favoritePharmacy.findUnique({ where: { customerId_pharmacyId: { customerId: customer.id, pharmacyId: p.id } } }) : null;
  const open = openStatus(p.openingHours as WeeklyHours, p.onDuty);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-muted">{p.address}, {p.district}, {p.city}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={open.open ? "green" : "gray"}>{open.label}</Badge>
            {p.onDuty && <Badge tone="blue">De garde</Badge>}
            <ContactLinks phone={p.phone} whatsapp={p.whatsapp} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" href={`/demande/nouvelle?pharmacie=${p.slug}&type=question`}>Écrire à la pharmacie</ButtonLink>
          {customer && (
            <form action={toggleFavorite}>
              <input type="hidden" name="pharmacyId" value={p.id} />
              <input type="hidden" name="slug" value={p.slug} />
              <SubmitButton variant="secondary">{fav ? "★ Favorite" : "☆ Ajouter aux favoris"}</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Produits et disponibilités</h2>
          <form action="/commander" method="get" className="space-y-3">
            <input type="hidden" name="pharmacie" value={p.slug} />
            <ul className="divide-y divide-line">
              {p.stocks.map((s) => {
                const orderable = s.product.regulation !== "RESTRICTED" && s.status !== "OUT";
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {s.product.name} {s.product.strength} <span className="text-sm font-normal text-muted">· {s.product.form}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <StockBadge status={s.status} />
                        <ReliabilityBadge r={reliability(s)} confirmedAt={s.confirmedAt} />
                        {s.product.regulation === "PRESCRIPTION" && <Badge tone="amber">Ordonnance</Badge>}
                        {s.product.regulation === "RESTRICTED" && <Badge tone="red">Non commandable en ligne</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.price > 0 && <span className="font-semibold">{formatMoney(s.price)}</span>}
                      {orderable ? (
                        <Input type="number" name={`q_${s.productId}`} min={0} max={10} defaultValue={0} className="w-20" aria-label={`Quantité de ${s.product.name}`} />
                      ) : (
                        <ButtonLink variant="secondary" href={`/demande/nouvelle?pharmacie=${p.slug}&produit=${s.product.slug}`}>Vérifier</ButtonLink>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <SubmitButton>Commander la sélection</SubmitButton>
            </div>
          </form>
        </Card>

        <Card className="h-fit space-y-3">
          <h2 className="text-lg font-semibold">Horaires</h2>
          <ul className="space-y-1 text-sm">
            {hoursLines(p.openingHours as WeeklyHours).map((l) => (
              <li key={l.day} className="flex justify-between gap-4"><span>{l.day}</span><span className="text-muted">{l.text}</span></li>
            ))}
          </ul>
          <h2 className="pt-2 text-lg font-semibold">Services</h2>
          <ul className="space-y-1 text-sm text-muted">
            <li>{p.offersPickup ? "✓ Retrait en pharmacie" : "✗ Pas de retrait"}</li>
            <li>{p.offersDelivery ? `✓ Livraison (${formatMoney(p.deliveryFee)}, rayon ${p.deliveryRadiusKm} km)` : "✗ Pas de livraison"}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
