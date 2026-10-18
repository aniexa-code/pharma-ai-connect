import { db } from "./db";

/**
 * Limiteur stocké en base : fonctionne même quand Vercel lance plusieurs instances du site.
 * Renvoie false si la clé a dépassé `max` essais dans la fenêtre.
 */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const count = await db.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
  if (count >= max) return false;
  await db.rateLimitHit.create({ data: { key } });
  // Ménage occasionnel des anciens essais.
  if (Math.random() < 0.02) await db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } });
  return true;
}
