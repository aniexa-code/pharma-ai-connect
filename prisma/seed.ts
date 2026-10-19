// Données de démonstration (pharmacies fictives à Brazzaville). Idempotent : relancé à chaque
// déploiement Vercel, il ne modifie jamais ce qui existe déjà (stocks confirmés, commandes...), sauf le
// mot de passe des comptes de démonstration, réaligné sur DEMO_PHARMACY_PASSWORD s'il a changé.
import { PrismaClient, type Regulation, type StockSource, type StockStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const zones = [
  { name: "Plateau", lat: -4.27, lng: 15.283 },
  { name: "Poto-Poto", lat: -4.258, lng: 15.287 },
  { name: "Moungali", lat: -4.248, lng: 15.27 },
  { name: "Bacongo", lat: -4.287, lng: 15.258 },
  { name: "Makélékélé", lat: -4.295, lng: 15.235 },
  { name: "Ouenzé", lat: -4.235, lng: 15.28 },
  { name: "Talangaï", lat: -4.215, lng: 15.285 },
  { name: "Mfilou", lat: -4.26, lng: 15.21 },
];

const week = (open: string, close: string, sat = true, sun = false) => ({
  "1": [[open, close]],
  "2": [[open, close]],
  "3": [[open, close]],
  "4": [[open, close]],
  "5": [[open, close]],
  "6": sat ? [[open, "14:00"]] : [],
  "0": sun ? [["09:00", "13:00"]] : [],
});

const pharmacies = [
  { slug: "pharmacie-du-plateau", name: "Pharmacie du Plateau (démo)", district: "Plateau", address: "Avenue de la Paix", lat: -4.2712, lng: 15.2841, hours: week("07:30", "21:00", true, true), delivery: true, fee: 1000, methods: ["CASH", "MOBILE_MONEY", "CARD"], onDuty: false },
  { slug: "pharmacie-poto-poto", name: "Pharmacie Poto-Poto (démo)", district: "Poto-Poto", address: "Rue Mbochis", lat: -4.2575, lng: 15.2862, hours: week("08:00", "20:00"), delivery: true, fee: 1500, methods: ["CASH", "MOBILE_MONEY"], onDuty: false },
  { slug: "pharmacie-de-moungali", name: "Pharmacie de Moungali (démo)", district: "Moungali", address: "Avenue des Trois Martyrs", lat: -4.2491, lng: 15.2712, hours: { ...week("00:00", "24:00"), "6": [["00:00", "24:00"]], "0": [["00:00", "24:00"]] }, delivery: false, fee: 0, methods: ["CASH"], onDuty: true },
  { slug: "pharmacie-bacongo", name: "Pharmacie Bacongo (démo)", district: "Bacongo", address: "Avenue Matsoua", lat: -4.2865, lng: 15.2571, hours: week("08:00", "19:30"), delivery: true, fee: 1000, methods: ["CASH", "MOBILE_MONEY"], onDuty: false },
  { slug: "pharmacie-de-ouenze", name: "Pharmacie de Ouenzé (démo)", district: "Ouenzé", address: "Avenue de la Tsiémé", lat: -4.2361, lng: 15.2793, hours: week("08:00", "20:00", true, true), delivery: true, fee: 2000, methods: ["CASH", "MOBILE_MONEY", "CARD"], onDuty: false },
  { slug: "pharmacie-de-talangai", name: "Pharmacie de Talangaï (démo)", district: "Talangaï", address: "Route du Nord", lat: -4.2148, lng: 15.2861, hours: week("08:00", "19:00"), delivery: false, fee: 0, methods: ["CASH"], onDuty: false },
];

const products: { slug: string; name: string; dci: string; form: string; strength?: string; category: string; regulation: Regulation; price: number }[] = [
  { slug: "paracetamol-500", name: "Paracétamol", dci: "Paracétamol", form: "Comprimé", strength: "500 mg", category: "Douleur et fièvre", regulation: "OTC", price: 500 },
  { slug: "ibuprofene-400", name: "Ibuprofène", dci: "Ibuprofène", form: "Comprimé", strength: "400 mg", category: "Douleur et fièvre", regulation: "OTC", price: 1200 },
  { slug: "sro", name: "Sels de réhydratation orale", dci: "SRO", form: "Sachet", category: "Digestion", regulation: "OTC", price: 300 },
  { slug: "vitamine-c-500", name: "Vitamine C", dci: "Acide ascorbique", form: "Comprimé à croquer", strength: "500 mg", category: "Vitamines", regulation: "OTC", price: 1500 },
  { slug: "omeprazole-20", name: "Oméprazole", dci: "Oméprazole", form: "Gélule", strength: "20 mg", category: "Digestion", regulation: "OTC", price: 2500 },
  { slug: "loratadine-10", name: "Loratadine", dci: "Loratadine", form: "Comprimé", strength: "10 mg", category: "Allergies", regulation: "OTC", price: 1800 },
  { slug: "sirop-toux", name: "Sirop contre la toux", dci: "Carbocistéine", form: "Sirop", strength: "5 %", category: "Rhume et toux", regulation: "OTC", price: 2800 },
  { slug: "tdr-paludisme", name: "Test de diagnostic rapide du paludisme", dci: "TDR", form: "Test", category: "Diagnostic", regulation: "OTC", price: 2000 },
  { slug: "artemether-lumefantrine", name: "Artéméther-Luméfantrine", dci: "Artéméther + Luméfantrine", form: "Comprimé", strength: "20/120 mg", category: "Paludisme", regulation: "PRESCRIPTION", price: 3500 },
  { slug: "amoxicilline-500", name: "Amoxicilline", dci: "Amoxicilline", form: "Gélule", strength: "500 mg", category: "Antibiotiques", regulation: "PRESCRIPTION", price: 2500 },
  { slug: "metformine-500", name: "Metformine", dci: "Metformine", form: "Comprimé", strength: "500 mg", category: "Diabète", regulation: "PRESCRIPTION", price: 3000 },
  { slug: "amlodipine-5", name: "Amlodipine", dci: "Amlodipine", form: "Comprimé", strength: "5 mg", category: "Tension", regulation: "PRESCRIPTION", price: 3200 },
  { slug: "salbutamol-inhalateur", name: "Salbutamol", dci: "Salbutamol", form: "Inhalateur", strength: "100 µg", category: "Respiration", regulation: "PRESCRIPTION", price: 4500 },
  { slug: "tramadol-50", name: "Tramadol", dci: "Tramadol", form: "Gélule", strength: "50 mg", category: "Douleur", regulation: "RESTRICTED", price: 4000 },
];

// Disponibilités variées pour montrer les niveaux de fiabilité : [statut, source, ancienneté en heures | null]
const PATTERNS: [StockStatus, StockSource, number | null][] = [
  ["AVAILABLE", "PHARMACY", 1],
  ["AVAILABLE", "PHARMACY", 20],
  ["LOW", "PHARMACY", 3],
  ["AVAILABLE", "IMPORT", 30],
  ["UNKNOWN", "ESTIMATE", null],
  ["AVAILABLE", "ESTIMATE", 120],
  ["OUT", "PHARMACY", 10],
];

async function main() {
  for (const z of zones) {
    await db.zone.upsert({ where: { name_city: { name: z.name, city: "Brazzaville" } }, update: {}, create: { ...z, city: "Brazzaville" } });
  }
  const password = process.env.DEMO_PHARMACY_PASSWORD;
  const productRows = [];
  for (const p of products) {
    const { price: _price, ...data } = p;
    productRows.push(await db.product.upsert({ where: { slug: p.slug }, update: {}, create: data }));
  }
  let i = 0;
  for (const ph of pharmacies) {
    const pharmacy = await db.pharmacy.upsert({
      where: { slug: ph.slug },
      update: {},
      create: {
        slug: ph.slug,
        name: ph.name,
        address: ph.address,
        district: ph.district,
        city: "Brazzaville",
        lat: ph.lat,
        lng: ph.lng,
        phone: `+24206${String(5550000 + i * 111).slice(0, 7)}`,
        whatsapp: `+24206${String(5550000 + i * 111).slice(0, 7)}`,
        openingHours: ph.hours,
        onDuty: ph.onDuty,
        offersDelivery: ph.delivery,
        deliveryFee: ph.fee,
        paymentMethods: ph.methods,
      },
    });
    for (const [j, prod] of productRows.entries()) {
      const [status, source, age] = PATTERNS[(i * 3 + j) % PATTERNS.length];
      const base = products[j].price;
      await db.stock.upsert({
        where: { pharmacyId_productId: { pharmacyId: pharmacy.id, productId: prod.id } },
        update: {},
        create: {
          pharmacyId: pharmacy.id,
          productId: prod.id,
          price: base + ((i * 7 + j * 3) % 4) * 100,
          status,
          source,
          confirmedAt: age === null ? null : new Date(Date.now() - age * 3600_000),
        },
      });
    }
    if (password) {
      const email = `${ph.slug}@demo.pharma-ai.local`;
      const existing = await db.pharmacyUser.findUnique({ where: { email } });
      if (!existing) {
        await db.pharmacyUser.create({ data: { email, name: "Pharmacien (démo)", pharmacyId: pharmacy.id, passwordHash: await bcrypt.hash(password, 10) } });
      } else if (!(await bcrypt.compare(password, existing.passwordHash))) {
        await db.pharmacyUser.update({ where: { email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
      }
    }
    i++;
  }
  if (password) {
    const email = "livreur@demo.pharma-ai.local";
    const existing = await db.courier.findUnique({ where: { email } });
    if (!existing) {
      await db.courier.create({ data: { email, name: "Jonas (démo)", phone: "+242065550999", passwordHash: await bcrypt.hash(password, 10) } });
    } else if (!(await bcrypt.compare(password, existing.passwordHash))) {
      await db.courier.update({ where: { email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    }
  }
  console.log(`Données de démonstration prêtes : ${pharmacies.length} pharmacies, ${products.length} produits.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
