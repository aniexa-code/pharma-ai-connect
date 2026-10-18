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

export type OpenStatus = { open: boolean; label: string; closesSoon: boolean };

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
