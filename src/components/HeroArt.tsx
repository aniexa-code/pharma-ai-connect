// Décor du hero : réseau abstrait de pharmacies connectées et quelques médicaments qui flottent doucement.
const NODES = [
  [80, 90], [190, 60], [300, 120], [420, 70], [530, 140], [650, 80], [760, 150], [880, 90],
  [130, 220], [260, 260], [400, 210], [560, 270], [700, 230], [840, 260], [960, 200],
];
const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [0, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [2, 10], [4, 11], [6, 12], [7, 14]];

export function HeroNetwork() {
  return (
    <svg viewBox="0 0 1040 320" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {LINKS.map(([a, b], i) => (
        <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#176B87" strokeOpacity="0.13" strokeWidth="1" strokeDasharray="400" className="animate-draw" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
      {NODES.map(([x, y], i) => (
        <g key={i}>
          {i % 3 === 0 && <circle cx={x} cy={y} r="9" fill="#28D5C2" opacity="0.18" className="animate-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />}
          <circle cx={x} cy={y} r={i % 3 === 0 ? 3.2 : 2.2} fill={i % 3 === 0 ? "#28D5C2" : "#176B87"} fillOpacity={i % 3 === 0 ? 0.9 : 0.35} />
        </g>
      ))}
    </svg>
  );
}

function Capsule() {
  return (
    <svg width="54" height="24" viewBox="0 0 54 24">
      <rect x="1" y="1" width="52" height="22" rx="11" fill="#fff" stroke="#176B87" strokeWidth="1.5" />
      <path d="M27 1h15a11 11 0 0 1 0 22H27Z" fill="#28D5C2" fillOpacity="0.85" />
    </svg>
  );
}
function Tablet() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r="13.5" fill="#fff" stroke="#10243B" strokeOpacity="0.5" strokeWidth="1.5" />
      <path d="M6 15h18" stroke="#10243B" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function Blister() {
  return (
    <svg width="58" height="40" viewBox="0 0 58 40">
      <rect x="1" y="1" width="56" height="38" rx="8" fill="#F4F8FB" stroke="#176B87" strokeOpacity="0.5" strokeWidth="1.5" />
      {[0, 1, 2].map((c) => [0, 1].map((r) => <circle key={`${c}${r}`} cx={13 + c * 16} cy={12 + r * 16} r="5" fill="#fff" stroke="#28D5C2" strokeWidth="1.5" />))}
    </svg>
  );
}

export function FloatingMeds() {
  const items = [
    { el: <Capsule />, cls: "left-[4%] top-[18%]", r: "-25deg", d: "0s" },
    { el: <Tablet />, cls: "right-[8%] top-[12%]", r: "0deg", d: "1.5s" },
    { el: <Blister />, cls: "right-[4%] bottom-[16%] hidden sm:block", r: "12deg", d: "3s" },
    { el: <Tablet />, cls: "left-[10%] bottom-[12%] hidden sm:block", r: "0deg", d: "2.2s" },
    { el: <Capsule />, cls: "right-[24%] top-[4%] hidden md:block", r: "35deg", d: "4s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {items.map((it, i) => (
        <div key={i} className={`absolute opacity-70 drop-shadow-[0_8px_16px_rgba(16,36,59,0.10)] animate-float ${it.cls}`} style={{ ["--r" as string]: it.r, animationDelay: it.d }}>
          {it.el}
        </div>
      ))}
    </div>
  );
}
