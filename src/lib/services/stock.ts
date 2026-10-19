// Stock numérique des pharmacies : gestion, import CSV / Excel avec rapport de validation, export.
// Le stock numérique reste indicatif : seule la confirmation physique de la pharmacie engage.
import ExcelJS from "exceljs";
import type { Prisma, Product, StockStatus } from "@prisma/client";
import { db } from "../db";
import { ServiceError } from "../errors";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
/** Un rapport non confirmé expire : il faut réimporter un fichier à jour. */
const IMPORT_TTL_MS = 24 * 3_600_000;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const compact = (s: string) => fold(s).replace(/[\s.]/g, "").replace(",", ".");

// ---------------------------------------------------------------------------------------------
// Lecture des fichiers

export type RawRow = { line: number; cells: Record<string, string> };

/** Colonnes reconnues, quel que soit l'intitulé utilisé par le logiciel de la pharmacie. */
const HEADERS: Record<string, string[]> = {
  code: ["code", "reference", "ref", "identifiant"],
  name: ["produit", "nom", "medicament", "designation", "libelle", "nom du produit"],
  strength: ["dosage", "concentration"],
  form: ["forme", "forme galenique"],
  packaging: ["conditionnement", "presentation", "boite"],
  price: ["prix", "prix unitaire", "prix de vente", "pv", "prix public"],
  quantity: ["quantite", "qte", "stock", "quantite en stock"],
  status: ["statut", "disponibilite", "etat"],
};
export const EXPORT_COLUMNS = ["Code", "Produit", "Dosage", "Forme", "Conditionnement", "Prix", "Quantité", "Statut", "Dernière mise à jour"];

function columnKey(header: string) {
  const h = fold(header).replace(/[()]/g, "").replace(/\s*(fcfa|xof|xaf|eur)\s*$/, "").trim();
  return Object.entries(HEADERS).find(([, names]) => names.includes(h))?.[0] ?? null;
}

/** CSV avec ; ou , comme séparateur, guillemets, BOM éventuel. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ServiceError("FORMAT", "Fichier Excel illisible. Enregistrez-le au format .xlsx ou .csv.");
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (r) => {
    const values: string[] = [];
    for (let c = 1; c <= Math.max(ws.columnCount, 1); c++) {
      const v = r.getCell(c).value;
      const text =
        v === null || v === undefined ? "" :
        typeof v === "object" && "result" in v ? String(v.result ?? "") :
        typeof v === "object" && "richText" in v ? v.richText.map((t) => t.text).join("") :
        v instanceof Date ? v.toISOString() : String(v);
      values.push(text);
    }
    rows.push(values);
  });
  return rows;
}

/** Fichier envoyé → lignes avec leurs colonnes reconnues. */
export async function readStockFile(fileName: string, buffer: Buffer): Promise<{ rows: RawRow[]; unknownColumns: string[] }> {
  if (buffer.length === 0) throw new ServiceError("FORMAT", "Le fichier est vide.");
  if (buffer.length > IMPORT_MAX_BYTES) throw new ServiceError("FORMAT", "Fichier trop volumineux (2 Mo au maximum).");
  const ext = fileName.toLowerCase().split(".").pop();
  let table: string[][];
  if (ext === "xlsx") table = await parseXlsx(buffer);
  else if (ext === "csv" || ext === "txt") table = parseCsv(buffer.toString("utf8"));
  else throw new ServiceError("FORMAT", "Format non pris en charge : envoyez un fichier .csv ou .xlsx.");

  const headerIndex = table.findIndex((r) => r.some((c) => columnKey(c)));
  if (headerIndex < 0) throw new ServiceError("FORMAT", "Aucune colonne reconnue. La première ligne doit contenir au moins « Produit » et « Prix ».");
  const header = table[headerIndex].map(columnKey);
  if (!header.includes("price") || !(header.includes("name") || header.includes("code")))
    throw new ServiceError("FORMAT", "Colonnes obligatoires manquantes : « Produit » (ou « Code ») et « Prix ».");
  const unknownColumns = table[headerIndex].filter((h, i) => h.trim() && !header[i]);
  const rows: RawRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i++) {
    if (table[i].every((c) => !c.trim())) continue;
    const cells: Record<string, string> = {};
    header.forEach((k, j) => k && (cells[k] = (table[i][j] ?? "").trim()));
    rows.push({ line: i + 1, cells });
  }
  if (rows.length > IMPORT_MAX_ROWS) throw new ServiceError("FORMAT", `Trop de lignes (${IMPORT_MAX_ROWS} au maximum par import).`);
  return { rows, unknownColumns };
}

// ---------------------------------------------------------------------------------------------
// Validation

export type RowVerdict = "OK" | "INCORRECT" | "UNKNOWN_PRODUCT" | "DUPLICATE" | "MISSING" | "FORMAT";
export const VERDICT_LABEL: Record<RowVerdict, string> = {
  OK: "Correcte",
  INCORRECT: "Incorrecte",
  UNKNOWN_PRODUCT: "Produit inconnu",
  DUPLICATE: "Doublon",
  MISSING: "Champ manquant",
  FORMAT: "Erreur de format",
};

export type CheckedRow = {
  line: number;
  verdict: RowVerdict;
  messages: string[];
  input: Record<string, string>;
  productId?: string;
  productLabel?: string;
  price?: number;
  quantity?: number | null;
  status?: StockStatus;
  packaging?: string | null;
};

export type ImportSummary = Record<RowVerdict, number> & { total: number };

const STATUS_WORDS: [RegExp, StockStatus][] = [
  [/^(disponible|dispo|en stock|available|oui|ok)$/, "AVAILABLE"],
  [/^(faible|stock faible|bas|low|peu)$/, "LOW"],
  [/^(indisponible|rupture|epuise|non|out|0)$/, "OUT"],
];

function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s| | /g, "").replace(/(fcfa|xof|xaf|f)$/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const label = (p: Product) => [p.name, p.strength, p.form].filter(Boolean).join(" · ");

function matchProduct(cells: Record<string, string>, products: Product[]) {
  if (cells.code) {
    const byCode = products.find((p) => p.slug === cells.code.toLowerCase().trim());
    if (byCode) return { product: byCode };
  }
  if (!cells.name) return { product: null };
  const name = fold(cells.name);
  let candidates = products.filter((p) => fold(p.name) === name || fold(p.dci) === name);
  if (!candidates.length) candidates = products.filter((p) => fold(`${p.name} ${p.strength ?? ""}`) === name);
  if (candidates.length > 1 && cells.strength) {
    const narrowed = candidates.filter((p) => p.strength && compact(p.strength) === compact(cells.strength));
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length > 1 && cells.form) {
    const narrowed = candidates.filter((p) => fold(p.form).includes(fold(cells.form)) || fold(cells.form).includes(fold(p.form)));
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length > 1) return { product: null, ambiguous: candidates };
  return { product: candidates[0] ?? null };
}

/** Analyse chaque ligne sans rien enregistrer : c'est le rapport présenté avant publication. */
export function checkRows(rows: RawRow[], products: Product[]): { rows: CheckedRow[]; summary: ImportSummary } {
  const seen = new Map<string, number>();
  const out: CheckedRow[] = rows.map(({ line, cells }) => {
    const r: CheckedRow = { line, verdict: "OK", messages: [], input: cells };
    const fail = (verdict: RowVerdict, msg: string) => {
      if (r.verdict === "OK") r.verdict = verdict;
      r.messages.push(msg);
    };
    if (!cells.name && !cells.code) fail("MISSING", "Nom du produit manquant.");
    if (!cells.price) fail("MISSING", "Prix manquant.");
    if (r.verdict !== "OK") return r;

    const price = parseAmount(cells.price);
    if (price === null) fail("FORMAT", `Prix « ${cells.price} » illisible : indiquez un nombre (ex. 1500).`);
    else if (price <= 0 || price > 10_000_000) fail("INCORRECT", "Le prix doit être supérieur à 0.");
    else if (!Number.isInteger(price)) fail("FORMAT", "Le prix doit être un montant entier, sans décimales.");
    else r.price = price;

    let quantity: number | null = null;
    if (cells.quantity) {
      const q = parseAmount(cells.quantity);
      if (q === null || !Number.isInteger(q)) fail("FORMAT", `Quantité « ${cells.quantity} » illisible : nombre entier attendu.`);
      else quantity = q;
    }
    r.quantity = quantity;

    let status: StockStatus | null = null;
    if (cells.status) {
      status = STATUS_WORDS.find(([re]) => re.test(fold(cells.status)))?.[1] ?? null;
      if (!status) fail("FORMAT", `Statut « ${cells.status} » non reconnu : Disponible, Faible ou Indisponible.`);
    }
    r.status = quantity === 0 ? "OUT" : (status ?? "AVAILABLE");

    const m = matchProduct(cells, products);
    if (m.ambiguous) {
      fail("INCORRECT", `Plusieurs produits correspondent (${m.ambiguous.map((p) => p.strength ?? p.form).join(", ")}) : précisez le dosage.`);
      return r;
    }
    if (!m.product) {
      fail("UNKNOWN_PRODUCT", `« ${cells.name || cells.code} » n'est pas au référentiel. Demandez son ajout à Pharma AI Connect.`);
      return r;
    }
    const p = m.product;
    r.productId = p.id;
    r.productLabel = label(p);
    if (cells.strength && p.strength && compact(cells.strength) !== compact(p.strength))
      fail("INCORRECT", `Dosage « ${cells.strength} » différent du référentiel (${p.strength}).`);
    if (cells.form && !(fold(p.form).includes(fold(cells.form)) || fold(cells.form).includes(fold(p.form))))
      fail("INCORRECT", `Forme « ${cells.form} » différente du référentiel (${p.form}).`);
    r.packaging = cells.packaging || null;

    const first = seen.get(p.id);
    if (first !== undefined) fail("DUPLICATE", `Même produit qu'à la ligne ${first} : seule la première ligne est gardée.`);
    else if (r.verdict === "OK") seen.set(p.id, line);
    return r;
  });
  const summary = { total: out.length, OK: 0, INCORRECT: 0, UNKNOWN_PRODUCT: 0, DUPLICATE: 0, MISSING: 0, FORMAT: 0 } as ImportSummary;
  for (const r of out) summary[r.verdict]++;
  return { rows: out, summary };
}

// ---------------------------------------------------------------------------------------------
// Import en deux temps : analyse, puis publication sur confirmation

export async function analyzeImport(pharmacyId: string, userId: string, fileName: string, buffer: Buffer) {
  const { rows } = await readStockFile(fileName, buffer);
  if (!rows.length) throw new ServiceError("FORMAT", "Aucune ligne de produit dans le fichier.");
  const products = await db.product.findMany();
  const checked = checkRows(rows, products);
  // Les rapports non confirmés précédents sont abandonnés : un seul import en attente à la fois.
  await db.stockImport.updateMany({ where: { pharmacyId, status: "PENDING" }, data: { status: "CANCELLED" } });
  return db.stockImport.create({
    data: {
      pharmacyId,
      userId,
      fileName: fileName.slice(0, 120),
      report: checked.rows as unknown as Prisma.InputJsonValue,
      summary: checked.summary as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function pendingImport(pharmacyId: string, importId: string) {
  const imp = await db.stockImport.findFirst({ where: { id: importId, pharmacyId } });
  if (!imp) return null;
  return { ...imp, rows: imp.report as unknown as CheckedRow[], counts: imp.summary as unknown as ImportSummary };
}

/** Publie les seules lignes correctes. Les autres restent dans le rapport, rien n'est deviné. */
export async function publishImport(pharmacyId: string, userId: string, importId: string, now = new Date()) {
  const imp = await pendingImport(pharmacyId, importId);
  if (!imp) throw new ServiceError("NOT_FOUND", "Import introuvable.");
  if (imp.status !== "PENDING") throw new ServiceError("STATE", "Cet import a déjà été publié ou annulé.");
  if (now.getTime() - imp.createdAt.getTime() > IMPORT_TTL_MS) throw new ServiceError("STATE", "Ce rapport a expiré : importez à nouveau votre fichier.");
  const ok = imp.rows.filter((r) => r.verdict === "OK" && r.productId);
  const claimed = await db.stockImport.updateMany({ where: { id: imp.id, status: "PENDING" }, data: { status: "PUBLISHED", publishedAt: now } });
  if (claimed.count !== 1) throw new ServiceError("STATE", "Cet import a déjà été publié.");
  await db.$transaction([
    ...ok.map((r) =>
      db.stock.upsert({
        where: { pharmacyId_productId: { pharmacyId, productId: r.productId! } },
        update: { price: r.price!, quantity: r.quantity ?? null, status: r.status!, packaging: r.packaging ?? null, source: "IMPORT", confirmedAt: now },
        create: { pharmacyId, productId: r.productId!, price: r.price!, quantity: r.quantity ?? null, status: r.status!, packaging: r.packaging ?? null, source: "IMPORT", confirmedAt: now },
      }),
    ),
    db.auditLog.create({
      data: { actorType: "PHARMACY", actorId: userId, action: "STOCK_IMPORTED", entity: `Pharmacy:${pharmacyId}`, after: { importId: imp.id, fileName: imp.fileName, published: ok.length, ignored: imp.rows.length - ok.length } },
    }),
  ]);
  return { published: ok.length, ignored: imp.rows.length - ok.length };
}

export async function cancelImport(pharmacyId: string, importId: string) {
  await db.stockImport.updateMany({ where: { id: importId, pharmacyId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

// ---------------------------------------------------------------------------------------------
// Gestion unitaire

export async function addStockItem(pharmacyId: string, userId: string, input: { productId: string; price: number; quantity: number | null; status: StockStatus; packaging?: string | null }) {
  if (!Number.isInteger(input.price) || input.price <= 0) throw new ServiceError("INVALID", "Indiquez un prix supérieur à 0.");
  if (input.quantity !== null && (!Number.isInteger(input.quantity) || input.quantity < 0)) throw new ServiceError("INVALID", "Quantité invalide.");
  const product = await db.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new ServiceError("NOT_FOUND", "Produit introuvable.");
  const existing = await db.stock.findUnique({ where: { pharmacyId_productId: { pharmacyId, productId: product.id } } });
  if (existing) throw new ServiceError("DUPLICATE", `${product.name} est déjà dans votre stock : modifiez la ligne existante.`);
  const now = new Date();
  await db.$transaction([
    db.stock.create({
      data: { pharmacyId, productId: product.id, price: input.price, quantity: input.quantity, status: input.quantity === 0 ? "OUT" : input.status, packaging: input.packaging || null, source: "PHARMACY", confirmedAt: now },
    }),
    db.auditLog.create({ data: { actorType: "PHARMACY", actorId: userId, action: "STOCK_ADDED", entity: `Pharmacy:${pharmacyId}`, after: { productId: product.id, price: input.price } } }),
  ]);
}

export async function removeStockItem(pharmacyId: string, userId: string, stockId: string) {
  const s = await db.stock.findFirst({ where: { id: stockId, pharmacyId }, include: { product: true } });
  if (!s) throw new ServiceError("NOT_FOUND", "Ligne de stock introuvable.");
  await db.$transaction([
    db.stock.delete({ where: { id: s.id } }),
    db.auditLog.create({ data: { actorType: "PHARMACY", actorId: userId, action: "STOCK_REMOVED", entity: `Pharmacy:${pharmacyId}`, before: { productId: s.productId, price: s.price, quantity: s.quantity } } }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Export (mêmes colonnes que l'import : le fichier exporté peut être corrigé puis réimporté)

const STATUS_EXPORT: Record<StockStatus, string> = { AVAILABLE: "Disponible", LOW: "Faible", OUT: "Indisponible", UNKNOWN: "" };

export async function stockExportRows(pharmacyId: string) {
  const stocks = await db.stock.findMany({ where: { pharmacyId }, include: { product: true }, orderBy: { product: { name: "asc" } } });
  return stocks.map((s) => [
    s.product.slug,
    s.product.name,
    s.product.strength ?? "",
    s.product.form,
    s.packaging ?? s.product.packaging ?? "",
    String(s.price),
    s.quantity === null ? "" : String(s.quantity),
    STATUS_EXPORT[s.status],
    s.confirmedAt ? s.confirmedAt.toISOString().slice(0, 16).replace("T", " ") : "",
  ]);
}

export function toCsv(rows: string[][]) {
  const esc = (v: string) => (/[;"\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"` : v);
  return "﻿" + [EXPORT_COLUMNS, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

export async function toXlsx(rows: string[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Stock");
  ws.addRow(EXPORT_COLUMNS).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((v, i) => (i === 5 || (i === 6 && v !== "") ? Number(v) : v)));
  ws.columns.forEach((c, i) => (c.width = [22, 28, 12, 14, 24, 10, 10, 14, 20][i]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
