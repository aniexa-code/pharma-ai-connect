"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { STATE_COLOR, type AvailabilityState } from "@/lib/availability";
import { Icon } from "./brand";

export type MapItem = {
  id: string;
  slug: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  href: string;
  state: AvailabilityState | null; // null : pas de produit recherché
  stateLabel: string;
  updated: string | null;
  open: boolean;
  openLabel: string;
  onDuty: boolean;
  distance: string | null;
  directions: string;
};

const W = 420;
const H = 420;

function project(items: { lat: number; lng: number }[], extra: { lat: number; lng: number }[]) {
  const all = [...items, ...extra];
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const pad = 0.012;
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
  const span = Math.max(maxLat - minLat, maxLng - minLng);
  const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
  return (p: { lat: number; lng: number }) => ({
    x: W / 2 + ((p.lng - cx) / span) * (W - 60),
    y: H / 2 - ((p.lat - cy) / span) * (H - 60),
  });
}

/** Carte abstraite : pas de fond de carte, seulement le réseau des pharmacies connectées. */
export function NetworkMap({ items, user, activeId, onActive }: { items: MapItem[]; user?: { lat: number; lng: number } | null; activeId?: string | null; onActive?: (id: string | null) => void }) {
  const toXY = useMemo(() => project(items.length ? items : [{ lat: -4.26, lng: 15.27 }], user ? [user] : []), [items, user]);
  const hub = user ? toXY(user) : { x: W / 2, y: H / 2 };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Carte des pharmacies">
      <defs>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="#10243B" strokeOpacity="0.05" />
        </pattern>
        <radialGradient id="glow">
          <stop offset="0%" stopColor="#28D5C2" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#28D5C2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {/* Tracés abstraits (fleuve, grands axes), très discrets */}
      <path d="M-10 360 C 90 330, 160 390, 250 350 S 380 300, 440 330" fill="none" stroke="#176B87" strokeOpacity="0.12" strokeWidth="14" strokeLinecap="round" />
      <path d="M40 -10 C 80 120, 150 200, 210 430" fill="none" stroke="#10243B" strokeOpacity="0.06" strokeWidth="3" />
      <path d="M-10 150 C 120 170, 260 120, 430 190" fill="none" stroke="#10243B" strokeOpacity="0.06" strokeWidth="3" />
      {items.map((it) => {
        const p = toXY(it);
        const active = it.id === activeId;
        return <line key={`l-${it.id}`} x1={hub.x} y1={hub.y} x2={p.x} y2={p.y} stroke={active ? "#176B87" : "#10243B"} strokeOpacity={active ? 0.55 : 0.1} strokeWidth={active ? 1.4 : 1} strokeDasharray="3 4" />;
      })}
      {user && (
        <g>
          <circle cx={hub.x} cy={hub.y} r="34" fill="url(#glow)" />
          <circle cx={hub.x} cy={hub.y} r="6" fill="#10243B" />
          <circle cx={hub.x} cy={hub.y} r="2.6" fill="#28D5C2" />
        </g>
      )}
      {items.map((it, i) => {
        const p = toXY(it);
        const active = it.id === activeId;
        const color = it.state ? STATE_COLOR[it.state] : it.open ? "#176B87" : "#9AA8B5";
        return (
          <g key={it.id} className="cursor-pointer" onMouseEnter={() => onActive?.(it.id)} onMouseLeave={() => onActive?.(null)} onClick={() => onActive?.(it.id)}>
            {(it.state === "AVAILABLE" || active) && (
              <circle cx={p.x} cy={p.y} r="10" fill={color} opacity="0.25" className="animate-twinkle" style={{ animationDelay: `${i * 0.35}s` }} />
            )}
            <circle cx={p.x} cy={p.y} r={active ? 8 : 6} fill="#fff" stroke={color} strokeWidth={active ? 3 : 2.4} />
            <circle cx={p.x} cy={p.y} r={active ? 3.2 : 2.4} fill={color} />
            {it.onDuty && <circle cx={p.x + 7} cy={p.y - 7} r="3" fill="#10243B" stroke="#28D5C2" strokeWidth="1.2" />}
            {active && (
              <g>
                <rect x={p.x - 70} y={p.y - 40} width="140" height="24" rx="8" fill="#10243B" />
                <text x={p.x} y={p.y - 24} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{it.name.replace(" (démo)", "")}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Liste + carte synchronisées : survoler une pharmacie la met en évidence sur la carte, et inversement. */
export function PharmacyMapList({ items, user, emptyText = "Aucune pharmacie ne correspond." }: { items: MapItem[]; user?: { lat: number; lng: number } | null; emptyText?: string }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
      <ul className="stagger space-y-3" data-testid="pharmacy-list">
        {items.map((it) => (
          <li
            key={it.id}
            data-testid="pharmacy-result"
            onMouseEnter={() => setActive(it.id)}
            onMouseLeave={() => setActive(null)}
            className={`group rounded-2xl border bg-white p-4 transition-all duration-200 ${active === it.id ? "border-blue/40 shadow-[0_8px_24px_-16px_rgba(23,107,135,0.6)]" : "border-line"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={it.href} className="truncate font-bold text-navy hover:text-blue">{it.name}</Link>
                  {it.onDuty && <span className="rounded bg-navy px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-turq">De garde</span>}
                </div>
                {it.state ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                    <span className="relative inline-flex h-2.5 w-2.5">
                      {it.state === "AVAILABLE" && <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: STATE_COLOR.AVAILABLE }} />}
                      <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[it.state] }} />
                    </span>
                    {it.stateLabel}
                  </p>
                ) : (
                  <p className={`flex items-center gap-2 text-sm font-semibold ${it.open ? "text-navy" : "text-muted"}`}>
                    <span className={`h-2 w-2 rounded-full ${it.open ? "bg-turq" : "bg-faint"}`} />{it.openLabel}
                  </p>
                )}
                <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {it.distance && <span className="inline-flex items-center gap-1"><Icon name="pin" size={13} />À {it.distance}</span>}
                  <span>{it.district}</span>
                  {it.updated && <span className="inline-flex items-center gap-1 text-faint"><Icon name="clock" size={13} />{it.updated}</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Link href={it.href} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-navy px-3 text-xs font-bold text-white hover:bg-blue">
                  Voir <Icon name="arrow" size={14} />
                </Link>
                <a href={it.directions} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-blue hover:underline">Itinéraire</a>
              </div>
            </div>
          </li>
        ))}
        {!items.length && <li className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">{emptyText}</li>}
      </ul>
      <div className="relative order-first aspect-square overflow-hidden rounded-3xl border border-line bg-white lg:sticky lg:top-24 lg:order-none lg:h-[520px] lg:aspect-auto">
        <NetworkMap items={items} user={user} activeId={active} onActive={setActive} />
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-semibold text-muted backdrop-blur">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR.AVAILABLE }} />Disponible</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR.CONFIRM }} />À confirmer</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR.UNAVAILABLE }} />Indisponible</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR.STALE }} />Ancienne</span>
        </div>
      </div>
    </div>
  );
}
