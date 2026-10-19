// Base de test : schéma synchronisé puis données de démonstration rechargées avant chaque fichier.
import { execSync } from "node:child_process";
import { db } from "../src/lib/db";

let ready = false;

export async function resetDatabase() {
  if (!process.env.DATABASE_URL?.includes("test")) throw new Error("Les tests doivent viser une base dont le nom contient « test ».");
  if (!ready) {
    execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });
    ready = true;
  }
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore", env: process.env });
}

export async function fixture() {
  const ganhi = await db.pharmacy.findUniqueOrThrow({ where: { slug: "pharmacie-de-ganhi" } });
  const godomey = await db.pharmacy.findUniqueOrThrow({ where: { slug: "pharmacie-de-godomey" } });
  const product = (slug: string) => db.product.findUniqueOrThrow({ where: { slug } });
  // Disponibilités maîtrisées pour les tests.
  for (const slug of ["paracetamol-500", "ibuprofene-400", "amoxicilline-500", "tramadol-50"]) {
    const p = await product(slug);
    await db.stock.update({
      where: { pharmacyId_productId: { pharmacyId: ganhi.id, productId: p.id } },
      data: { status: "AVAILABLE", source: "PHARMACY", confirmedAt: new Date() },
    });
  }
  return {
    ganhi,
    godomey,
    paracetamol: await product("paracetamol-500"),
    ibuprofene: await product("ibuprofene-400"),
    amoxicilline: await product("amoxicilline-500"),
    tramadol: await product("tramadol-50"),
  };
}

export const guest = {
  contactName: "Grâce",
  phone: "+229 01 96 123 45 67",
  notifyChannel: "SMS" as const,
  slot: "Aujourd'hui 17:00 – 18:00",
};
