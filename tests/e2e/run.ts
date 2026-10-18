// Test de bout en bout dans un vrai navigateur : critères d'acceptation du § 9, vus par un nouvel utilisateur.
// Prérequis : `npm run build`. Lance `next start` sur la base de test, puis pilote Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { db } from "../../src/lib/db";
import { resetDatabase } from "../helpers";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.E2E_SCREENSHOTS;
const PASSWORD = process.env.DEMO_PHARMACY_PASSWORD!;

let step = 0;
async function check(name: string, fn: () => Promise<void>) {
  step++;
  await fn();
  console.log(`✓ ${step}. ${name}`);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, "0")}-${name}.png`, fullPage: true });
}

async function pharmacyLogin(page: Page, slug: string) {
  await page.goto(`${BASE}/pharmacie/connexion`);
  await page.fill("input[name=email]", `${slug}@demo.pharma-ai.local`);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/pharmacie`);
}

async function main() {
  await resetDatabase();
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "true" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(BASE)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
    const client = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" })).newPage();
    const pharmacist = await (await browser.newContext()).newPage();

    await check("ouvrir le site sans s'inscrire", async () => {
      const res = await client.goto(BASE);
      assert.equal(res?.status(), 200);
      assert.equal(new URL(client.url()).pathname, "/");
      await shot(client, "accueil");
    });

    await check("rechercher un médicament et consulter les résultats", async () => {
      await client.fill("input[name=q]", "ibuprof");
      await client.fill("input[name=lieu]", "Talangaï");
      await client.click("#search-form button[type=submit]");
      await client.waitForURL(/\/recherche/);
      const card = client.getByTestId("pharmacy-result").filter({ hasText: "Talangaï" });
      await card.waitFor();
      const text = await card.innerText();
      assert.match(text, /Talangaï/);
      assert.match(text, /Disponible|Confirmation nécessaire|Indisponible|Information ancienne/);
      assert.match(text, /Mis à jour il y a|Jamais/);
      assert.match(text, /À \d/);
      assert.match(await client.getByTestId("result-count").innerText(), /correspond/);
      await shot(client, "resultats");
    });

    let requestUrl = "";
    await check("demander une confirmation à une pharmacie, sans compte", async () => {
      await client.getByTestId("pharmacy-result").filter({ hasText: "Talangaï" }).getByRole("link", { name: /Voir/ }).click();
      await client.waitForURL(/\/pharmacies\/pharmacie-de-talangai/);
      await client.getByTestId("availability").first().waitFor();
      await shot(client, "fiche");
      await client.getByRole("link", { name: "Confirmer avec la pharmacie" }).click();
      await client.waitForURL(/\/demande\/nouvelle/);
      await client.fill("input[name=quantity]", "2");
      await client.fill("input[name=contactName]", "Grâce");
      await client.selectOption("select[name=notifyChannel]", "WHATSAPP");
      await client.fill("input[name=phone]", "+242 06 123 45 67");
      await client.click("button[type=submit]");
      await client.waitForURL(/\/demande\/[A-Za-z0-9_-]{43}/);
      requestUrl = client.url().split("?")[0];
      assert.match(await client.getByTestId("request-ref").innerText(), /^VER-/);
      assert.match(await client.getByTestId("request-status").innerText(), /En attente/);
    });

    await check("recevoir une réponse de la pharmacie", async () => {
      await pharmacyLogin(pharmacist, "pharmacie-de-talangai");
      await pharmacist.click("a[href^='/pharmacie/demandes/']");
      await pharmacist.selectOption("select[name=status]", "CONFIRMED");
      await pharmacist.fill("textarea[name=message]", "Oui, 2 boîtes mises de côté.");
      await pharmacist.click("text=Envoyer la réponse");
      await pharmacist.getByText("Réponse envoyée au client.").waitFor();
      await client.goto(requestUrl);
      assert.match(await client.getByTestId("request-status").innerText(), /Disponible/);
      await client.getByText("Oui, 2 boîtes mises de côté.").waitFor();
      await shot(client, "reponse");
    });

    let pickupUrl = "";
    await check("commander sans créer de compte, en retrait, paiement à la remise", async () => {
      await client.click("text=Commander maintenant");
      await client.waitForURL(/\/commander/);
      assert.equal(await client.locator("input[type=password]").count(), 0, "aucun mot de passe demandé");
      await client.fill("input[name=contactName]", "Grâce");
      await client.fill("input[name=phone]", "+242 06 123 45 67");
      await client.check("input[name=paymentMethod][value=CASH]");
      await shot(client, "commande");
      await client.click("text=Confirmer la demande");
      await client.waitForURL(/\/suivi\/[A-Za-z0-9_-]{43}\?nouvelle=1/);
      pickupUrl = client.url().split("?")[0];
      assert.match(await client.getByTestId("order-ref").innerText(), /^CMD-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      assert.match(await client.getByTestId("handover-code").innerText(), /^\d{6}$/);
      await shot(client, "confirmation");
    });

    await check("refuser la création de compte sans perdre l'accès à sa commande", async () => {
      const prompt = client.getByTestId("account-prompt");
      await prompt.getByText("Votre commande est enregistrée !").waitFor();
      await prompt.getByRole("button", { name: "Continuer sans compte" }).click();
      await client.getByText("vous continuez sans compte").waitFor();
      const res = await client.goto(pickupUrl);
      assert.equal(res?.status(), 200);
      assert.match(await client.getByTestId("order-status").innerText(), /attente de confirmation/);
      assert.match(await client.getByTestId("timeline").innerText(), /Demande envoyée[\s\S]*Pharmacie contactée[\s\S]*Terminée/);
    });

    const ref = await client.getByTestId("order-ref").innerText();
    await check("personne ne peut consulter la commande avec son seul numéro", async () => {
      const outsider = await (await browser.newContext()).newPage();
      for (const path of [`/suivi/${ref}`, `/suivi/${ref.toLowerCase()}`, `/suivi/${"A".repeat(43)}`, `/demande/${ref}`]) {
        const res = await outsider.goto(BASE + path);
        assert.equal(res?.status(), 404, path);
        assert.ok(!(await outsider.content()).includes("Grâce"), "aucune donnée personnelle affichée");
      }
      await outsider.goto(`${BASE}/suivi`);
      await outsider.fill("input[name=ref]", ref);
      await outsider.fill("input[name=phone]", "+242 06 000 00 00");
      await outsider.click("button[type=submit]");
      await outsider.getByText("Si ces informations correspondent").waitFor();
      assert.equal(await outsider.getByTestId("demo-code").count(), 0, "aucun code émis pour un mauvais numéro");
      await outsider.fill("input[name=code]", "123456");
      await outsider.click("button[type=submit]");
      await outsider.getByText("Code invalide ou expiré.").waitFor();
      await outsider.context().close();
    });

    let deliveryUrl = "";
    await check("choisir la livraison et payer en ligne (Mobile Money)", async () => {
      await client.goto(`${BASE}/pharmacies/pharmacie-du-plateau`);
      const para = await db.product.findUniqueOrThrow({ where: { slug: "sro" } });
      await client.fill(`input[name=q_${para.id}]`, "3");
      await client.click("text=Commander la sélection");
      await client.waitForURL(/\/commander/);
      await client.locator("label", { hasText: "Livraison" }).first().click();
      await client.fill("input[name=deliveryAddress]", "Rue Mbochis, portail bleu, Poto-Poto");
      await client.fill("input[name=contactName]", "Paul");
      await client.selectOption("select[name=notifyChannel]", "LINK");
      await client.fill("input[name=phone]", "+242 05 765 43 21");
      await client.check("input[name=paymentMethod][value=MOBILE_MONEY]");
      await client.click("text=Confirmer la demande");
      await client.waitForURL(/\/paiement/);
      await client.getByRole("button", { name: "Simuler un échec" }).click();
      await client.getByText("Dernière tentative : échoué").waitFor();
      await client.getByRole("button", { name: "Mobile Money" }).click();
      await client.waitForURL(/\/paiement$/);
      await client.getByRole("button", { name: /^Payer/ }).click();
      await client.waitForURL(/\?paye=1/);
      deliveryUrl = client.url().split("?")[0];
      assert.equal(await client.getByTestId("payment-status").innerText(), "Payé");
    });

    await check("suivre la livraison et recevoir les notifications nécessaires", async () => {
      const code = await client.getByTestId("handover-code").innerText();
      const dref = await client.getByTestId("order-ref").innerText();
      await pharmacyLogin(pharmacist, "pharmacie-du-plateau");
      await pharmacist.click(`text=${dref}`);
      const advance = async (label: string) => {
        await pharmacist.getByRole("button", { name: `→ ${label}` }).click();
        await pharmacist.getByText(label).first().waitFor();
        await pharmacist.waitForLoadState("networkidle");
      };
      await advance("Confirmée par la pharmacie");

      // Centre de livraison : le livreur voit la zone, accepte, récupère, livre avec le code du client.
      const courier = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await courier.goto(`${BASE}/livreur/connexion`);
      await courier.fill("input[name=email]", "livreur@demo.pharma-ai.local");
      await courier.fill("input[name=password]", PASSWORD);
      await courier.click("button[type=submit]");
      await courier.waitForURL(`${BASE}/livreur`);
      const mission = courier.getByTestId("open-mission").first();
      assert.match(await mission.innerText(), /Zone client : Poto-Poto/);
      assert.ok(!(await mission.innerText()).includes("portail bleu"), "adresse exacte masquée avant acceptation");
      await shot(courier, "livreur-missions");
      await mission.getByRole("button", { name: "Accepter" }).click();
      const mine = courier.getByTestId("my-mission");
      await mine.getByText("portail bleu").waitFor();
      await mine.getByRole("button", { name: "Commande récupérée" }).click();
      await mine.getByRole("button", { name: "Démarrer la livraison" }).click();
      await mine.locator("input[name=code]").fill("000001");
      await mine.getByRole("button", { name: "Valider la livraison" }).click();
      await mine.getByText("Code incorrect.").waitFor();
      await shot(courier, "livreur-mission");
      await mine.locator("input[name=code]").fill(code);
      await mine.getByRole("button", { name: "Valider la livraison" }).click();
      await courier.getByTestId("my-mission").waitFor({ state: "detached" });
      await courier.context().close();

      await client.goto(deliveryUrl);
      assert.match(await client.getByTestId("order-status").innerText(), /Livrée/);
      const notes = await client.getByTestId("notifications").innerText();
      for (const t of ["enregistrée", "Paiement reçu", "a échoué", "confirmée", "livreur (Jonas (démo))", "récupéré", "en cours de livraison", "a été livrée"])
        assert.ok(notes.includes(t), `notification « ${t} »`);
      await shot(client, "suivi-livree");
    });

    await check("le tableau de bord pharmacie affiche l'activité du jour", async () => {
      await pharmacist.goto(`${BASE}/pharmacie`);
      const kpis = await pharmacist.getByTestId("kpis").innerText();
      assert.match(kpis, /commandes/);
      await shot(pharmacist, "pharmacie");
    });

    await check("créer un compte plus tard et rattacher la commande après vérification", async () => {
      await client.goto(`${BASE}/compte/inscription`);
      await client.fill("input[name=name]", "Grâce");
      await client.fill("input[name=email]", "grace@example.com");
      await client.fill("input[name=password]", "motdepasse1");
      await client.check("input[name=consent]");
      await client.click("button[type=submit]");
      await client.waitForURL(`${BASE}/compte`);
      await client.click("text=Rattacher une commande");
      await client.fill("input[name=ref]", ref);
      await client.fill("input[name=phone]", "+242061234567");
      await client.click("button[type=submit]");
      const demo = await client.locator("strong.font-mono").innerText();
      await client.fill("input[name=code]", demo);
      await client.click("button[type=submit]");
      await client.waitForURL(/\/compte\?rattachee=1/);
      await client.getByText(ref).waitFor();
      await shot(client, "compte");
    });

    await browser.close();
    console.log(`\nTous les critères d'acceptation passent (${step} étapes).`);
  } finally {
    server.kill();
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
