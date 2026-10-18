import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { getCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { RequestForm } from "./RequestForm";

export const metadata: Metadata = { title: "Demande à une pharmacie" };
export const dynamic = "force-dynamic";

export default async function NewRequest({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const pharmacy = sp.pharmacie ? await db.pharmacy.findFirst({ where: { slug: sp.pharmacie, active: true } }) : null;
  if (!pharmacy) notFound();
  const product = sp.produit ? await db.product.findUnique({ where: { slug: sp.produit } }) : null;
  const kind = product && sp.type !== "question" ? "VERIFICATION" : "QUESTION";
  const c = await getCustomer();
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title={kind === "VERIFICATION" ? "Demander une vérification" : "Écrire à la pharmacie"}
        subtitle={kind === "VERIFICATION" ? `${product!.name} ${product!.strength ?? ""} chez ${pharmacy.name}` : pharmacy.name}
      />
      <Card>
        <RequestForm kind={kind} pharmacyId={pharmacy.id} productId={product?.id} defaults={{ name: c?.name, phone: c?.phone ?? undefined, email: c?.email }} />
      </Card>
    </div>
  );
}
