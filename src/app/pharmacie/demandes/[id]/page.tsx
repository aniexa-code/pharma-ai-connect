import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate } from "@/components/badges";
import { Thread } from "@/components/Thread";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { requirePharmacyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHANNEL_LABEL } from "@/lib/notify";
import { REQUEST_STATUS_LABEL } from "@/lib/services/requests";
import { RespondForm } from "../../forms";

export const metadata: Metadata = { title: "Demande", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PharmacyRequest({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePharmacyUser();
  const { id } = await params;
  const r = await db.pharmacyRequest.findFirst({ where: { id, pharmacyId: u.pharmacyId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!r) notFound();
  const stock = r.productId ? await db.stock.findUnique({ where: { pharmacyId_productId: { pharmacyId: u.pharmacyId, productId: r.productId } }, include: { product: true } }) : null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ButtonLink variant="secondary" href="/pharmacie">← Tableau de bord</ButtonLink>
      <PageTitle title={r.publicRef} subtitle={`${REQUEST_STATUS_LABEL[r.status]} · ${formatDate(r.createdAt)}`} />
      <Card className="space-y-2 text-sm">
        {stock && <p className="text-base font-semibold">{stock.product.name} {stock.product.strength} × {r.quantity}</p>}
        <p>Client : {r.contactName} · Canal : {CHANNEL_LABEL[r.notifyChannel]}</p>
        {r.phone && <p>Téléphone : <a href={`tel:${r.phone}`} className="text-brand-700">{r.phone}</a></p>}
        {r.email && <p>E-mail : {r.email}</p>}
      </Card>
      <Card className="space-y-4">
        <Thread messages={r.messages} mine="PHARMACY" />
        <RespondForm requestId={r.id} verification={r.kind === "VERIFICATION"} price={stock?.price} />
      </Card>
    </div>
  );
}
