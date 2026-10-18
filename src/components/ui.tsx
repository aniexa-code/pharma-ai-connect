import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", ...p }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-line bg-white p-5 shadow-sm ${className}`} {...p} />;
}

const TONES = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-800 ring-rose-200",
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const BTN = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-line bg-white text-ink hover:bg-brand-50",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};

export function buttonClass(variant: keyof typeof BTN = "primary", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${BTN[variant]} ${extra}`;
}

export function ButtonLink({ variant = "primary", className = "", ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof BTN }) {
  return <Link className={buttonClass(variant, className)} {...p} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={`${inputClass} ${p.className ?? ""}`} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={`${inputClass} ${p.className ?? ""}`} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={`${inputClass} ${p.className ?? ""}`} />;
}

export function Alert({ tone = "red", children }: { tone?: Tone; children: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className={`rounded-xl px-4 py-3 text-sm ring-1 ${TONES[tone]}`}>{children}</div>;
}

/** Champ piège invisible pour les robots (laissé vide par les humains). */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Ne pas remplir
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <p className="text-muted">{subtitle}</p>}
    </div>
  );
}
