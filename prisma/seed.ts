// Données de démonstration (pharmacies fictives à Cotonou). Idempotent : relancé à chaque
// déploiement Vercel, il ne modifie jamais ce qui existe déjà (stocks confirmés, commandes...), sauf le
// mot de passe des comptes de démonstration, réaligné sur DEMO_PHARMACY_PASSWORD s'il a changé.
import { PrismaClient, type Regulation, type StockSource, type StockStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const CITY = "Cotonou";
const zones = [
  { name: "Ganhi", city: CITY, lat: 6.3565, lng: 2.4305 },
  { name: "Akpakpa", city: CITY, lat: 6.3625, lng: 2.4505 },
  { name: "Cadjèhoun", city: CITY, lat: 6.3645, lng: 2.3885 },
  { name: "Gbégamey", city: CITY, lat: 6.3715, lng: 2.4045 },
  { name: "Fidjrossè", city: CITY, lat: 6.3645, lng: 2.3475 },
  { name: "Zogbo", city: CITY, lat: 6.3855, lng: 2.4055 },
  { name: "Agla", city: CITY, lat: 6.3845, lng: 2.3805 },
  { name: "Godomey", city: "Abomey-Calavi", lat: 6.4105, lng: 2.3395 },
];

/** Ancienne démonstration (Brazzaville), retirée à la demande du porteur de projet. */
const RETIRED_DEMO = ["pharmacie-du-plateau", "pharmacie-poto-poto", "pharmacie-de-moungali", "pharmacie-bacongo", "pharmacie-de-ouenze", "pharmacie-de-talangai"];

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
  { slug: "pharmacie-de-ganhi", name: "Pharmacie de Ganhi (démo)", district: "Ganhi", city: CITY, address: "Avenue Clozel", lat: 6.3572, lng: 2.4312, hours: week("07:30", "21:00", true, true), delivery: true, fee: 1000, methods: ["CASH", "MOBILE_MONEY", "CARD"], onDuty: false },
  { slug: "pharmacie-akpakpa", name: "Pharmacie Akpakpa (démo)", district: "Akpakpa", city: CITY, address: "Boulevard de la CEN-SAD", lat: 6.3618, lng: 2.4528, hours: week("08:00", "20:00"), delivery: true, fee: 1500, methods: ["CASH", "MOBILE_MONEY"], onDuty: false },
  { slug: "pharmacie-de-cadjehoun", name: "Pharmacie de Cadjèhoun (démo)", district: "Cadjèhoun", city: CITY, address: "Boulevard de France", lat: 6.3641, lng: 2.3893, hours: { ...week("00:00", "24:00"), "6": [["00:00", "24:00"]], "0": [["00:00", "24:00"]] }, delivery: false, fee: 0, methods: ["CASH"], onDuty: true },
  { slug: "pharmacie-gbegamey", name: "Pharmacie Gbégamey (démo)", district: "Gbégamey", city: CITY, address: "Rue du Stade de l'Amitié", lat: 6.3722, lng: 2.4041, hours: week("08:00", "19:30"), delivery: true, fee: 1000, methods: ["CASH", "MOBILE_MONEY"], onDuty: false },
  { slug: "pharmacie-de-fidjrosse", name: "Pharmacie de Fidjrossè (démo)", district: "Fidjrossè", city: CITY, address: "Route des Pêches", lat: 6.3652, lng: 2.3468, hours: week("08:00", "20:00", true, true), delivery: true, fee: 2000, methods: ["CASH", "MOBILE_MONEY", "CARD"], onDuty: false },
  { slug: "pharmacie-de-godomey", name: "Pharmacie de Godomey (démo)", district: "Godomey", city: "Abomey-Calavi", address: "Carrefour Godomey", lat: 6.4098, lng: 2.3402, hours: week("08:00", "19:00"), delivery: false, fee: 0, methods: ["CASH"], onDuty: false },
];

const products: { slug: string; name: string; dci: string; form: string; strength?: string; packaging?: string; category: string; regulation: Regulation; price: number }[] = [
  { slug: "paracetamol-500", name: "Paracétamol", dci: "Paracétamol", form: "Comprimé", strength: "500 mg", category: "Douleur et fièvre", regulation: "OTC", packaging: "Boîte de 16 comprimés", price: 500 },
  { slug: "ibuprofene-400", name: "Ibuprofène", dci: "Ibuprofène", form: "Comprimé", strength: "400 mg", category: "Douleur et fièvre", regulation: "OTC", packaging: "Boîte de 20 comprimés", price: 1200 },
  { slug: "sro", name: "Sels de réhydratation orale", dci: "SRO", form: "Sachet", category: "Digestion", regulation: "OTC", packaging: "Sachet de 20,5 g", price: 300 },
  { slug: "vitamine-c-500", name: "Vitamine C", dci: "Acide ascorbique", form: "Comprimé à croquer", strength: "500 mg", category: "Vitamines", regulation: "OTC", packaging: "Tube de 10 comprimés", price: 1500 },
  { slug: "omeprazole-20", name: "Oméprazole", dci: "Oméprazole", form: "Gélule", strength: "20 mg", category: "Digestion", regulation: "OTC", packaging: "Boîte de 14 gélules", price: 2500 },
  { slug: "loratadine-10", name: "Loratadine", dci: "Loratadine", form: "Comprimé", strength: "10 mg", category: "Allergies", regulation: "OTC", packaging: "Boîte de 10 comprimés", price: 1800 },
  { slug: "sirop-toux", name: "Sirop contre la toux", dci: "Carbocistéine", form: "Sirop", strength: "5 %", category: "Rhume et toux", regulation: "OTC", packaging: "Flacon de 125 ml", price: 2800 },
  { slug: "tdr-paludisme", name: "Test de diagnostic rapide du paludisme", dci: "TDR", form: "Test", category: "Diagnostic", regulation: "OTC", packaging: "1 test", price: 2000 },
  { slug: "artemether-lumefantrine", name: "Artéméther-Luméfantrine", dci: "Artéméther + Luméfantrine", form: "Comprimé", strength: "20/120 mg", category: "Paludisme", regulation: "PRESCRIPTION", packaging: "Boîte de 24 comprimés", price: 3500 },
  { slug: "amoxicilline-500", name: "Amoxicilline", dci: "Amoxicilline", form: "Gélule", strength: "500 mg", category: "Antibiotiques", regulation: "PRESCRIPTION", packaging: "Boîte de 12 gélules", price: 2500 },
  { slug: "metformine-500", name: "Metformine", dci: "Metformine", form: "Comprimé", strength: "500 mg", category: "Diabète", regulation: "PRESCRIPTION", packaging: "Boîte de 30 comprimés", price: 3000 },
  { slug: "amlodipine-5", name: "Amlodipine", dci: "Amlodipine", form: "Comprimé", strength: "5 mg", category: "Tension", regulation: "PRESCRIPTION", packaging: "Boîte de 30 comprimés", price: 3200 },
  { slug: "salbutamol-inhalateur", name: "Salbutamol", dci: "Salbutamol", form: "Inhalateur", strength: "100 µg", category: "Respiration", regulation: "PRESCRIPTION", packaging: "Flacon de 200 doses", price: 4500 },
  { slug: "tramadol-50", name: "Tramadol", dci: "Tramadol", form: "Gélule", strength: "50 mg", category: "Douleur", regulation: "RESTRICTED", packaging: "Boîte de 30 gélules", price: 4000 },
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

/** Champs réglementaires demandés aux pharmacies du Bénin (modifiables ensuite dans l'administration). */
const BJ_PHARMACY_FIELDS = [
  { key: "authorization", label: "N° d'autorisation d'ouverture (Ministère de la Santé / ABMed)", required: true },
  { key: "orderNumber", label: "N° d'inscription du pharmacien titulaire à l'Ordre des pharmaciens du Bénin", required: true },
  { key: "ifu", label: "IFU (Identifiant fiscal unique)", required: true },
  { key: "rccm", label: "N° RCCM", required: false },
];

async function retireOldDemo() {
  const old = await db.pharmacy.findMany({ where: { slug: { in: RETIRED_DEMO } }, select: { id: true } });
  const ids = old.map((p) => p.id);
  if (ids.length) {
    await db.pharmacyRequest.deleteMany({ where: { pharmacyId: { in: ids } } });
    await db.order.deleteMany({ where: { pharmacyId: { in: ids } } });
    await db.pharmacy.deleteMany({ where: { id: { in: ids } } });
  }
  await db.zone.deleteMany({ where: { city: "Brazzaville" } });
}

async function main() {
  await retireOldDemo();
  await db.country.upsert({
    where: { code: "BJ" },
    update: {},
    create: { code: "BJ", name: "Bénin", currency: "XOF", timezone: "Africa/Porto-Novo", dialCode: "+229", defaultCity: CITY, payoutMethods: ["MOBILE_MONEY", "MOOV_MONEY"], pharmacyFields: BJ_PHARMACY_FIELDS },
  });
  for (const z of zones) {
    await db.zone.upsert({ where: { name_city: { name: z.name, city: z.city } }, update: {}, create: { ...z, country: "BJ" } });
  }
  const password = process.env.DEMO_PHARMACY_PASSWORD;
  const productRows = [];
  for (const p of products) {
    const { price: _price, ...data } = p;
    productRows.push(await db.product.upsert({ where: { slug: p.slug }, update: { packaging: data.packaging }, create: data }));
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
        city: ph.city,
        country: "BJ",
        lat: ph.lat,
        lng: ph.lng,
        phone: `+22901900000${i}`,
        whatsapp: `+22901900000${i}`,
        openingHours: ph.hours,
        hoursConfirmedAt: new Date(),
        onDuty: ph.onDuty,
        onDutyUntil: ph.onDuty ? new Date(Date.now() + 365 * 86400_000) : null,
        offersDelivery: ph.delivery,
        deliveryFee: ph.fee,
        paymentMethods: ph.methods,
      },
    });
    // Pharmacies fictives : horaires et garde reconfirmés à chaque déploiement pour que la démo reste vivante.
    await db.pharmacy.update({
      where: { id: pharmacy.id },
      data: { hoursConfirmedAt: new Date(), onDutyUntil: ph.onDuty ? new Date(Date.now() + 365 * 86400_000) : null },
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
      await db.courier.create({ data: { email, name: "Jonas (démo)", phone: "+2290190000099", passwordHash: await bcrypt.hash(password, 10) } });
    } else if (!(await bcrypt.compare(password, existing.passwordHash))) {
      await db.courier.update({ where: { email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    }
    if (existing?.phone.startsWith("+242")) await db.courier.update({ where: { email }, data: { phone: "+2290190000099" } });
  }
  await seedAdmin(password);
  console.log(`Données de démonstration prêtes : ${pharmacies.length} pharmacies, ${products.length} produits.`);
}

/**
 * Compte d'administration : ADMIN_EMAIL + ADMIN_PASSWORD. À défaut, en démonstration seulement,
 * admin@demo.pharma-ai.local avec le mot de passe des comptes de démo.
 */
async function seedAdmin(demoPassword: string | undefined) {
  const email = (process.env.ADMIN_EMAIL || (demoPassword ? "admin@demo.pharma-ai.local" : "")).toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || (process.env.ADMIN_EMAIL ? "" : demoPassword);
  if (!email || !pw) return;
  const existing = await db.adminUser.findUnique({ where: { email } });
  if (!existing) await db.adminUser.create({ data: { email, name: "Administration", passwordHash: await bcrypt.hash(pw, 10) } });
  else if (!(await bcrypt.compare(pw, existing.passwordHash))) await db.adminUser.update({ where: { email }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
