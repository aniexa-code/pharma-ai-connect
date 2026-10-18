// Système visuel de disponibilité : quatre états lisibles d'un coup d'œil, avec la fraîcheur de l'information.
export type AvailabilityState = "AVAILABLE" | "CONFIRM" | "UNAVAILABLE" | "STALE";

export type Availability = { state: AvailabilityState; label: string; updated: string | null; fresh: boolean };

export function relativeTime(date: Date, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export function availability(
  stock: { status: string; source: string; confirmedAt: Date | null } | null | undefined,
  now = new Date(),
): Availability {
  if (!stock || stock.status === "UNKNOWN" || !stock.confirmedAt)
    return { state: "CONFIRM", label: "Confirmation nécessaire", updated: null, fresh: false };
  const ageH = (now.getTime() - stock.confirmedAt.getTime()) / 3600_000;
  const updated = `Mis à jour ${relativeTime(stock.confirmedAt, now)}`;
  const fresh = ageH * 3600 < 20;
  if (ageH > 48) return { state: "STALE", label: "Information ancienne", updated, fresh };
  if (stock.status === "OUT") return { state: "UNAVAILABLE", label: "Indisponible", updated, fresh };
  if (stock.source === "ESTIMATE") return { state: "CONFIRM", label: "Confirmation nécessaire", updated, fresh };
  return { state: "AVAILABLE", label: stock.status === "LOW" ? "Disponible · stock faible" : "Disponible", updated, fresh };
}

export const STATE_COLOR: Record<AvailabilityState, string> = {
  AVAILABLE: "#28D5C2",
  CONFIRM: "#E8913A",
  UNAVAILABLE: "#D9534F",
  STALE: "#9AA8B5",
};
