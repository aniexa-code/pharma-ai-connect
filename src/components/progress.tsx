import type { OrderEvent, OrderStatus } from "@prisma/client";
import { formatDate } from "./badges";
import { Icon } from "./brand";

/** Étapes visuelles d'un parcours (commande). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Étapes">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold transition ${done ? "bg-navy text-turq" : active ? "bg-blue text-white ring-4 ring-blue/15" : "border border-line-strong bg-white text-faint"}`}>
              {done ? <Icon name="check" size={16} strokeWidth={2.2} /> : i + 1}
            </span>
            <span className={`hidden truncate text-xs font-bold sm:inline ${active ? "text-navy" : done ? "text-navy/70" : "text-faint"}`}>{s}</span>
            {i < steps.length - 1 && <span className={`h-px flex-1 ${done ? "bg-navy" : "bg-line-strong"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

const STEPS = ["Demande envoyée", "Pharmacie contactée", "Disponibilité confirmée", "Commande préparée", "READY", "Terminée"] as const;

function stepIndex(status: OrderStatus) {
  switch (status) {
    case "PRESCRIPTION_REVIEW":
    case "PLACED":
      return 1;
    case "AWAITING_PAYMENT":
    case "AWAITING_CUSTOMER":
    case "CONFIRMED":
      return 2;
    case "PREPARING":
      return 3;
    case "READY_FOR_PICKUP":
    case "COURIER_ASSIGNED":
    case "PICKED_UP":
    case "OUT_FOR_DELIVERY":
      return 4;
    case "DELIVERED":
    case "COLLECTED":
      return 6;
    default:
      return -1;
  }
}

const STEP_STATUSES: OrderStatus[][] = [[], ["PRESCRIPTION_REVIEW", "PLACED"], ["AWAITING_CUSTOMER", "AWAITING_PAYMENT", "CONFIRMED"], ["PREPARING"], ["READY_FOR_PICKUP", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"], ["DELIVERED", "COLLECTED"]];

/** Timeline de suivi : l'étape en cours pulse en turquoise. */
export function OrderTimeline({ status, fulfillment, events, createdAt, detail, closed = true }: { status: OrderStatus; fulfillment: "PICKUP" | "DELIVERY"; events: OrderEvent[]; createdAt: Date; detail?: string | null; closed?: boolean }) {
  // Remise faite mais clôture incomplète : l'étape « Terminée » reste en cours.
  const current = stepIndex(status) === 6 && !closed ? 5 : stepIndex(status);
  const cancelled = status === "CANCELLED";
  const lastIdx = cancelled ? Math.max(0, ...events.filter((e) => e.status !== "CANCELLED").map((e) => stepIndex(e.status) - 1)) : -1;
  return (
    <ol className="relative space-y-0" data-testid="timeline">
      {STEPS.map((raw, i) => {
        const label = raw === "READY" ? (fulfillment === "PICKUP" ? "Prête au retrait" : "En livraison") : raw;
        const done = !cancelled && (i < current || current === 6);
        const active = !cancelled && i === current;
        const reached = cancelled ? i <= lastIdx : done || active;
        const at = i === 0 ? createdAt : events.find((e) => STEP_STATUSES[i].includes(e.status))?.createdAt;
        return (
          <li key={raw} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STEPS.length - 1 && <span className={`absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5 ${done ? "bg-navy" : "bg-line"}`} />}
            <span className="relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center">
              {active && <span className="absolute inset-0 rounded-full bg-turq animate-pulse-ring" />}
              <span className={`relative grid h-6 w-6 place-items-center rounded-full ${done ? "bg-navy text-turq" : active ? "bg-turq text-navy" : reached ? "bg-navy/60 text-white" : "border-2 border-line-strong bg-white"}`}>
                {done && <Icon name="check" size={14} strokeWidth={2.4} />}
                {active && <span className="h-2 w-2 rounded-full bg-navy" />}
              </span>
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${done || active ? "text-navy" : "text-faint"}`}>{label}</p>
              {at && (done || active || reached) && <p className="text-xs text-muted">{formatDate(at)}</p>}
              {active && detail && <p className="mt-1 text-xs font-semibold text-blue">{detail}</p>}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="mt-4 flex items-center gap-3 rounded-xl bg-danger-50 px-3 py-2 text-sm font-bold text-danger">
          <Icon name="x" size={18} /> Commande annulée
        </li>
      )}
    </ol>
  );
}
