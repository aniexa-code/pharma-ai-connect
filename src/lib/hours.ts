// Statut d'ouverture calculé dans le fuseau de la pharmacie.
import { timezone } from "./config";

export type WeeklyHours = Record<string, [string, string][]>;

export const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function localParts(now: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export type OpenStatus = { open: boolean; label: string; closesSoon: boolean; unknown?: boolean };

/** Une garde n'est valable que si elle a une date de fin, et que cette date n'est pas passée. */
export function isOnDuty(p: { onDuty: boolean; onDutyUntil: Date | null }, now = new Date()) {
  return p.onDuty && !!p.onDutyUntil && p.onDutyUntil > now;
}

type PharmacyHours = { openingHours: unknown; onDuty: boolean; onDutyUntil: Date | null; hoursConfirmedAt: Date | null; country: string };

/**
 * Statut d'ouverture présenté au public. Une pharmacie n'est jamais affichée « ouverte » si sa garde
 * a expiré ou si ses horaires n'ont pas été reconfirmés depuis trop longtemps.
 */
export function pharmacyOpenStatus(p: PharmacyHours, now = new Date(), hoursMaxAgeDays = 120): OpenStatus {
  const duty = isOnDuty(p, now);
  const stale = !p.hoursConfirmedAt || now.getTime() - p.hoursConfirmedAt.getTime() > hoursMaxAgeDays * 86400_000;
  if (stale && !duty) return { open: false, closesSoon: false, unknown: true, label: "Horaires à confirmer : appelez avant de vous déplacer" };
  return openStatus(p.openingHours as WeeklyHours, duty, now, timezone(p.country));
}

export function openStatus(hours: WeeklyHours, onDuty: boolean, now = new Date(), tz = timezone()): OpenStatus {
  const { day, minutes } = localParts(now, tz);
  const ranges = hours[String(day)] ?? [];
  for (const [start, end] of ranges) {
    const s = toMin(start);
    const e = end === "24:00" ? 1440 : toMin(end);
    if (minutes >= s && minutes < e) {
      const closesSoon = e - minutes <= 45 && e !== 1440;
      return { open: true, closesSoon, label: e === 1440 ? "Ouverte" : `Ouverte jusqu'à ${end}` };
    }
  }
  if (onDuty) return { open: true, closesSoon: false, label: "Ouverte (pharmacie de garde)" };
  const next = ranges.map(([s]) => toMin(s)).find((s) => s > minutes);
  if (next !== undefined) {
    const h = String(Math.floor(next / 60)).padStart(2, "0");
    const m = String(next % 60).padStart(2, "0");
    return { open: false, closesSoon: false, label: `Fermée · ouvre à ${h}:${m}` };
  }
  return { open: false, closesSoon: false, label: "Fermée" };
}

export function hoursLines(hours: WeeklyHours) {
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DAY_NAMES[d],
    text: (hours[String(d)] ?? []).map(([s, e]) => `${s} – ${e}`).join(", ") || "Fermée",
  }));
}

/** Heure murale « AAAA-MM-JJTHH:MM » dans un fuseau → instant UTC. */
export function zonedWallTimeToUtc(wall: string, tz = timezone()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(asUtc)).map((x) => [x.type, x.value]));
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - asUtc;
  return new Date(asUtc - offset);
}

/** Instant UTC → « AAAA-MM-JJTHH:MM » dans le fuseau (valeur d'un champ datetime-local). */
export function utcToZonedWallTime(d: Date, tz = timezone()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
