import { LocateButton, SubmitButton } from "./client";
import { Input, Select } from "./ui";

export function SearchForm({ q = "", lieu = "", rayon = "5", lat = "", lng = "" }: { q?: string; lieu?: string; rayon?: string; lat?: string; lng?: string }) {
  return (
    <form id="search-form" action="/recherche" method="get" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Médicament (ex. paracétamol)" aria-label="Médicament recherché" />
        <Input name="lieu" defaultValue={lieu} placeholder="Ville ou quartier (ex. Poto-Poto)" aria-label="Ville ou quartier" />
        <Select name="rayon" defaultValue={rayon} aria-label="Rayon de recherche">
          {["1", "3", "5", "10", "20"].map((r) => (
            <option key={r} value={r}>{r} km</option>
          ))}
        </Select>
      </div>
      <input type="hidden" name="lat" defaultValue={lat} />
      <input type="hidden" name="lng" defaultValue={lng} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LocateButton />
        <SubmitButton>Rechercher</SubmitButton>
      </div>
    </form>
  );
}
