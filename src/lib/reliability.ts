// Niveau de fiabilité d'une disponibilité : dépend de qui l'a déclarée et de son ancienneté.
export type Reliability = { level: "HIGH" | "MEDIUM" | "LOW"; label: string; hint: string };

export function reliability(
  stock: { status: string; source: string; confirmedAt: Date | null } | null,
  now = new Date(),
): Reliability {
  if (!stock || stock.status === "UNKNOWN" || !stock.confirmedAt) {
    return { level: "LOW", label: "À vérifier", hint: "Aucune confirmation récente : demandez une vérification." };
  }
  const ageH = (now.getTime() - stock.confirmedAt.getTime()) / 3600_000;
  if (stock.source === "PHARMACY" && ageH <= 6) {
    return { level: "HIGH", label: "Fiable", hint: "Confirmée par la pharmacie il y a moins de 6 h." };
  }
  if ((stock.source === "PHARMACY" || stock.source === "IMPORT") && ageH <= 48) {
    return { level: "MEDIUM", label: "Probable", hint: "Information de moins de 48 h, à confirmer si c'est urgent." };
  }
  return { level: "LOW", label: "À vérifier", hint: "Information ancienne ou estimée : demandez une vérification." };
}

export const STOCK_LABEL: Record<string, string> = {
  AVAILABLE: "Disponible",
  LOW: "Stock faible",
  OUT: "Indisponible",
  UNKNOWN: "Inconnue",
};
