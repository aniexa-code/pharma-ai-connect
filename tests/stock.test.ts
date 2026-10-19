// Évolution étape 2 : stock numérique, import CSV / Excel avec rapport de validation, export.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import { addStockItem, analyzeImport, checkRows, parseCsv, pendingImport, publishImport, readStockFile, removeStockItem, stockExportRows, toCsv, toXlsx } from "../src/lib/services/stock";
import { fixture, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => {
  await resetDatabase();
  f = await fixture();
});
after(() => db.$disconnect());

const csv = (lines: string[]) => Buffer.from(lines.join("\n"), "utf8");

describe("Lecture des fichiers", () => {
  test("CSV avec point-virgule, guillemets et BOM", () => {
    assert.deepEqual(parseCsv('﻿Produit;Prix\n"Sirop; toux";"2 800"\r\nParacétamol;500'), [["Produit", "Prix"], ["Sirop; toux", "2 800"], ["Paracétamol", "500"]]);
    assert.deepEqual(parseCsv("Produit,Prix\nIbuprofène,1200"), [["Produit", "Prix"], ["Ibuprofène", "1200"]]);
  });

  test("les intitulés de colonnes usuels sont reconnus ; un fichier sans colonnes obligatoires est refusé", async () => {
    const { rows } = await readStockFile("stock.csv", csv(["Désignation;Dosage;Prix de vente (FCFA);Qté", "Paracetamol;500 mg;550;12"]));
    assert.deepEqual(rows[0].cells, { name: "Paracetamol", strength: "500 mg", price: "550", quantity: "12" });
    await assert.rejects(readStockFile("stock.csv", csv(["Produit;Couleur", "X;bleu"])), /Prix/);
    await assert.rejects(readStockFile("stock.pdf", csv(["Produit;Prix"])), /\.csv ou \.xlsx/);
    await assert.rejects(readStockFile("stock.xlsx", Buffer.from("pas un classeur")), /illisible/);
  });
});

describe("Rapport de validation", () => {
  test("chaque ligne reçoit un verdict : correcte, incorrecte, inconnue, doublon, champ manquant, format", async () => {
    const products = await db.product.findMany();
    const { rows } = await readStockFile("stock.csv", csv([
      "Produit;Dosage;Forme;Prix;Quantité;Statut",
      "Paracétamol;500 mg;Comprimé;550;40;Disponible", // 2 correcte
      "Ibuprofene;200 mg;;1200;;", // 3 dosage différent
      "Doliprane Max;;;900;;", // 4 inconnu
      "paracetamol;500mg;;600;;", // 5 doublon de la ligne 2
      "Oméprazole;;;;5;", // 6 prix manquant
      "Loratadine;;;mille;;", // 7 prix illisible
      "Vitamine C;;;1500;abc;", // 8 quantité illisible
      "Amoxicilline;;;2500;0;Disponible", // 9 correcte, quantité 0 → indisponible
      "Metformine;;;3000;;bientôt", // 10 statut inconnu
    ]));
    const { rows: checked, summary } = checkRows(rows, products);
    const v = Object.fromEntries(checked.map((r) => [r.line, r.verdict]));
    assert.deepEqual(v, { 2: "OK", 3: "INCORRECT", 4: "UNKNOWN_PRODUCT", 5: "DUPLICATE", 6: "MISSING", 7: "FORMAT", 8: "FORMAT", 9: "OK", 10: "FORMAT" });
    assert.deepEqual(summary, { total: 9, OK: 2, INCORRECT: 1, UNKNOWN_PRODUCT: 1, DUPLICATE: 1, MISSING: 1, FORMAT: 3 });
    assert.equal(checked.find((r) => r.line === 9)?.status, "OUT");
    assert.match(checked.find((r) => r.line === 3)!.messages[0], /400 mg/);
  });

  test("rien n'est publié avant confirmation, puis seules les lignes correctes le sont", async () => {
    const before = await db.stock.findUniqueOrThrow({ where: { pharmacyId_productId: { pharmacyId: f.ganhi.id, productId: f.paracetamol.id } } });
    const imp = await analyzeImport(f.ganhi.id, "user", "maj.csv", csv(["Produit;Prix;Quantité", "Paracétamol;777;9", "Inconnu total;100;1"]));
    const still = await db.stock.findUniqueOrThrow({ where: { id: before.id } });
    assert.equal(still.price, before.price, "l'analyse ne modifie pas le stock");

    await assert.rejects(publishImport(f.godomey.id, "autre", imp.id), /introuvable/, "une autre pharmacie ne peut pas publier cet import");
    assert.deepEqual(await publishImport(f.ganhi.id, "user", imp.id), { published: 1, ignored: 1 });
    const after = await db.stock.findUniqueOrThrow({ where: { id: before.id } });
    assert.equal(after.price, 777);
    assert.equal(after.quantity, 9);
    assert.equal(after.source, "IMPORT");
    await assert.rejects(publishImport(f.ganhi.id, "user", imp.id), /déjà/);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "STOCK_IMPORTED" } });
    assert.deepEqual((log.after as { published: number }).published, 1);
  });

  test("un nouvel import remplace le rapport en attente ; un rapport expiré ne se publie pas", async () => {
    const a = await analyzeImport(f.ganhi.id, "user", "a.csv", csv(["Produit;Prix", "Paracétamol;500"]));
    const b = await analyzeImport(f.ganhi.id, "user", "b.csv", csv(["Produit;Prix", "Paracétamol;510"]));
    assert.equal((await pendingImport(f.ganhi.id, a.id))?.status, "CANCELLED");
    await assert.rejects(publishImport(f.ganhi.id, "user", b.id, new Date(Date.now() + 25 * 3_600_000)), /expiré/);
  });
});

describe("Gestion et export", () => {
  test("ajouter puis retirer un produit, sans doublon", async () => {
    const tramadol = f.tramadol;
    await db.stock.deleteMany({ where: { pharmacyId: f.godomey.id, productId: tramadol.id } });
    await addStockItem(f.godomey.id, "user", { productId: tramadol.id, price: 4100, quantity: 3, status: "AVAILABLE", packaging: "Boîte de 10" });
    await assert.rejects(addStockItem(f.godomey.id, "user", { productId: tramadol.id, price: 4100, quantity: 3, status: "AVAILABLE" }), /déjà dans votre stock/);
    await assert.rejects(addStockItem(f.godomey.id, "user", { productId: f.paracetamol.id, price: 0, quantity: null, status: "AVAILABLE" }), /prix/);
    const s = await db.stock.findUniqueOrThrow({ where: { pharmacyId_productId: { pharmacyId: f.godomey.id, productId: tramadol.id } } });
    assert.equal(s.packaging, "Boîte de 10");
    await assert.rejects(removeStockItem(f.ganhi.id, "user", s.id), /introuvable/, "une pharmacie ne retire pas le stock d'une autre");
    await removeStockItem(f.godomey.id, "user", s.id);
    assert.equal(await db.stock.count({ where: { id: s.id } }), 0);
  });

  test("l'export Excel se réimporte tel quel, sans aucune erreur", async () => {
    const rows = await stockExportRows(f.ganhi.id);
    const buffer = await toXlsx(rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    assert.equal(wb.worksheets[0].rowCount, rows.length + 1);
    const { rows: read } = await readStockFile("export.xlsx", buffer);
    const { summary } = checkRows(read, await db.product.findMany());
    assert.equal(summary.OK, rows.length);
  });

  test("l'export CSV neutralise les formules", () => {
    const out = toCsv([["=HYPERLINK(1)", "Nom; avec point-virgule", "", "", "", "100", "", "", ""]]);
    assert.ok(out.includes(`"'=HYPERLINK(1)"`));
    assert.ok(out.includes(`"Nom; avec point-virgule"`));
  });
});
