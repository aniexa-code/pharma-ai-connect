import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AvailabilityLine, DutyBadge } from "@/components/badges";
import { Icon } from "@/components/brand";
import { SubmitButton } from "@/components/client";
import { NetworkMap } from "@/components/NetworkMap";
import { Badge, ButtonLink, Card, Eyebrow, Input, buttonClass } from "@/components/ui";
import { getCustomer, requireCustomer } from "@/lib/auth";
import { availability } from "@/lib/availability";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { formatDistance } from "@/lib/geo";
import { hoursLines, openStatus, type WeeklyHours } from "@/lib/hours";
import { directionsUrl } from "@/lib/map-items";

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

export default async function PharmacyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await db.pharmacy.findFirst({
    where: { slug, active: true },
    include: { stocks: { include: { product: true }, orderBy: { product: { name: "asc" } } } },
  });
  if (!p) notFound();
  const customer = await getCustomer();
  const fav = customer ? await db.favoritePharmacy.findUnique({ where: { customerId_pharmacyId: { customerId: customer.id, pharmacyId: p.id } } }) : null;
  const open = openStatus(p.openingHours as WeeklyHours, p.onDuty);
  const focus = sp.produit ? p.stocks.find((s) => s.product.slug === sp.produit) : undefined;
  const focusA = focus ? availability(focus) : null;
  const focusOrderable = focus && focus.product.regulation !== "RESTRICTED" && focus.status !== "OUT";
  const distance = Number(sp.d);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <div className="tech-grid pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-navy sm:text-3xl">{p.name}</h1>
              {p.onDuty && <DutyBadge />}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1"><Icon name="pin" size={15} />{p.address}, {p.district}, {p.city}</span>
              {Number.isFinite(distance) && sp.d && <span className="font-semibold text-navy">À {formatDistance(distance)}</span>}
            </p>
            <p className={`inline-flex items-center gap-2 text-sm font-bold ${open.open ? "text-navy" : "text-muted"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${open.open ? "bg-turq" : "bg-faint"}`} />{open.label}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={directionsUrl(p)} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><Icon name="route" size={18} />Itinéraire</a>
            <a href={`tel:${p.phone}`} className={buttonClass("secondary")}><Icon name="phone" size={18} />Contacter</a>
            {p.whatsapp && <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><Icon name="chat" size={18} />WhatsApp</a>}
            {customer && (
              <form action={toggleFavorite}>
                <input type="hidden" name="pharmacyId" value={p.id} />
                <input type="hidden" name="slug" value={p.slug} />
                <SubmitButton variant="ghost">{fav ? "★ Favorite" : "☆ Favori"}</SubmitButton>
              </form>
            )}
          </div>
        </div>
      </Card>

      {focus && focusA && (
        <Card className="border-blue/25 bg-gradient-to-br from-white to-blue-50/60">
          <Eyebrow>Disponibilité</Eyebrow>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted">Médicament recherché</p>
              <p className="text-lg font-extrabold text-navy">{focus.product.name} {focus.product.strength}</p>
              <AvailabilityLine a={focusA} />
              {focus.price > 0 && <p className="text-sm font-bold text-navy">{formatMoney(focus.price)} <span className="font-medium text-muted">l'unité</span></p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink variant={focusOrderable && focusA.state === "AVAILABLE" ? "secondary" : "primary"} href={`/demande/nouvelle?pharmacie=${p.slug}&produit=${focus.product.slug}`}>
                <Icon name="check" size={18} />Confirmer avec la pharmacie
              </ButtonLink>
              {focusOrderable && <ButtonLink href={`/commander?pharmacie=${p.slug}&p=${focus.productId}:1`}><Icon name="bag" size={18} />Commander</ButtonLink>}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-navy">Médicaments et disponibilités</h2>
            <Badge tone="gray">{p.stocks.length} références</Badge>
          </div>
          <form action="/commander" method="get" className="space-y-3">
            <input type="hidden" name="pharmacie" value={p.slug} />
            <ul className="divide-y divide-line">
              {p.stocks.map((s) => {
                const orderable = s.product.regulation !== "RESTRICTED" && s.status !== "OUT";
                return (
                  <li key={s.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${s.id === focus?.id ? "-mx-2 rounded-xl bg-blue-50/60 px-2" : ""}`}>
                    <div className="min-w-0 space-y-1">
                      <p className="font-bold text-navy">
                        {s.product.name} {s.product.strength} <span className="text-sm font-medium text-faint">· {s.product.form}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <AvailabilityLine a={availability(s)} />
                        {s.product.regulation === "PRESCRIPTION" && <Badge tone="amber">Ordonnance</Badge>}
                        {s.product.regulation === "RESTRICTED" && <Badge tone="red">Non commandable en ligne</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.price > 0 && <span className="whitespace-nowrap text-sm font-extrabold text-navy">{formatMoney(s.price)}</span>}
                      {orderable ? (
                        <Input type="number" name={`q_${s.productId}`} min={0} max={10} defaultValue={s.id === focus?.id ? 1 : 0} className="w-20 text-center" aria-label={`Quantité de ${s.product.name}`} />
                      ) : (
                        <ButtonLink variant="ghost" href={`/demande/nouvelle?pharmacie=${p.slug}&produit=${s.product.slug}`}>Vérifier</ButtonLink>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <ButtonLink variant="ghost" href={`/demande/nouvelle?pharmacie=${p.slug}&type=question`}><Icon name="chat" size={18} />Écrire à la pharmacie</ButtonLink>
              <SubmitButton>Commander la sélection</SubmitButton>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-white">
            <NetworkMap
              items={[{ id: p.id, slug: p.slug, name: p.name, district: p.district, lat: p.lat, lng: p.lng, href: "", state: focusA?.state ?? null, stateLabel: "", updated: null, open: open.open, openLabel: open.label, onDuty: p.onDuty, distance: null, directions: "" }]}
              activeId={p.id}
            />
          </div>
          <Card className="space-y-3">
            <h2 className="flex items-center gap-2 font-extrabold text-navy"><Icon name="clock" size={18} className="text-blue" />Horaires</h2>
            <ul className="space-y-1.5 text-sm">
              {hoursLines(p.openingHours as WeeklyHours).map((l) => (
                <li key={l.day} className="flex justify-between gap-4"><span className="text-muted">{l.day}</span><span className="font-semibold text-navy">{l.text === "00:00 – 24:00" ? "24 h / 24" : l.text}</span></li>
              ))}
            </ul>
          </Card>
          <Card className="space-y-2 text-sm">
            <h2 className="font-extrabold text-navy">Services</h2>
            <p className="flex items-center gap-2"><Icon name="store" size={16} className={p.offersPickup ? "text-turq-700" : "text-faint"} />{p.offersPickup ? "Retrait en pharmacie" : "Pas de retrait"}</p>
            <p className="flex items-center gap-2"><Icon name="truck" size={16} className={p.offersDelivery ? "text-turq-700" : "text-faint"} />{p.offersDelivery ? `Livraison · ${formatMoney(p.deliveryFee)} · ${p.deliveryRadiusKm} km` : "Pas de livraison"}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
