import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/services/orders";
import { STATE_COLOR, availability, type Availability, type AvailabilityState } from "@/lib/availability";
import type { Reliability } from "@/lib/reliability";
import { timezone } from "@/lib/config";
import { Badge, type Tone } from "./ui";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: timezone() });
export const formatDate = (d: Date) => fmt.format(d);

/** Point de statut. Disponible : léger halo turquoise. Juste confirmé : passage animé de l'orange au turquoise. */
export function StatusDot({ state, fresh = false, size = 9 }: { state: AvailabilityState; fresh?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {state === "AVAILABLE" && <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: STATE_COLOR.AVAILABLE }} />}
      <span className={`relative inline-block rounded-full ${fresh && state === "AVAILABLE" ? "animate-confirm" : ""}`} style={{ width: size, height: size, background: STATE_COLOR[state] }} />
    </span>
  );
}

export function AvailabilityLine({ a, compact = false }: { a: Availability; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5" data-testid="availability">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><StatusDot state={a.state} fresh={a.fresh} />{a.label}</span>
      {!compact && <span className="text-xs text-faint">{a.updated ?? "Jamais confirmée"}</span>}
    </span>
  );
}

export function StockAvailability({ stock }: { stock: Parameters<typeof availability>[0] }) {
  return <AvailabilityLine a={availability(stock)} />;
}

/** Conservé pour l'espace pharmacie : niveau de fiabilité détaillé. */
export function ReliabilityBadge({ r, confirmedAt }: { r: Reliability; confirmedAt?: Date | null }) {
  const tone: Tone = r.level === "HIGH" ? "green" : r.level === "MEDIUM" ? "amber" : "gray";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={tone} title={r.hint}>Fiabilité : {r.label}</Badge>
      <span className="text-xs text-faint">{confirmedAt ? `Confirmée le ${formatDate(confirmedAt)}` : "Jamais confirmée"}</span>
    </span>
  );
}

export function StockBadge({ status, confirmedAt, source }: { status?: string | null; confirmedAt?: Date | null; source?: string }) {
  return <AvailabilityLine compact a={availability(status ? { status, confirmedAt: confirmedAt ?? null, source: source ?? "PHARMACY" } : null)} />;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone: Tone = status === "CANCELLED" ? "red" : ["DELIVERED", "COLLECTED"].includes(status) ? "green" : ["PRESCRIPTION_REVIEW", "AWAITING_PAYMENT"].includes(status) ? "amber" : "blue";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function DutyBadge() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-navy px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-turq">De garde</span>;
}
