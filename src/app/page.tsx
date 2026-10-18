import Link from "next/link";
import { Icon, type IconName } from "@/components/brand";
import { FloatingMeds, HeroNetwork } from "@/components/HeroArt";
import { PharmacyMapList } from "@/components/NetworkMap";
import { SearchForm } from "@/components/SearchForm";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { toMapItem } from "@/lib/map-items";
import { lastStockUpdates } from "@/lib/services/pharmacies";
import { resolvePlace, searchPharmacies } from "@/lib/services/search";

export const dynamic = "force-dynamic";

const SERVICES: { title: string; text: string; icon: IconName }[] = [
  { title: "Trouver", text: "Trouvez les pharmacies proches de vous.", icon: "pin" },
  { title: "Vérifier", text: "Vérifiez la disponibilité avant de vous déplacer.", icon: "check" },
  { title: "Commander", text: "Contactez la pharmacie et préparez votre commande.", icon: "bag" },
  { title: "Recevoir", text: "Retirez votre commande ou faites-la livrer.", icon: "box" },
];

const SUGGESTIONS = ["Paracétamol", "Sels de réhydratation", "Test paludisme", "Vitamine C"];

export default async function Home() {
  const center = await resolvePlace("Brazzaville");
  const nearby = (await searchPharmacies({ point: center, radiusKm: 50 })).slice(0, 5);
  const updates = await lastStockUpdates(nearby.map((r) => r.pharmacy.id));
  const items = nearby.map((r) => toMapItem(r, { lastUpdate: updates.get(r.pharmacy.id) }));

  return (
    <div className="space-y-20">
      <section className="tech-grid relative -mx-4 -mt-8 overflow-hidden px-4 pb-14 pt-14 sm:pt-20">
        <HeroNetwork />
        <FloatingMeds />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-icy" />
        <div className="relative mx-auto max-w-4xl space-y-7 text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-3 py-1 text-xs font-bold text-navy backdrop-blur">
            <span className="relative inline-flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-turq animate-pulse-ring" /><span className="relative h-2 w-2 rounded-full bg-turq" /></span>
            Réseau de pharmacies connecté en temps réel
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-navy sm:text-6xl">
            Votre médicament,<br />
            <span className="text-blue">au bon endroit.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted sm:text-lg">
            Trouvez une pharmacie, vérifiez la disponibilité et choisissez comment récupérer votre médicament.
          </p>
          <div className="text-left"><SearchForm /></div>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <Link key={s} href={`/recherche?q=${encodeURIComponent(s)}`} className="rounded-full border border-line bg-white/80 px-3 py-1.5 text-xs font-semibold text-navy/80 backdrop-blur hover:border-blue hover:text-blue">
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="comment-ca-marche" className="scroll-mt-24 space-y-8">
        <div className="space-y-2 text-center">
          <Eyebrow>Comment ça marche</Eyebrow>
          <h2 className="text-2xl font-extrabold text-navy sm:text-3xl">Quatre étapes, un seul réseau.</h2>
        </div>
        <div className="relative">
          <div className="absolute left-[12%] right-[12%] top-[38px] hidden h-px bg-gradient-to-r from-line via-turq/60 to-line lg:block" />
          <ol className="stagger relative grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {SERVICES.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-white p-4 text-center sm:p-6 transition hover:-translate-y-0.5 hover:border-blue/30">
                <span className="relative mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-navy text-white">
                  <Icon name={s.icon} size={22} />
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-turq text-[10px] font-extrabold text-navy">{i + 1}</span>
                </span>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-navy">{s.title}</p>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Eyebrow>Pharmacies à proximité</Eyebrow>
            <h2 className="text-2xl font-extrabold text-navy sm:text-3xl">Le réseau, en direct.</h2>
          </div>
          <ButtonLink variant="secondary" href="/pharmacies">Toutes les pharmacies <Icon name="arrow" size={16} /></ButtonLink>
        </div>
        <PharmacyMapList items={items} user={center} />
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-10 text-white sm:px-10">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-turq/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-lg space-y-2">
            <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-turq"><Icon name="moon" size={16} /> De garde</p>
            <h2 className="text-2xl font-extrabold">Une urgence la nuit ou le dimanche ?</h2>
            <p className="text-white/70">Les pharmacies de garde, leurs horaires et l'itinéraire, sans créer de compte.</p>
          </div>
          <Link href="/garde" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-turq px-5 font-bold text-navy transition hover:brightness-105">
            Voir les pharmacies de garde <Icon name="arrow" size={16} />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: "shield" as const, title: "Suivi sécurisé", text: "Un lien privé et un code à usage unique : votre numéro de commande seul ne révèle rien." },
          { icon: "bolt" as const, title: "Disponibilités fraîches", text: "Chaque information indique quand elle a été confirmée par la pharmacie." },
          { icon: "user" as const, title: "Compte facultatif", text: "Commandez en invité. Créez un compte seulement si cela vous simplifie la vie." },
        ].map((b) => (
          <div key={b.title} className="flex gap-4 rounded-2xl p-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue"><Icon name={b.icon} /></span>
            <div>
              <p className="font-bold text-navy">{b.title}</p>
              <p className="text-sm text-muted">{b.text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
