import type { Message, Notification } from "@prisma/client";
import { formatDate } from "./badges";
import { CHANNEL_LABEL } from "@/lib/notify";

export function Thread({ messages, mine = "CUSTOMER" }: { messages: Message[]; mine?: "CUSTOMER" | "PHARMACY" }) {
  if (!messages.length) return <p className="text-sm text-muted">Aucun message pour l'instant.</p>;
  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.author === mine ? "ml-auto bg-brand-50" : "bg-slate-100"}`}>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
          <p className="mt-1 text-xs text-muted">{m.author === "PHARMACY" ? "Pharmacie" : "Client"} · {formatDate(m.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

const N_STATUS: Record<string, string> = { SENT: "envoyé", SIMULATED: "simulé (aucun fournisseur configuré)", FAILED: "échec d'envoi", LINK_ONLY: "visible ici" };

/** Historique des notifications : aussi le canal « lien sécurisé » pour qui n'a donné aucune coordonnée. */
export function NotificationList({ items }: { items: Notification[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2 text-sm" data-testid="notifications">
      {items.map((n) => (
        <li key={n.id} className="rounded-xl border border-line p-3">
          <p className="[overflow-wrap:anywhere]">{n.body}</p>
          <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)} · {CHANNEL_LABEL[n.channel]} · {N_STATUS[n.status] ?? n.status}</p>
        </li>
      ))}
    </ul>
  );
}
