"use client";
import { useState } from "react";

const MAX = 2 * 1024 * 1024;
/** Envoi total maximal par formulaire (limite des fonctions serveur). */
export const FORM_MAX_BYTES = 3.8 * 1024 * 1024;

/** Réduit une photo de téléphone (souvent plusieurs Mo) à une image lisible et légère avant l'envoi. */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400_000) return file;
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function DocumentInput({ name, label, required }: { name: string; label: string; required?: boolean }) {
  const [info, setInfo] = useState<{ text: string; bad?: boolean } | null>(null);
  return (
    <label className="block space-y-1.5 rounded-xl border border-dashed border-line bg-icy/60 p-3">
      <span className="text-sm font-semibold text-navy">
        {label} {required ? <span className="text-danger">*</span> : <span className="font-normal text-muted">(facultatif)</span>}
      </span>
      <input
        type="file"
        name={name}
        required={required}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-navy"
        onChange={async (e) => {
          const input = e.currentTarget;
          const f = input.files?.[0];
          if (!f) return setInfo(null);
          const small = await shrink(f);
          if (small !== f) {
            const dt = new DataTransfer();
            dt.items.add(small);
            input.files = dt.files;
          }
          const kb = Math.round(small.size / 1024);
          setInfo(small.size > MAX ? { text: `${kb} Ko : trop lourd (2 Mo au plus).`, bad: true } : { text: `${small.name} · ${kb} Ko` });
        }}
      />
      {info && <span className={`block text-xs ${info.bad ? "font-semibold text-danger" : "text-muted"}`}>{info.text}</span>}
    </label>
  );
}

/** Bloque l'envoi d'un formulaire dont les fichiers dépassent la taille acceptée par le serveur. */
export function checkUploadSize(form: HTMLFormElement) {
  let total = 0;
  for (const el of Array.from(form.querySelectorAll<HTMLInputElement>("input[type=file]"))) for (const f of Array.from(el.files ?? [])) total += f.size;
  return total <= FORM_MAX_BYTES ? null : "Les pièces sont trop lourdes pour un seul envoi : joignez les pièces obligatoires maintenant, vous pourrez ajouter les autres ensuite.";
}
