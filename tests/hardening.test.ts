// Durcissement : limiteur en rafale parallèle, sessions révocables, mots de passe faibles, compte admin de démo.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { SignJWT } from "jose";
import { db } from "../src/lib/db";
import { rateLimit } from "../src/lib/rate-limit";
import { signSession, verifySession } from "../src/lib/session";
import { authenticateAdmin, authenticatePharmacyUser, registerCustomer } from "../src/lib/services/accounts";
import { resetDatabase } from "./helpers";

before(resetDatabase);
after(() => db.$disconnect());

describe("Limiteur de débit partagé", () => {
  test("une rafale de requêtes simultanées ne dépasse jamais le plafond", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit("test:rafale", 5, 60_000)));
    assert.ok(results.filter(Boolean).length <= 5, `${results.filter(Boolean).length} essais acceptés pour un plafond de 5`);
  });

  test("la connexion pharmacie est aussi limitée par compte visé, même depuis des adresses différentes", async () => {
    const email = "pharmacie-de-ganhi@demo.pharma-ai.local";
    let blocked = false;
    for (let i = 0; i < 12 && !blocked; i++) {
      try {
        await authenticatePharmacyUser(email, "mauvais-mot-de-passe", `10.9.0.${i}`);
      } catch (e) {
        blocked = /Trop d'essais/.test(String(e));
      }
    }
    assert.ok(blocked);
  });

  test("la création de comptes clients est limitée par connexion", async () => {
    let blocked = false;
    for (let i = 0; i < 8 && !blocked; i++) {
      try {
        await registerCustomer({ name: "Robot", email: `robot${i}@example.com`, password: "un-mot-de-passe-solide", consent: true }, { ip: "10.8.0.1" });
      } catch (e) {
        blocked = /Trop de comptes/.test(String(e));
      }
    }
    assert.ok(blocked);
  });
});

describe("Mots de passe", () => {
  test("les mots de passe les plus courants sont refusés", async () => {
    for (const password of ["12345678", "Motdepasse", "aaaaaaaa", "azertyuiop"])
      await assert.rejects(registerCustomer({ name: "Grâce", email: "grace@example.com", password, consent: true }), /trop courant/);
  });
});

describe("Sessions", () => {
  test("une session signée est acceptée et porte un identifiant révocable", async () => {
    const s = await verifySession(await signSession({ uid: "u1", kind: "CUSTOMER" }, 60));
    assert.equal(s?.uid, "u1");
    assert.match(s!.jti, /^[0-9a-f-]{36}$/);
  });

  test("un jeton sans identifiant (ancien format) ou signé avec un autre secret est refusé", async () => {
    const key = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const legacy = await new SignJWT({ uid: "u1", kind: "ADMIN" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("60s").sign(key);
    assert.equal(await verifySession(legacy), null);
    const forged = await new SignJWT({ uid: "u1", kind: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setJti("x")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode("un-autre-secret-un-autre-secret-un-autre-secret"));
    assert.equal(await verifySession(forged), null);
  });
});

describe("Administration", () => {
  test("chaque connexion à l'administration, réussie ou non, est journalisée", async () => {
    await assert.rejects(authenticateAdmin("admin@demo.pharma-ai.local", "faux", "10.7.0.1"), /incorrect/);
    await authenticateAdmin("admin@demo.pharma-ai.local", process.env.DEMO_PHARMACY_PASSWORD!, "10.7.0.2");
    const actions = (await db.auditLog.findMany({ where: { action: { startsWith: "ADMIN_LOGIN" } } })).map((l) => l.action).sort();
    assert.deepEqual(actions, ["ADMIN_LOGIN", "ADMIN_LOGIN_FAILED"]);
    assert.ok((await db.auditLog.findMany({ where: { action: { startsWith: "ADMIN_LOGIN" } } })).every((l) => !l.note?.includes("10.7.0")), "pas d'adresse IP en clair");
  });

  test("dès qu'un vrai administrateur est configuré, l'administrateur de démonstration est désactivé", async () => {
    execSync("npx tsx prisma/seed.ts", { stdio: "ignore", env: { ...process.env, ADMIN_EMAIL: "direction@example.com", ADMIN_PASSWORD: "un-mot-de-passe-tres-long" } });
    assert.equal((await db.adminUser.findUniqueOrThrow({ where: { email: "admin@demo.pharma-ai.local" } })).active, false);
    await assert.rejects(authenticateAdmin("admin@demo.pharma-ai.local", process.env.DEMO_PHARMACY_PASSWORD!, "10.7.0.3"), /incorrect/);
    assert.ok(await authenticateAdmin("direction@example.com", "un-mot-de-passe-tres-long", "10.7.0.4"));
  });
});
