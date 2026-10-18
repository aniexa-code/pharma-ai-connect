import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", ...p }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,36,59,0.04)] sm:p-6 ${className}`} {...p} />;
}

const TONES = {
  green: "bg-turq-50 text-turq-700 ring-turq/30",
  amber: "bg-warn-50 text-[#a8611d] ring-warn/30",
  red: "bg-danger-50 text-danger ring-danger/25",
  gray: "bg-icy text-muted ring-line-strong",
  blue: "bg-blue-50 text-blue ring-blue/20",
  navy: "bg-navy text-white ring-navy",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const BTN = {
  primary: "bg-blue text-white shadow-[0_6px_16px_-8px_rgba(23,107,135,0.8)] hover:bg-blue-600",
  navy: "bg-navy text-white hover:bg-navy-800",
  secondary: "border border-line-strong bg-white text-navy hover:border-blue hover:text-blue",
  ghost: "text-blue hover:bg-blue-50",
  danger: "border border-danger/30 bg-white text-danger hover:bg-danger-50",
};
export type ButtonVariant = keyof typeof BTN;

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${BTN[variant]} ${extra}`;
}

export function ButtonLink({ variant = "primary", className = "", ...p }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...p} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-navy">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-navy placeholder:text-faint outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/10";

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

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue">{children}</p>;
}

export function PageTitle({ title, subtitle, eyebrow }: { title: string; subtitle?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 space-y-2">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{title}</h1>
      {subtitle && <p className="text-muted">{subtitle}</p>}
    </div>
  );
}
