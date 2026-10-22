import { db } from "./db";
import { ServiceError } from "./errors";

/**
 * Limiteur stocké en base : fonctionne même quand Vercel lance plusieurs instances du site.
 * Renvoie false si la clé a dépassé `max` essais dans la fenêtre glissante `windowMs`.
 *
 * L'essai est enregistré AVANT d'être compté : deux requêtes simultanées se voient l'une l'autre,
 * si bien qu'une rafale parallèle ne peut pas passer entre le comptage et l'écriture. Les essais
 * refusés comptent aussi : tant qu'un robot insiste, il reste bloqué.
 */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const k = key.slice(0, 200);
  await db.rateLimitHit.create({ data: { key: k } });
  const count = await db.rateLimitHit.count({ where: { key: k, createdAt: { gte: since } } });
  // Ménage occasionnel des anciens essais.
  if (Math.random() < 0.02) await db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } });
  return count <= max;
}

/** Même contrôle, qui lève directement l'erreur à afficher. */
export async function enforceRateLimit(key: string, max: number, windowMs: number, message = "Trop d'essais. Réessayez dans quelques minutes.") {
  if (!(await rateLimit(key, max, windowMs))) throw new ServiceError("RATE", message);
}
