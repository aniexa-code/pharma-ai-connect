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
  // Un ancien serveur resté sur le port servirait une version périmée : on s'arrête net.
  const busy = await fetch(BASE).then(() => true, () => false);
  if (busy) throw new Error(`Le port ${PORT} est déjà utilisé : arrêtez l'ancien serveur avant de lancer les tests.`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "true" }, stdio: "ignore", detached: true });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(BASE)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
    // Toute violation de la politique de sécurité (CSP) ou erreur de script fait échouer le test :
    // un script bloqué par erreur casserait le site sans bruit.
    const pageErrors: string[] = [];
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const ctx = await newContext(...args);
      ctx.on("console", (m) => {
        if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) pageErrors.push(m.text());
      });
      ctx.on("weberror", (e) => pageErrors.push(String(e.error())));
      return ctx;
    };
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
      await client.fill("input[name=lieu]", "Godomey");
      await client.click("#search-form button[type=submit]");
      await client.waitForURL(/\/recherche/);
      const card = client.getByTestId("pharmacy-result").filter({ hasText: "Godomey" });
      await card.waitFor();
      const text = await card.innerText();
      assert.match(text, /Godomey/);
      assert.match(text, /Disponible|Confirmation nécessaire|Indisponible|Information ancienne/);
      assert.match(text, /Mis à jour il y a|Jamais/);
      assert.match(text, /À \d/);
      assert.match(await client.getByTestId("result-count").innerText(), /correspond/);
      await shot(client, "resultats");
    });

    await check("zone vide : élargissement proposé, jamais automatique", async () => {
      const visitor = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" })).newPage();
      await visitor.goto(`${BASE}/recherche?lieu=Agla&rayon=1`);
      const panel = visitor.getByTestId("expand-zone");
      await panel.waitFor();
      assert.match(await panel.innerText(), /Nous n'avons trouvé aucune pharmacie correspondant à votre recherche dans votre zone actuelle\. Voulez-vous élargir votre zone de recherche \?/);
      assert.ok(await panel.getByRole("link", { name: "Élargir à 10 km" }).isVisible());
      assert.ok(await panel.getByRole("link", { name: "Modifier ma zone" }).isVisible());
      await shot(visitor, "elargir-zone");
      await panel.getByRole("link", { name: "Élargir à 5 km" }).click();
      await visitor.waitForURL(/rayon=5/);
      await visitor.getByTestId("pharmacy-result").first().waitFor();
      assert.equal(await visitor.getByTestId("expand-zone").count(), 0);
      await visitor.close();
    });

    await check("administration : réglages modifiables et tracés", async () => {
      const admin = await (await browser.newContext()).newPage();
      await admin.goto(`${BASE}/admin`);
      await admin.waitForURL(/\/admin\/connexion/);
      await admin.fill("input[name=email]", "admin@demo.pharma-ai.local");
      await admin.fill("input[name=password]", PASSWORD);
      await admin.click("button[type=submit]");
      await admin.waitForURL(`${BASE}/admin`);
      await admin.goto(`${BASE}/admin/reglages`);
      await admin.fill("input[name='search.hoursMaxAgeDays']", "90");
      await admin.getByRole("button", { name: "Enregistrer les réglages" }).click();
      await admin.getByText("Réglages enregistrés").waitFor();
      await admin.goto(`${BASE}/admin`);
      await admin.getByText("Réglages modifiés").first().waitFor();
      await shot(admin, "admin");
      await admin.close();
    });

    let requestUrl = "";
    await check("demander une confirmation à une pharmacie, sans compte", async () => {
      await client.getByTestId("pharmacy-result").filter({ hasText: "Godomey" }).getByRole("link", { name: /Voir/ }).click();
      await client.waitForURL(/\/pharmacies\/pharmacie-de-godomey/);
      await client.getByTestId("availability").first().waitFor();
      await shot(client, "fiche");
      await client.getByRole("link", { name: "Confirmer avec la pharmacie" }).click();
      await client.waitForURL(/\/demande\/nouvelle/);
      await client.fill("input[name=quantity]", "2");
      await client.fill("input[name=contactName]", "Grâce");
      await client.selectOption("select[name=notifyChannel]", "WHATSAPP");
      await client.fill("input[name=phone]", "+229 01 96 123 45 67");
      await client.click("button[type=submit]");
      await client.waitForURL(/\/demande\/[A-Za-z0-9_-]{43}/);
      requestUrl = client.url().split("?")[0];
      assert.match(await client.getByTestId("request-ref").innerText(), /^VER-/);
      assert.match(await client.getByTestId("request-status").innerText(), /En attente/);
    });

    await check("recevoir une réponse de la pharmacie", async () => {
      await pharmacyLogin(pharmacist, "pharmacie-de-godomey");
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
      await client.fill("input[name=phone]", "+229 01 96 123 45 67");
      await client.check("input[name=paymentMethod][value=CASH]");
      await shot(client, "commande");
      await client.click("text=Envoyer à la pharmacie pour vérification");
      await client.waitForURL(/\/suivi\/[A-Za-z0-9_-]{43}\?nouvelle=1/);
      pickupUrl = client.url().split("?")[0];
      assert.match(await client.getByTestId("order-ref").innerText(), /^CMD-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      assert.match(await client.getByTestId("responsible").innerText(), /La pharmacie vérifie physiquement/);
      assert.equal(await client.getByTestId("handover-code").count(), 0, "pas de code avant la confirmation du client");
      await shot(client, "confirmation");
    });

    await check("refuser la création de compte sans perdre l'accès à sa commande", async () => {
      const prompt = client.getByTestId("account-prompt");
      await prompt.getByText("Votre commande est enregistrée !").waitFor();
      await prompt.getByRole("button", { name: "Continuer sans compte" }).click();
      await client.getByText("vous continuez sans compte").waitFor();
      const res = await client.goto(pickupUrl);
      assert.equal(res?.status(), 200);
      assert.match(await client.getByTestId("order-status").innerText(), /vérification en pharmacie/);
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
      await outsider.fill("input[name=phone]", "+229 01 96 000 00 00");
      await outsider.click("button[type=submit]");
      await outsider.getByText("Si ces informations correspondent").waitFor();
      assert.equal(await outsider.getByTestId("demo-code").count(), 0, "aucun code émis pour un mauvais numéro");
      await outsider.fill("input[name=code]", "123456");
      await outsider.click("button[type=submit]");
      await outsider.getByText("Code invalide ou expiré.").waitFor();
      await outsider.context().close();
    });

    /** La pharmacie vérifie chaque produit en rayon et répond au client. */
    async function verifyInPharmacy(slug: string, orderRef: string) {
      await pharmacyLogin(pharmacist, slug);
      await pharmacist.click(`text=${orderRef}`);
      const form = pharmacist.getByTestId("verify-form");
      await form.waitFor();
      await form.getByRole("button", { name: "Envoyer la réponse au client" }).click();
      await pharmacist.getByText("en attente de la confirmation du client").waitFor();
    }

    await check("la pharmacie vérifie en rayon, puis le client confirme sa commande", async () => {
      await verifyInPharmacy("pharmacie-de-godomey", ref);
      await shot(pharmacist, "verification-pharmacie");
      await client.goto(pickupUrl);
      const card = client.getByTestId("awaiting-customer");
      await card.waitFor();
      assert.match(await card.innerText(), /Disponible/);
      assert.match(await client.getByTestId("responsible").innerText(), /Vous confirmez la commande/);
      await shot(client, "a-confirmer");
      await card.getByRole("button", { name: "Je confirme ma commande" }).click();
      await client.waitForURL(/\?confirmee=1/);
      assert.match(await client.getByTestId("handover-code").innerText(), /^\d{6}$/);
      assert.match(await client.getByTestId("customer-authorization").innerText(), /CONFIRMÉE/);
      assert.match(await client.getByTestId("order-status").innerText(), /Confirmée/);
    });

    let deliveryUrl = "";
    await check("choisir la livraison et payer en ligne (Mobile Money)", async () => {
      await client.goto(`${BASE}/pharmacies/pharmacie-de-ganhi`);
      const para = await db.product.findUniqueOrThrow({ where: { slug: "sro" } });
      await client.fill(`input[name=q_${para.id}]`, "3");
      await client.click("text=Commander la sélection");
      await client.waitForURL(/\/commander/);
      await client.locator("label", { hasText: "Livraison" }).first().click();
      await client.fill("input[name=deliveryAddress]", "Rue 12.054, portail bleu, Agla");
      await client.fill("input[name=contactName]", "Paul");
      await client.selectOption("select[name=notifyChannel]", "LINK");
      await client.fill("input[name=phone]", "+229 01 95 765 43 21");
      await client.check("input[name=paymentMethod][value=MOBILE_MONEY]");
      await client.click("text=Envoyer à la pharmacie pour vérification");
      await client.waitForURL(/\?nouvelle=1/);
      const dref = await client.getByTestId("order-ref").innerText();
      await verifyInPharmacy("pharmacie-de-ganhi", dref);
      await client.reload();
      const card = client.getByTestId("awaiting-customer");
      assert.equal(await card.locator("input[name=fulfillment][value=DELIVERY]").isChecked(), true, "le choix initial du client est repris");
      assert.equal(await card.locator("input[name=deliveryAddress]").inputValue(), "Rue 12.054, portail bleu, Agla");
      assert.equal(await card.locator("input[name=paymentMethod][value=CASH]").count(), 0, "une livraison se paie en ligne");
      await card.getByRole("button", { name: "Je confirme ma commande" }).click();
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
      assert.match(await client.getByTestId("order-status").innerText(), /Confirmée/, "payée : la commande est confirmée et proposée aux livreurs");

      // Centre de livraison : le livreur voit la zone, accepte, récupère, livre avec le code du client.
      const courier = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await courier.goto(`${BASE}/livreur/connexion`);
      await courier.fill("input[name=email]", "livreur@demo.pharma-ai.local");
      await courier.fill("input[name=password]", PASSWORD);
      await courier.click("button[type=submit]");
      await courier.waitForURL(`${BASE}/livreur`);
      const mission = courier.getByTestId("open-mission").first();
      assert.match(await mission.innerText(), /Zone client : Agla/);
      assert.ok(!(await mission.innerText()).includes("portail bleu"), "adresse exacte masquée avant acceptation");
      assert.match(await mission.getByTestId("mission-earning").innerText(), /\d.*FCFA/, "le gain est annoncé avant acceptation");
      await shot(courier, "livreur-missions");
      await mission.getByRole("button", { name: "Accepter" }).click();
      const mine = courier.getByTestId("my-mission");
      await mine.getByText("portail bleu").waitFor();
      await mine.getByRole("button", { name: "Commande récupérée" }).click();
      // Double validation de la remise : la pharmacie confirme avoir remis la commande au livreur.
      await mine.getByTestId("awaiting-handoff").waitFor();
      await pharmacist.goto(`${BASE}/pharmacie`);
      await pharmacist.click(`text=${dref}`);
      await pharmacist.getByRole("button", { name: "Confirmer la remise au livreur" }).click();
      await pharmacist.getByTestId("handed-off").waitFor();
      await courier.reload();
      await mine.getByRole("button", { name: "Démarrer la livraison" }).click();
      await mine.locator("input[name=code]").fill("000001");
      await mine.getByRole("button", { name: "Valider la livraison" }).click();
      await mine.getByText("Code incorrect.").waitFor();
      await shot(courier, "livreur-mission");
      await mine.locator("input[name=code]").fill(code);
      await mine.getByRole("button", { name: "Valider la livraison" }).click();
      await courier.getByTestId("my-mission").waitFor({ state: "detached" });
      // Gains : crédités à la livraison, retirables au-delà du seuil, payés sur preuve par l'administration.
      await courier.getByTestId("balance-link").click();
      const earned = await db.ledgerEntry.findFirstOrThrow({ where: { account: "COURIER_EARNING" } });
      assert.equal((await courier.getByTestId("balance").innerText()).replace(/\D/g, ""), String(earned.amount));
      await shot(courier, "livreur-gains");
      await courier.getByTestId("payout-form").getByRole("button", { name: "Demander le paiement" }).click();
      await courier.getByText(/en cours de traitement/).waitFor();
      await courier.context().close();
      const fin = await (await browser.newContext()).newPage();
      await fin.goto(`${BASE}/admin/connexion`);
      await fin.fill("input[name=email]", "admin@demo.pharma-ai.local");
      await fin.fill("input[name=password]", PASSWORD);
      await fin.click("button[type=submit]");
      await fin.waitForURL(`${BASE}/admin`);
      await fin.goto(`${BASE}/admin/finances`);
      const payout = fin.getByTestId("payout-decision");
      await payout.locator("input[name=providerRef]").fill("MTN-2026-0042");
      await payout.getByRole("button", { name: "Marquer payé" }).click();
      await fin.getByText("Aucune demande en attente.").waitFor();
      assert.equal((await db.payoutRequest.findFirstOrThrow()).status, "PAID");
      assert.match(await fin.getByTestId("ledger-totals").innerText(), /Commission sur livraisons/);
      await shot(fin, "admin-finances");
      await fin.close();

      await client.goto(deliveryUrl);
      assert.match(await client.getByTestId("order-status").innerText(), /Livrée/);
      const notes = await client.getByTestId("notifications").innerText();
      for (const t of ["transmise à", "a vérifié votre commande", `Commande ${dref} confirmée`, "Paiement reçu", "a échoué", "confirmée", "livreur (Jonas (démo))", "récupéré", "en cours de livraison", "a été livrée"])
        assert.ok(notes.includes(t), `notification « ${t} »`);
      await shot(client, "suivi-livree");
      // Clôture : la commande n'est terminée qu'après le client.
      const closure = client.getByTestId("closure");
      assert.match(await closure.innerText(), /Vous : en attente/);
      await closure.getByRole("button", { name: "J'ai bien reçu ma commande" }).click();
      await client.getByText("Commande clôturée").waitFor();
      assert.ok((await db.order.findFirstOrThrow({ where: { publicRef: dref } })).closedAt, "commande clôturée par toutes les parties");
      // Avis, possible une fois la commande clôturée, visible sur la fiche de la pharmacie.
      const review = client.getByTestId("review-form");
      await review.locator("label", { hasText: "5 ★" }).first().click();
      await review.locator("label", { hasText: "4 ★" }).nth(1).click();
      await review.locator("textarea[name=comment]").fill("Livraison rapide, produits bien emballés.");
      await review.getByRole("button", { name: "Envoyer mon avis" }).click();
      await client.getByText(/Merci pour votre avis/).waitFor();
      await client.goto(`${BASE}/pharmacies/pharmacie-de-ganhi`);
      assert.match(await client.getByTestId("rating").innerText(), /★ 5 \/ 5 · 1 avis client/);
    });

    await check("commander sur deux pharmacies avec un seul panier", async () => {
      const sro = await db.product.findUniqueOrThrow({ where: { slug: "sro" } });
      await client.goto(`${BASE}/pharmacies/pharmacie-de-ganhi`);
      await client.fill(`input[name=q_${sro.id}]`, "1");
      await client.getByRole("button", { name: "Ajouter au panier" }).first().click();
      await client.locator('[data-testid=cart-link][aria-label*="1 article"]').waitFor();
      await client.goto(`${BASE}/pharmacies/pharmacie-de-godomey`);
      await client.locator("input[name^=q_]").first().fill("2");
      await client.getByRole("button", { name: "Ajouter au panier" }).first().click();
      await client.locator('[data-testid=cart-link][aria-label*="3 articles"]').waitFor();
      await client.goto(`${BASE}/panier`);
      const cart = client.getByTestId("cart");
      assert.match(await cart.innerText(), /Ganhi/);
      assert.match(await cart.innerText(), /Godomey/);
      await shot(client, "panier");
      const form = client.getByTestId("checkout-form");
      await form.locator("input[name=contactName]").fill("Afi");
      await form.locator("input[name=phone]").fill("+229 01 96 44 55 66");
      await form.getByRole("button", { name: /Envoyer/ }).click();
      await client.waitForURL(/\/suivi\/groupe\//);
      assert.match(await client.getByTestId("checkout-ref").innerText(), /^PAN-/);
      assert.equal(await client.getByTestId("checkout-orders").locator(":scope > *").count(), 2, "une commande par pharmacie");
      await shot(client, "panier-suivi");
      assert.equal(await client.getByTestId("cart-link").getAttribute("aria-label"), "Panier", "le panier est vidé");
    });

    await check("le tableau de bord pharmacie affiche l'activité du jour", async () => {
      await pharmacist.goto(`${BASE}/pharmacie`);
      const kpis = await pharmacist.getByTestId("kpis").innerText();
      assert.match(kpis, /commandes/);
      await shot(pharmacist, "pharmacie");
    });

    await check("importer un fichier de stock : rapport, puis publication confirmée", async () => {
      await pharmacist.goto(`${BASE}/pharmacie/stock`);
      await pharmacist.getByTestId("stock-table").waitFor();
      const file = "Produit;Dosage;Prix;Quantité\nParacétamol;500 mg;650;30\nProduit inconnu;;100;1\nIbuprofène;;abc;\n";
      await pharmacist.setInputFiles("input[name=file]", { name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(file) });
      await pharmacist.getByRole("button", { name: "Analyser le fichier" }).click();
      await pharmacist.waitForURL(/\/pharmacie\/stock\/import\//);
      const summary = await pharmacist.getByTestId("import-summary").innerText();
      assert.match(summary, /1\s+Correcte/);
      assert.match(summary, /1\s+Produit inconnu/);
      assert.match(summary, /1\s+Erreur de format/);
      await shot(pharmacist, "rapport-import");
      await pharmacist.getByRole("button", { name: "Publier la ligne correcte" }).click();
      await pharmacist.waitForURL(/publie=1/);
      const row = pharmacist.getByTestId("stock-table").locator("tr", { hasText: "Paracétamol" });
      assert.equal(await row.getByLabel("Prix de Paracétamol").inputValue(), "650");
      const csv = await pharmacist.request.get(`${BASE}/pharmacie/stock/export?format=csv`);
      assert.equal(csv.status(), 200);
      assert.match(await csv.text(), /paracetamol-500;Paracétamol;500 mg;Comprimé;Boîte de 16 comprimés;650;30;Disponible/);
      const xlsx = await pharmacist.request.get(`${BASE}/pharmacie/stock/export?format=xlsx`);
      assert.match(xlsx.headers()["content-type"], /spreadsheetml/);
    });

    await check("inscrire une pharmacie : invisible jusqu'à la validation par l'administration", async () => {
      const owner = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await owner.goto(`${BASE}/pharmacie/connexion`);
      await owner.getByRole("link", { name: "Inscrire ma pharmacie" }).first().click();
      const form = owner.getByTestId("pharmacy-signup");
      await form.locator("input[name=name]").fill("Pharmacie Étoile du Port");
      await form.locator("input[name=licenseNumber]").fill("MS/DPMED/2026-118");
      await form.locator("input[name=ownerName]").fill("Dr Afi Houngbo");
      await form.locator("input[name=phone]").fill("+229 01 97 55 44 33");
      await form.locator("input[name=address]").fill("Boulevard de la Marina");
      await form.locator("input[name=district]").fill("Ganhi");
      await form.locator("input[name=doc_PHARMACY_LICENSE]").setInputFiles({ name: "licence.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 licence") });
      await form.locator("input[name=doc_OWNER_ID]").setInputFiles({ name: "cni.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70]) });
      await form.locator("input[name=email]").fill("etoile@exemple.bj");
      await form.locator("input[name=password]").fill("motdepasse-etoile");
      await form.locator("input[name=consent]").check();
      await shot(owner, "inscription-pharmacie");
      await form.getByRole("button", { name: "Envoyer mon dossier" }).click();
      await owner.waitForURL(/\/pharmacie\/statut/);
      assert.match(await owner.getByTestId("verification-status").innerText(), /En attente de vérification/);
      await owner.goto(`${BASE}/pharmacie/stock`);
      await owner.waitForURL(/\/pharmacie\/statut/);
      assert.equal((await client.goto(`${BASE}/pharmacies/pharmacie-etoile-du-port`))?.status(), 404, "invisible avant validation");

      const admin = await (await browser.newContext()).newPage();
      await admin.goto(`${BASE}/admin/connexion`);
      await admin.fill("input[name=email]", "admin@demo.pharma-ai.local");
      await admin.fill("input[name=password]", PASSWORD);
      await admin.click("button[type=submit]");
      await admin.waitForURL(`${BASE}/admin`);
      await admin.getByRole("link", { name: /Dossiers à vérifier/ }).click();
      await admin.getByTestId("verification-queue").getByText("Pharmacie Étoile du Port").click();
      assert.match(await admin.getByTestId("documents").innerText(), /Ouvrir \(PDF/);
      await shot(admin, "admin-dossier");
      await admin.getByTestId("decision-form").getByRole("button", { name: "Valider le dossier" }).click();
      await admin.getByText("Décision enregistrée.").waitFor();
      await admin.close();

      await owner.goto(`${BASE}/pharmacie`);
      await owner.getByTestId("stock-summary").waitFor();
      // Abonnement : essai gratuit dès la validation, puis formule choisie et réglée en ligne.
      assert.match(await owner.getByTestId("billing-banner").innerText(), /Essai gratuit : 14 jours restants/);
      await owner.getByRole("link", { name: "Mon abonnement" }).click();
      const choice = owner.getByTestId("billing-choice");
      await choice.locator("label", { hasText: "Forfait trimestriel" }).click();
      await choice.getByRole("button", { name: "Enregistrer ma formule" }).click();
      await owner.getByTestId("invoices-due").waitFor();
      await shot(owner, "abonnement");
      await owner.getByTestId("pay-invoice").getByRole("button", { name: /^Payer/ }).click();
      await owner.getByTestId("invoices-due").waitFor({ state: "detached" });
      assert.equal(await owner.getByTestId("subscription-status").innerText(), "Actif");
      await owner.close();
      assert.equal((await client.goto(`${BASE}/pharmacies/pharmacie-etoile-du-port`))?.status(), 200, "visible après validation");
      await client.goto(`${BASE}/livreur/inscription`);
      await client.getByTestId("courier-signup").locator("input[name=doc_DRIVING_LICENSE][required]").waitFor({ state: "attached" });
      await client.getByTestId("courier-signup").locator("select[name=vehicle]").selectOption("VELO");
      assert.equal(await client.locator("input[name=doc_DRIVING_LICENSE][required]").count(), 0, "pas de permis exigé à vélo");
      await shot(client, "inscription-livreur");
    });

    await check("créer un compte plus tard et rattacher la commande après vérification", async () => {
      await client.goto(`${BASE}/compte/inscription`);
      await client.fill("input[name=name]", "Grâce");
      await client.fill("input[name=email]", "grace@example.com");
      await client.fill("input[name=password]", "Baobab-Ganvie-26");
      await client.check("input[name=consent]");
      await client.click("button[type=submit]");
      await client.waitForURL(`${BASE}/compte`);
      await client.click("text=Rattacher une commande");
      await client.fill("input[name=ref]", ref);
      await client.fill("input[name=phone]", "+22901961234567");
      await client.click("button[type=submit]");
      const demo = await client.locator("strong.font-mono").innerText();
      await client.fill("input[name=code]", demo);
      await client.click("button[type=submit]");
      await client.waitForURL(/\/compte\?rattachee=1/);
      await client.getByText(ref).waitFor();
      await shot(client, "compte");
    });

    await check("en-têtes de sécurité présents et aucun script bloqué pendant tout le parcours", async () => {
      const res = await fetch(`${BASE}/`);
      const csp = res.headers.get("content-security-policy") ?? "";
      assert.match(csp, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=63072000/);
      assert.equal(res.headers.get("x-frame-options"), "DENY");
      assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
      const again = (await fetch(`${BASE}/`)).headers.get("content-security-policy");
      assert.notEqual(again, csp, "un nonce neuf à chaque requête");
      const priv = await fetch(`${BASE}/admin/connexion`);
      assert.match(priv.headers.get("x-robots-tag") ?? "", /noindex/);
      assert.equal((await fetch(`${BASE}/api/cron/billing`)).status, 503, "cron fermé sans CRON_SECRET");
      assert.deepEqual(pageErrors, []);
    });

    await browser.close();
    console.log(`\nTous les critères d'acceptation passent (${step} étapes).`);
  } finally {
    // npx lance next dans un sous-processus : on arrête tout le groupe, sinon le serveur survit au test.
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {
      server.kill();
    }
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
