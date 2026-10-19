import type { Metadata } from "next";
import { formatDate } from "@/components/badges";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../AdminNav";

export const metadata: Metadata = { title: "Réclamations", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Complaints() {
  const a = await requireAdmin();
  const orders = await db.order.findMany({
    where: { customerIssue: { not: null } },
    include: { pharmacy: true },
    orderBy: [{ customerClosedAt: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }],
    take: 100,
  });
  return (
    <div className="mx-auto max-w-4xl">
      <AdminNav name={a.name} current="/admin/reclamations" />
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Réclamations</h1>
      <p className="mb-4 text-sm text-muted">Problèmes signalés par les clients à la réception. Une commande signalée reste ouverte tant que le client ne l'a pas clôturée.</p>
      <Card className="p-0" data-testid="complaints">
        {orders.length === 0 ? (
          <p className="p-5 text-sm text-muted">Aucune réclamation.</p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-navy">{o.publicRef}</span>
                  <span className="text-muted">{o.pharmacy.name} · {o.contactName} · {formatDate(o.updatedAt)}</span>
                  <Badge tone={o.customerClosedAt ? "green" : "amber"}>{o.customerClosedAt ? "Résolue" : "Ouverte"}</Badge>
                </div>
                <p className="text-navy">{o.customerIssue}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
