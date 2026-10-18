// Identité : une croix formée de nœuds connectés. Le nœud central turquoise signale la disponibilité.
export function LogoMark({ size = 32, framed = true, className = "" }: { size?: number; framed?: boolean; className?: string }) {
  const fg = framed ? "#ffffff" : "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      {framed && <rect width="40" height="40" rx="11" fill="#10243B" />}
      <path d="M20 8 L32 20 L20 32 L8 20 Z" fill="none" stroke={fg} strokeOpacity="0.32" strokeWidth="1.2" />
      <path d="M20 9.5v21M9.5 20h21" stroke={fg} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="20" cy="8" r="2.7" fill={fg} />
      <circle cx="32" cy="20" r="2.7" fill={fg} />
      <circle cx="20" cy="32" r="2.7" fill={fg} />
      <circle cx="8" cy="20" r="2.7" fill={fg} />
      <circle cx="20" cy="20" r="4.6" fill={framed ? "#10243B" : "transparent"} />
      <circle cx="20" cy="20" r="3.2" fill="#28D5C2" />
    </svg>
  );
}

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={compact ? 30 : 34} />
      <span className={`leading-none ${inverted ? "text-white" : "text-navy"}`}>
        <span className="block text-[15px] font-extrabold tracking-tight">
          Pharma AI <span className={inverted ? "text-turq" : "text-blue"}>Connect</span>
        </span>
        {!compact && <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] ${inverted ? "text-white/60" : "text-faint"}`}>Trouver · Vérifier · Commander · Recevoir</span>}
      </span>
    </span>
  );
}

type IconName =
  | "pin" | "check" | "bag" | "box" | "search" | "clock" | "phone" | "route" | "chat" | "shield" | "pill" | "home"
  | "list" | "user" | "truck" | "moon" | "filter" | "arrow" | "store" | "bolt" | "refresh" | "x" | "map" | "receipt" | "logout";

const PATHS: Record<IconName, React.ReactNode> = {
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.5 2.5 5-5.2" /></>,
  bag: <><path d="M5.5 8.5h13l-1 11h-11l-1-11Z" /><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" /></>,
  box: <><path d="m12 3.5 7.5 4v9L12 20.5l-7.5-4v-9L12 3.5Z" /><path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  phone: <path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 6a2 2 0 0 1 2-2Z" />,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16" /></>,
  chat: <path d="M5 5.5h14v10H10l-4 3.5v-3.5H5v-10Z" />,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6l-7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
  pill: <><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="m9.6 8.6 4.8 6.8" /></>,
  home: <><path d="M4.5 10.5 12 4.5l7.5 6v9h-5v-5.5h-5v5.5h-5v-9Z" /></>,
  list: <path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01" />,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  truck: <><path d="M3.5 6.5h10v9h-10zM13.5 9.5h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  filter: <path d="M4.5 6h15M7.5 12h9M10.5 18h3" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  store: <><path d="M4.5 9.5h15v10h-15zM4 9.5 5.5 4.5h13l1.5 5" /><path d="M10 19.5v-5h4v5" /></>,
  bolt: <path d="M13 3.5 6 13h5l-1 7.5 7-9.5h-5l1-7.5Z" />,
  refresh: <><path d="M19 12a7 7 0 1 1-2-4.9" /><path d="M19 4.5v4h-4" /></>,
  x: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  map: <><path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13Z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" /><path d="M9 8h6M9 12h6" /></>,
  logout: <><path d="M14 4.5H6.5v15H14" /><path d="M10.5 12H20m-3-3 3 3-3 3" /></>,
};

export function Icon({ name, size = 20, className = "", strokeWidth = 1.6 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
export type { IconName };
