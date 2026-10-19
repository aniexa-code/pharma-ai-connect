// Évolution étape 1 : position et rayon, pharmacies de garde, horaires périmés, réglages et audit.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { isOnDuty, pharmacyOpenStatus, zonedWallTimeToUtc, utcToZonedWallTime } from "../src/lib/hours";
import { authenticateAdmin } from "../src/lib/services/accounts";
import { confirmHours, declareDuty, endDuty } from "../src/lib/services/pharmacies";
import { nearestZone, prioritizeOnDuty, resolvePlace, searchPharmacies, widerRadii } from "../src/lib/services/search";
import { DEFAULT_SETTINGS, getSettings, mergeSettings, saveSettings } from "../src/lib/settings";
import { parseSettingsForm } from "../src/lib/settings-fields";
import { fixture, resetDatabase } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => {
  await resetDatabase();
  f = await fixture();
});
after(() => db.$disconnect());

const ALWAYS_OPEN = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [["00:00", "24:00"]]]));
const NEVER_OPEN = {};

describe("Garde et horaires", () => {
  test("une garde sans date de fin, ou expirée, n'est jamais affichée", () => {
    const now = new Date("2026-10-19T23:00:00Z");
    assert.equal(isOnDuty({ onDuty: true, onDutyUntil: null }, now), false);
    assert.equal(isOnDuty({ onDuty: true, onDutyUntil: new Date("2026-10-19T22:00:00Z") }, now), false);
    assert.equal(isOnDuty({ onDuty: true, onDutyUntil: new Date("2026-10-20T07:00:00Z") }, now), true);
    const expired = { openingHours: NEVER_OPEN, onDuty: true, onDutyUntil: new Date("2026-10-19T22:00:00Z"), hoursConfirmedAt: now, country: "BJ" };
    assert.equal(pharmacyOpenStatus(expired, now).open, false);
  });

  test("des horaires non reconfirmés ne permettent jamais d'afficher « Ouverte »", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const old = new Date(now.getTime() - 200 * 86_400_000);
    const s = pharmacyOpenStatus({ openingHours: ALWAYS_OPEN, onDuty: false, onDutyUntil: null, hoursConfirmedAt: old, country: "BJ" }, now, 120);
    assert.equal(s.open, false);
    assert.equal(s.unknown, true);
    assert.match(s.label, /à confirmer/);
    const fresh = pharmacyOpenStatus({ openingHours: ALWAYS_OPEN, onDuty: false, onDutyUntil: null, hoursConfirmedAt: now, country: "BJ" }, now, 120);
    assert.equal(fresh.open, true);
  });

  test("la pharmacie confirme ses horaires et déclare une garde bornée, tracée dans le journal", async () => {
    const userId = "test-user";
    await db.pharmacy.update({ where: { id: f.ganhi.id }, data: { hoursConfirmedAt: null, onDuty: false, onDutyUntil: null } });
    await confirmHours(f.ganhi.id, userId);
    const now = new Date();
    await assert.rejects(declareDuty(f.ganhi.id, userId, new Date(now.getTime() - 60_000)), /futur/);
    await assert.rejects(declareDuty(f.ganhi.id, userId, new Date(now.getTime() + 100 * 3_600_000)), /72 heures/);
    const until = new Date(now.getTime() + 10 * 3_600_000);
    await declareDuty(f.ganhi.id, userId, until);
    let p = await db.pharmacy.findUniqueOrThrow({ where: { id: f.ganhi.id } });
    assert.ok(p.hoursConfirmedAt);
    assert.equal(isOnDuty(p), true);
    await endDuty(f.ganhi.id, userId);
    p = await db.pharmacy.findUniqueOrThrow({ where: { id: f.ganhi.id } });
    assert.equal(isOnDuty(p), false);
    const actions = (await db.auditLog.findMany({ where: { entity: `Pharmacy:${f.ganhi.id}` }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    assert.deepEqual(actions, ["HOURS_CONFIRMED", "DUTY_DECLARED", "DUTY_ENDED"]);
  });

  test("heure de fin saisie dans le fuseau du pays (Cotonou, UTC+1)", () => {
    assert.equal(zonedWallTimeToUtc("2026-10-20T08:00", "Africa/Porto-Novo")?.toISOString(), "2026-10-20T07:00:00.000Z");
    assert.equal(utcToZonedWallTime(new Date("2026-10-20T07:00:00Z"), "Africa/Porto-Novo"), "2026-10-20T08:00");
    assert.equal(zonedWallTimeToUtc("demain", "Africa/Porto-Novo"), null);
  });
});

describe("Zone de recherche", () => {
  test("le rayon est respecté et l'élargissement n'est que proposé", async () => {
    const point = await resolvePlace("Fidjrossè");
    assert.ok(point);
    const near = await searchPharmacies({ point, radiusKm: 1 });
    assert.ok(near.every((r) => r.distance! <= 1));
    const wide = await searchPharmacies({ point, radiusKm: 10 });
    assert.ok(wide.length > near.length, "un rayon plus large trouve davantage de pharmacies");
    assert.deepEqual(widerRadii(3, 50), [5, 10]);
    assert.deepEqual(widerRadii(5, 50), [10, 20]);
    assert.deepEqual(widerRadii(10, 15), [15]);
    assert.deepEqual(widerRadii(50, 50), []);
  });

  test("la position est décrite par le quartier le plus proche", async () => {
    assert.equal((await nearestZone({ lat: 6.357, lng: 2.431 }))?.name, "Ganhi");
    assert.equal(await nearestZone({ lat: 48.85, lng: 2.35 }), null);
  });

  test("la nuit, les pharmacies de garde passent en tête", () => {
    const r = (id: string, open: boolean, onDuty: boolean) => ({ pharmacy: { id } as never, distance: 1, open: { open, label: "", closesSoon: false }, onDuty, stock: null, reliability: null });
    const night = prioritizeOnDuty([r("a", false, false), r("b", true, true)]);
    assert.equal(night.night, true);
    assert.deepEqual(night.results.map((x) => x.pharmacy.id), ["b", "a"]);
    const day = prioritizeOnDuty([r("a", true, false), r("b", true, true)]);
    assert.equal(day.night, false);
    assert.deepEqual(day.results.map((x) => x.pharmacy.id), ["a", "b"]);
  });
});

describe("Réglages et administration", () => {
  test("les réglages fusionnent valeurs par défaut, global et pays ; les clés inconnues sont ignorées", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { search: { defaultRadiusKm: 5 } }, { delivery: { perKm: 200 }, inconnu: 1 });
    assert.equal(merged.search.defaultRadiusKm, 5);
    assert.equal(merged.search.maxRadiusKm, DEFAULT_SETTINGS.search.maxRadiusKm);
    assert.equal(merged.delivery.perKm, 200);
    assert.equal("inconnu" in merged, false);
    assert.equal(DEFAULT_SETTINGS.delivery.perKm, 150, "les valeurs par défaut ne sont pas modifiées");
  });

  test("une modification de réglage est enregistrée et tracée (avant / après)", async () => {
    const admin = await authenticateAdmin("admin@demo.pharma-ai.local", process.env.DEMO_PHARMACY_PASSWORD ?? "demo1234");
    await saveSettings("BJ", { fees: { serviceFee: 150 } }, { type: "ADMIN", id: admin.id });
    const s = await getSettings("BJ");
    assert.equal(s.fees.serviceFee, 150);
    assert.equal(s.delivery.commissionPct, 15);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "SETTINGS_UPDATED" }, orderBy: { createdAt: "desc" } });
    assert.equal(log.actorId, admin.id);
    assert.equal((log.before as { fees: { serviceFee: number } }).fees.serviceFee, 100);
    assert.equal((log.after as { fees: { serviceFee: number } }).fees.serviceFee, 150);
  });

  test("le formulaire d'administration refuse les valeurs hors bornes", () => {
    const fd = new FormData();
    fd.set("delivery.commissionPct", "150");
    assert.ok("error" in parseSettingsForm(fd));
    const ok = new FormData();
    ok.set("search.radiusOptionsKm", "10, 1, 3, 3");
    ok.set("delivery.nightStart", "22:00");
    const parsed = parseSettingsForm(ok);
    assert.ok("patch" in parsed);
    assert.deepEqual(parsed.patch, { search: { radiusOptionsKm: [1, 3, 10] }, delivery: { nightStart: "22:00" } });
  });

  test("un mauvais mot de passe administrateur est refusé", async () => {
    await assert.rejects(authenticateAdmin("admin@demo.pharma-ai.local", "mauvais"), /incorrect/);
  });
});
