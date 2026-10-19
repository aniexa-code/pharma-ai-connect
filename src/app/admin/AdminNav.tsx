import Link from "next/link";
import { Icon } from "@/components/brand";
import { buttonClass } from "@/components/ui";
import { adminLogout } from "./actions";

const LINKS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/reglages", label: "Réglages" },
];

export function AdminNav({ name, current }: { name: string; current: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue">Administration</p>
        <p className="text-sm text-muted">Connecté : {name}</p>
      </div>
      <nav className="flex flex-wrap items-center gap-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={buttonClass(l.href === current ? "primary" : "secondary", "min-h-10")}>{l.label}</Link>
        ))}
        <form action={adminLogout}><button className={buttonClass("ghost", "min-h-10")}><Icon name="logout" size={16} />Quitter</button></form>
      </nav>
    </div>
  );
}
