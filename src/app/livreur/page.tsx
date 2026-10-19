import type { Metadata } from "next";
import type { Courier, OrderStatus } from "@prisma/client";
import { Icon } from "@/components/brand";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { Alert, Card, Input, buttonClass } from "@/components/ui";
import { requireCourier } from "@/lib/auth";
import { relativeTime } from "@/lib/availability";
import { formatMoney } from "@/lib/config";
import { db } from "@/lib/db";
import { directionsUrl } from "@/lib/map-items";
import Link from "next/link";
import { distanceKm, formatDistance } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { locateAddress } from "@/lib/services/fees";
import { courierBalance } from "@/lib/services/ledger";
import { missionLabel, openMissions } from "@/lib/services/orders";
import { COURIER_DOCS, STATUS_LABEL, docLabel, documentsOf } from "@/lib/services/onboarding";
import { AddCourierDocumentsForm } from "./inscription/forms";
import { courierLogout } from "./actions";
import { MissionForm } from "./forms";

export const metadata: Metadata = { title: "Centre de livraison", robots: { index: false } };
export const dynamic = "force-dynamic";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "COURIER_ASSIGNED", label: "Acceptée" },
  { status: "PICKED_UP", label: "Récupérée" },
  { status: "OUT_FOR_DELIVERY", label: "En route" },
  { status: "DELIVERED", label: "Livrée" },
];
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { COURIER_ASSIGNED: "Commande récupérée", PICKED_UP: "Démarrer la livraison" };
const STATUS_TEXT: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "En attente de retrait",
  PREPARING: "En préparation",
  COURIER_ASSIGNED: "En attente de retrait",
  PICKED_UP: "Récupérée",
  OUT_FOR_DELIVERY: "En route",
};

/** Zone de destination, seule information montrée avant acceptation (l'adresse exacte reste privée). */
async function zoneOf(address: string | null, zones: { name: string }[]) {
  const a = (address ?? "").toLowerCase();
  return zones.find((z) => a.includes(z.name.toLowerCase()))?.name ?? "Communiquée après acceptation";
}

const STATUS_TEXT_DOSSIER = {
  PENDING: "Votre dossier est en cours de vérification. Vous recevrez des missions dès qu'il sera validé.",
  NEEDS_INFO: "Notre équipe a besoin d'éléments complémentaires avant de valider votre dossier.",
  REJECTED: "Votre dossier n'a pas été validé.",
  SUSPENDED: "Votre compte est suspendu : vous ne recevez plus de missions.",
} as const;

/** Dossier pas encore validé (ou suspendu) : aucune mission, seulement le statut et l'ajout de pièces. */
async function CourierDossier({ c, fresh }: { c: Courier; fresh: boolean }) {
  const docs = await documentsOf("COURIER", c.id);
  const status = c.verificationStatus as Exclude<typeof c.verificationStatus, "APPROVED">;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue">Centre de livraison</p>
          <h1 className="text-2xl font-extrabold text-navy">Bonjour {c.name}</h1>
        </div>
        <form action={courierLogout}><button className={buttonClass("secondary", "min-h-10")}><Icon name="logout" size={16} />Quitter</button></form>
      </div>
      {fresh && <Alert tone="green">Dossier envoyé. Nous vérifions vos pièces avant de vous ouvrir les missions.</Alert>}
      <Card className="space-y-3" data-testid="verification-status">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">Statut du dossier</p>
        <p className="text-xl font-extrabold text-navy">{STATUS_LABEL[status]}</p>
        <p className="text-sm text-muted">{STATUS_TEXT_DOSSIER[status]}</p>
        {c.verificationNote && <Alert tone="amber">Message de l'équipe : {c.verificationNote}</Alert>}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold text-navy">Pièces envoyées</h2>
        <ul className="space-y-1 text-sm">
          {docs.map((d) => <li key={d.id} className="flex items-center gap-2"><Icon name="check" size={16} className="text-turq-700" />{docLabel("COURIER", d.kind)}</li>)}
        </ul>
        {(status === "PENDING" || status === "NEEDS_INFO") && (
          <div className="space-y-2 border-t border-line pt-3">
            <h3 className="text-sm font-bold text-navy">Ajouter ou remplacer une pièce</h3>
            <AddCourierDocumentsForm docs={COURIER_DOCS.map((d) => ({ kind: d.kind, label: d.label }))} />
          </div>
        )}
      </Card>
    </div>
  );
}

export default async function CourierHome({ searchParams }: { searchParams: Promise<{ nouveau?: string }> }) {
  const c = await requireCourier();
  if (c.verificationStatus !== "APPROVED" || !c.active) return <CourierDossier c={c} fresh={!!(await searchParams).nouveau} />;
  const [open, mine, zones] = await Promise.all([
    openMissions(),
    db.order.findMany({ where: { courierId: c.id, status: { in: ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] } }, include: { pharmacy: true, payments: true }, orderBy: { updatedAt: "desc" } }),
    db.zone.findMany(),
  ]);
  // Alerte de mission : seules les pharmacies à distance raisonnable de la zone habituelle du livreur (réglage).
  const { courier: rules } = await getSettings();
  const home = c.zone ? await locateAddress(c.zone, c.city ?? undefined) : null;
  const nearby = open
    .map((o) => ({ o, pickupKm: home ? distanceKm(home, o.pharmacy) : null }))
    .filter((m) => m.pickupKm === null || m.pickupKm <= rules.missionRadiusKm);
  const openZones = await Promise.all(nearby.map(({ o }) => zoneOf(o.deliveryAddress, zones)));
  const balance = await courierBalance(c.id);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue">Centre de livraison</p>
          <h1 className="text-2xl font-extrabold text-navy">Bonjour {c.name.replace(" (démo)", "")}</h1>
          <AutoRefresh seconds={20} />
        </div>
        <div className="flex gap-2">
          <Link href="/livreur/gains" className={buttonClass("secondary", "min-h-10")} data-testid="balance-link">Gains · {formatMoney(balance)}</Link>
          <form action={courierLogout}><button className={buttonClass("ghost", "min-h-10")} aria-label="Quitter"><Icon name="logout" size={16} /></button></form>
        </div>
      </div>

      {mine.map((o) => {
        const idx = STEPS.findIndex((s) => s.status === o.status);
        return (
          <section key={o.id} className="overflow-hidden rounded-3xl border border-line bg-white" data-testid="my-mission">
            <div className="flex items-center justify-between bg-navy px-5 py-4 text-white">
              <p className="font-mono text-lg font-bold">Mission #{missionLabel(o.missionNo)}</p>
              <span className="rounded-full bg-turq px-2.5 py-0.5 text-xs font-extrabold text-navy">{STATUS_TEXT[o.status]}</span>
            </div>
            <div className="space-y-4 p-5">
              <ol className="flex items-center gap-1.5">
                {STEPS.map((s, i) => (
                  <li key={s.status} className="flex flex-1 flex-col gap-1.5">
                    <span className={`h-1.5 rounded-full ${i < idx ? "bg-navy" : i === idx ? "bg-turq animate-pulse" : "bg-line"}`} />
                    <span className={`text-[11px] font-bold ${i <= idx ? "text-navy" : "text-faint"}`}>{s.label}</span>
                  </li>
                ))}
              </ol>
              {o.status === "PICKED_UP" && !o.pharmacyClosedAt && (
                <p className="rounded-xl bg-warn-50 px-3 py-2 text-sm font-semibold text-[#a8611d]" data-testid="awaiting-handoff">
                  En attente de la pharmacie : elle doit confirmer vous avoir remis la commande avant le départ.
                </p>
              )}
              <div className="grid gap-3 text-sm">
                <p className="flex gap-3"><Icon name="store" className="text-blue" /><span><span className="block text-xs text-muted">Pharmacie</span><span className="font-bold text-navy">{o.pharmacy.name}</span><br />{o.pharmacy.address}, {o.pharmacy.district}</span></p>
                <p className="flex gap-3"><Icon name="pin" className="text-blue" /><span><span className="block text-xs text-muted">Destination</span><span className="font-bold text-navy">{o.deliveryAddress}</span>{o.deliveryNotes && <><br />{o.deliveryNotes}</>}<br />{o.contactName} · <a href={`tel:${o.phone}`} className="font-semibold text-blue">{o.phone}</a></span></p>
                <p className="flex gap-3">
                  <Icon name="receipt" className="text-blue" />
                  {o.payments.some((p) => p.method === "CASH" && p.status === "PENDING") ? (
                    <span>À encaisser à la remise : <strong className="text-navy">{formatMoney(o.total, o.currency)}</strong></span>
                  ) : (
                    <span className="font-semibold text-turq-700">Déjà payée en ligne : rien à encaisser</span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={o.status === "COURIER_ASSIGNED" ? directionsUrl(o.pharmacy) : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.deliveryAddress ?? "")}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                  <Icon name="route" size={18} />Itinéraire
                </a>
                {NEXT_LABEL[o.status] && !(o.status === "PICKED_UP" && !o.pharmacyClosedAt) && (
                  <MissionForm orderId={o.id} action="next"><SubmitButton>{NEXT_LABEL[o.status]}</SubmitButton></MissionForm>
                )}
              </div>
              {o.status === "OUT_FOR_DELIVERY" && (
                <MissionForm orderId={o.id} action="deliver" className="flex flex-wrap gap-2 rounded-2xl bg-icy p-3">
                  <Input name="code" inputMode="numeric" placeholder="Code client" required className="flex-1 font-mono" />
                  <SubmitButton>Valider la livraison</SubmitButton>
                </MissionForm>
              )}
            </div>
          </section>
        );
      })}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-extrabold text-navy">Missions disponibles <span className="rounded-full bg-blue-50 px-2 text-xs font-bold text-blue">{nearby.length}</span></h2>
        {home && <p className="text-xs text-muted">Pharmacies à {rules.missionRadiusKm} km au plus de votre zone ({c.zone}).</p>}
        {nearby.map(({ o, pickupKm }, i) => (
          <article key={o.id} className="space-y-3 rounded-2xl border border-line bg-white p-4" data-testid="open-mission">
            <div className="flex items-center justify-between">
              <p className="font-mono font-bold text-navy">Mission #{missionLabel(o.missionNo)}</p>
              <span className="text-xs text-faint">{relativeTime(o.createdAt)}</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Pharmacie</dt><dd className="font-semibold text-navy">{o.pharmacy.name}</dd>
              <dt className="text-muted">Destination</dt><dd className="font-semibold text-navy">Zone client : {openZones[i]}</dd>
              {pickupKm !== null && <><dt className="text-muted">Depuis votre zone</dt><dd className="font-semibold text-navy">{formatDistance(pickupKm)} jusqu'à la pharmacie</dd></>}
              {o.deliveryDistanceKm !== null && <><dt className="text-muted">Course</dt><dd className="font-semibold text-navy">{o.deliveryDistanceKm} km</dd></>}
              <dt className="text-muted">Statut</dt><dd className="font-semibold text-navy">{STATUS_TEXT[o.status]}</dd>
              <dt className="text-muted">Votre gain</dt><dd className="font-extrabold text-turq-700" data-testid="mission-earning">{formatMoney(o.courierEarning, o.currency)}</dd>
            </dl>
            <div className="flex gap-2">
              <MissionForm orderId={o.id} action="accept" className="flex-1"><SubmitButton className="w-full">Accepter</SubmitButton></MissionForm>
              <a href={directionsUrl(o.pharmacy)} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><Icon name="route" size={18} />Itinéraire</a>
            </div>
          </article>
        ))}
        {!nearby.length && <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">Aucune mission pour le moment. La liste se met à jour automatiquement.</p>}
      </section>
    </div>
  );
}
