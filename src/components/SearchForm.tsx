import { Icon } from "./brand";
import { LocateButton, SubmitButton } from "./client";

/** La barre de recherche : l'élément le plus important de l'interface. */
export function SearchForm({ q = "", lieu = "", rayon = "5", lat = "", lng = "", size = "lg", hidden = {} }: { q?: string; lieu?: string; rayon?: string; lat?: string; lng?: string; size?: "lg" | "md"; hidden?: Record<string, string> }) {
  const big = size === "lg";
  return (
    <form id="search-form" action="/recherche" method="get" className="w-full">
      <div className={`flex flex-col gap-2 rounded-[22px] border border-line bg-white p-2 shadow-[0_20px_50px_-24px_rgba(16,36,59,0.35)] sm:flex-row sm:items-center ${big ? "sm:p-2.5" : ""}`}>
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-1 focus-within:bg-icy">
          <Icon name="search" size={big ? 22 : 20} className="shrink-0 text-blue" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Quel médicament recherchez-vous ?"
            aria-label="Médicament recherché"
            className={`w-full bg-transparent font-semibold text-navy outline-none placeholder:font-medium placeholder:text-faint ${big ? "min-h-12 text-base sm:text-lg" : "min-h-11"}`}
          />
        </label>
        <span className="hidden h-8 w-px bg-line sm:block" />
        <label className="flex items-center gap-3 rounded-2xl px-3 py-1 focus-within:bg-icy sm:w-[28%]">
          <Icon name="pin" size={20} className="shrink-0 text-blue" />
          <input name="lieu" defaultValue={lieu} placeholder="Ville ou quartier" aria-label="Ville ou quartier" className="min-h-11 w-full bg-transparent font-semibold text-navy outline-none placeholder:font-medium placeholder:text-faint" />
        </label>
        <input type="hidden" name="rayon" defaultValue={rayon} />
        <input type="hidden" name="lat" defaultValue={lat} />
        <input type="hidden" name="lng" defaultValue={lng} />
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <SubmitButton className={`${big ? "min-h-13 px-6 text-[15px]" : ""} rounded-2xl`}>
          <Icon name="search" size={18} className="sm:hidden" />
          Rechercher une pharmacie
        </SubmitButton>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Icon name="shield" size={16} className="text-turq-700" /> Aucun compte nécessaire pour commencer.
        </p>
        <LocateButton />
      </div>
    </form>
  );
}
