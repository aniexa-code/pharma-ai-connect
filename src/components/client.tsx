"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export function SubmitButton({ children, variant = "primary", className = "", name, value }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, className)}>
      {pending ? "Un instant…" : children}
    </button>
  );
}

/** Position facultative : le visiteur peut toujours saisir un lieu à la place. */
export function LocateButton() {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "denied">("idle");
  const locate = () => {
    if (!navigator.geolocation) return setState("denied");
    setState("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const form = document.getElementById("search-form") as HTMLFormElement | null;
        if (!form) return;
        (form.elements.namedItem("lat") as HTMLInputElement).value = pos.coords.latitude.toFixed(5);
        (form.elements.namedItem("lng") as HTMLInputElement).value = pos.coords.longitude.toFixed(5);
        (form.elements.namedItem("lieu") as HTMLInputElement).value = "Ma position";
        setState("ok");
      },
      () => setState("denied"),
      { timeout: 10000, maximumAge: 300000 },
    );
  };
  return (
    <button type="button" onClick={locate} className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
      {state === "busy" ? "Localisation…" : state === "ok" ? "Position utilisée ✓" : state === "denied" ? "Position indisponible : saisissez un lieu" : "Utiliser ma position (facultatif)"}
    </button>
  );
}

export function CopyButton({ text, label = "Copier le lien" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary")}
      onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true))}
    >
      {done ? "Copié ✓" : label}
    </button>
  );
}

/** Proposition de compte après commande : refuser ne change rien au service. */
export function AccountPrompt({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"ask" | "form" | "dismissed">("ask");
  if (state === "dismissed")
    return <p className="text-sm text-muted">C'est noté : vous continuez sans compte. Gardez simplement votre lien de suivi.</p>;
  return (
    <div className="space-y-4" data-testid="account-prompt">
      <p>
        <strong>Votre commande est enregistrée !</strong> Vous pouvez continuer sans compte. Créez un compte gratuitement si vous souhaitez
        retrouver facilement vos commandes, enregistrer vos pharmacies favorites et simplifier vos prochaines recherches.
      </p>
      {state === "ask" ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass("primary")} onClick={() => setState("form")}>Créer mon compte</button>
          <button type="button" className={buttonClass("secondary")} onClick={() => setState("dismissed")}>Continuer sans compte</button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
