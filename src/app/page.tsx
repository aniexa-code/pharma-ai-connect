import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Rechercher", "Trouvez un médicament et les pharmacies proches, avec horaires et fiabilité de la disponibilité."],
  ["Vérifier", "Demandez une confirmation à la pharmacie : vous recevez une référence et la réponse par le canal choisi."],
  ["Commander", "Retrait en pharmacie ou livraison. Nom et téléphone suffisent, aucun mot de passe."],
  ["Suivre", "Un lien sécurisé et des notifications vous tiennent informé jusqu'à la remise."],
];

export default async function Home() {
  const onDuty = await db.pharmacy.findMany({ where: { active: true, onDuty: true }, take: 3 });
  return (
    <div className="space-y-10">
      <section className="space-y-6 pt-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Sans inscription</p>
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Trouvez votre médicament dans une pharmacie proche, et commandez-le en quelques minutes.</h1>
          <p className="max-w-2xl text-muted">Rechercher sans compte, vérifier sans compte, commander sans compte et suivre sa commande sans compte.</p>
        </div>
        <Card><SearchForm /></Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([title, text], i) => (
          <Card key={title} className="space-y-2">
            <p className="text-sm font-semibold text-brand-700">{i + 1}. {title}</p>
            <p className="text-sm text-muted">{text}</p>
          </Card>
        ))}
      </section>

      {onDuty.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pharmacies de garde</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {onDuty.map((p) => (
              <Link key={p.id} href={`/pharmacies/${p.slug}`} className="rounded-2xl border border-line bg-white p-4 hover:border-brand-500">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted">{p.district}, {p.city}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-sm text-muted">
        Vous avez déjà commandé ? <Link href="/suivi" className="font-medium text-brand-700 hover:underline">Retrouvez votre commande</Link> avec votre lien de suivi ou votre référence.
      </p>
    </div>
  );
}
