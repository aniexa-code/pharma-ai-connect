import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/services/orders";
import type { Reliability } from "@/lib/reliability";
import { STOCK_LABEL } from "@/lib/reliability";
import { Badge, type Tone } from "./ui";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: process.env.TIMEZONE || "Africa/Brazzaville" });
export const formatDate = (d: Date) => fmt.format(d);

export function StockBadge({ status }: { status?: string | null }) {
  const s = status ?? "UNKNOWN";
  const tone: Tone = s === "AVAILABLE" ? "green" : s === "LOW" ? "amber" : s === "OUT" ? "red" : "gray";
  return <Badge tone={tone}>{STOCK_LABEL[s]}</Badge>;
}

export function ReliabilityBadge({ r, confirmedAt }: { r: Reliability; confirmedAt?: Date | null }) {
  const tone: Tone = r.level === "HIGH" ? "green" : r.level === "MEDIUM" ? "amber" : "gray";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={tone} title={r.hint}>Fiabilité : {r.label}</Badge>
      <span className="text-xs text-muted">{confirmedAt ? `Dernière confirmation : ${formatDate(confirmedAt)}` : "Jamais confirmée"}</span>
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone: Tone = status === "CANCELLED" ? "red" : ["DELIVERED", "COLLECTED"].includes(status) ? "green" : ["PRESCRIPTION_REVIEW", "AWAITING_PAYMENT"].includes(status) ? "amber" : "blue";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}
