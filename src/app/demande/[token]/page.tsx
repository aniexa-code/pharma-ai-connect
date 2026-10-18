import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/client";
import { NotificationList, Thread } from "@/components/Thread";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { ContactLinks } from "@/components/ContactLinks";
import { formatMoney } from "@/lib/config";
import { REQUEST_STATUS_LABEL, requestByToken, requestUrl } from "@/lib/services/requests";
import { ReplyForm } from "./ReplyForm";

export const metadata: Metadata = { title: "Votre demande", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RequestPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ nouvelle?: string }> }) {
  const { token } = await params;
  const { nouvelle } = await searchParams;
  const r = await requestByToken(token);
  if (!r) notFound();
  const tone = r.status === "CONFIRMED" ? "green" : r.status === "UNAVAILABLE" ? "red" : r.status === "PENDING" ? "amber" : "blue";
  const canOrder = r.status === "CONFIRMED" && r.product && r.product.regulation !== "RESTRICTED";
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {nouvelle && (
        <Alert tone="green">
          Demande envoyée. Gardez cette page ou le lien reçu : c'est ici que s'affichera la réponse de la pharmacie.
        </Alert>
      )}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">Référence <strong className="font-mono text-ink" data-testid="request-ref">{r.publicRef}</strong></p>
          <Badge tone={tone}><span data-testid="request-status">{REQUEST_STATUS_LABEL[r.status]}</span></Badge>
        </div>
        <h1 className="text-xl font-bold">
          {r.kind === "VERIFICATION" ? `${r.product?.name} ${r.product?.strength ?? ""} × ${r.quantity}` : "Message à la pharmacie"}
        </h1>
        <p className="text-sm text-muted">{r.pharmacy.name} · {r.pharmacy.address}, {r.pharmacy.district}</p>
        <ContactLinks phone={r.pharmacy.phone} whatsapp={r.pharmacy.whatsapp} />
        {canOrder && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 p-3">
            <span className="text-sm">Disponible{r.stock?.price ? ` à ${formatMoney(r.stock.price)} l'unité` : ""}.</span>
            <ButtonLink href={`/commander?pharmacie=${r.pharmacy.slug}&p=${r.product!.id}:${r.quantity}`}>Commander maintenant</ButtonLink>
          </div>
        )}
        <CopyButton text={requestUrl(token)} label="Copier le lien de cette demande" />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Échanges avec la pharmacie</h2>
        <Thread messages={r.messages} />
        {r.status !== "CLOSED" && <ReplyForm token={token} />}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Notifications</h2>
        <NotificationList items={r.notifications} />
      </Card>
    </div>
  );
}
