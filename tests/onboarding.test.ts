// Évolution étape 5 : inscription = demande, jamais vérification. Rien n'est visible ni actif avant validation.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../src/lib/db";
import { authenticateCourier } from "../src/lib/services/accounts";
import { courierAccept } from "../src/lib/services/orders";
import { addDocuments, decide, registerCourier, registerPharmacy, sniffMime, verificationQueue } from "../src/lib/services/onboarding";
import { searchPharmacies } from "../src/lib/services/search";
import { resetDatabase } from "./helpers";

let admin: { id: string };
before(async () => {
  await resetDatabase();
  admin = await db.adminUser.findFirstOrThrow();
});
after(() => db.$disconnect());

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const pdf = new TextEncoder().encode("%PDF-1.4 piece");
const file = (kind: string, bytes = jpeg) => ({ kind, name: `${kind}.jpg`, type: "image/jpeg", bytes });

let n = 0;
const pharmacyForm = () => ({
  name: `Pharmacie Test ${++n}`,
  licenseNumber: "AUT-2026-001",
  ownerName: "Dr Afi Houngbo",
  address: "Rue 214",
  district: "Akpakpa",
  city: "Cotonou",
  offersDelivery: true,
  email: `pharma${n}@exemple.bj`,
  password: "Baobab-Ganvie-26",
  phone: "+229 01 97 00 00 0" + (n % 10),
  consent: true,
});
const courierForm = (vehicle: "MOTO" | "VELO") => ({
  name: "Koffi Test",
  city: "Cotonou",
  zone: "Akpakpa",
  vehicle,
  idNumber: "CNI123456",
  email: `livreur${++n}@exemple.bj`,
  password: "Baobab-Ganvie-26",
  phone: "+229 01 96 00 00 01",
  consent: true,
});

describe("Inscription d'une pharmacie", () => {
  test("seuls les vrais PDF et photos sont acceptés", async () => {
    assert.equal(sniffMime(jpeg), "image/jpeg");
    assert.equal(sniffMime(pdf), "application/pdf");
    assert.equal(sniffMime(new TextEncoder().encode("<html>")), null);
    await assert.rejects(registerPharmacy(pharmacyForm(), [file("PHARMACY_LICENSE", new TextEncoder().encode("<script>")), file("OWNER_ID")]), /seules les photos/);
    await assert.rejects(registerPharmacy(pharmacyForm(), [file("OWNER_ID")]), /Pièce obligatoire manquante : Autorisation/);
    await assert.rejects(registerPharmacy({ ...pharmacyForm(), consent: false }, [file("PHARMACY_LICENSE"), file("OWNER_ID")]), /certifier/);
  });

  test("un dossier reçu n'est ni visible ni commandable, jusqu'à la validation", async () => {
    const { pharmacy } = await registerPharmacy(pharmacyForm(), [{ ...file("PHARMACY_LICENSE", pdf), name: "licence.pdf" }, file("OWNER_ID")], "1.1.1.1");
    assert.equal(pharmacy.verificationStatus, "PENDING");
    assert.equal(pharmacy.active, false);
    const visible = async () => (await searchPharmacies({ point: { lat: pharmacy.lat, lng: pharmacy.lng }, radiusKm: 30 })).some((r) => r.pharmacy.id === pharmacy.id);
    assert.equal(await visible(), false);
    assert.ok((await verificationQueue()).some((r) => r.id === pharmacy.id));

    await assert.rejects(decide(admin.id, "PHARMACY", pharmacy.id, "NEEDS_INFO", { note: " " }), /Expliquez/);
    await decide(admin.id, "PHARMACY", pharmacy.id, "NEEDS_INFO", { note: "Licence illisible." });
    await assert.rejects(decide(admin.id, "PHARMACY", pharmacy.id, "SUSPEND", { note: "x" }), /Action impossible/);
    await addDocuments("PHARMACY", pharmacy.id, [file("PHARMACY_LICENSE")]);
    assert.equal((await db.pharmacy.findUniqueOrThrow({ where: { id: pharmacy.id } })).verificationStatus, "PENDING", "un dossier complété repart en vérification");

    await decide(admin.id, "PHARMACY", pharmacy.id, "APPROVE", { lat: 6.36, lng: 2.44 });
    const approved = await db.pharmacy.findUniqueOrThrow({ where: { id: pharmacy.id } });
    assert.equal(approved.active, true);
    assert.ok(approved.verifiedAt);
    assert.equal(approved.lat, 6.36, "position corrigée par l'administrateur");
    assert.equal(await visible(), true);
    await assert.rejects(decide(admin.id, "PHARMACY", pharmacy.id, "APPROVE"), /Action impossible/, "pas de double validation");

    await decide(admin.id, "PHARMACY", pharmacy.id, "SUSPEND", { note: "Contrôle en cours." });
    assert.equal(await visible(), false, "une pharmacie suspendue disparaît");
    const actions = (await db.auditLog.findMany({ where: { entity: `Pharmacy:${pharmacy.id}` } })).map((l) => l.action);
    for (const a of ["SIGNUP_SUBMITTED", "VERIFICATION_NEEDS_INFO", "DOCUMENTS_ADDED", "VERIFICATION_APPROVE", "VERIFICATION_SUSPEND"]) assert.ok(actions.includes(a), a);
    await assert.rejects(addDocuments("PHARMACY", pharmacy.id, [file("OWNER_ID")]), /n'accepte plus/);
  });

  test("une adresse déjà utilisée est refusée", async () => {
    const form = pharmacyForm();
    await registerPharmacy(form, [file("PHARMACY_LICENSE"), file("OWNER_ID")], "2.2.2.2");
    await assert.rejects(registerPharmacy({ ...form, name: "Autre" }, [file("PHARMACY_LICENSE"), file("OWNER_ID")], "2.2.2.2"), /existe déjà/);
  });
});

describe("Inscription d'un livreur", () => {
  test("permis exigé pour une moto, pas pour un vélo", async () => {
    await assert.rejects(registerCourier(courierForm("MOTO"), [file("ID_CARD"), file("PHOTO")], "3.3.3.3"), /Permis de conduire/);
    const c = await registerCourier(courierForm("VELO"), [file("ID_CARD"), file("PHOTO")], "3.3.3.3");
    assert.equal(c.verificationStatus, "PENDING");
  });

  test("un livreur non vérifié se connecte mais ne peut prendre aucune mission", async () => {
    const form = courierForm("MOTO");
    const c = await registerCourier(form, [file("ID_CARD"), file("PHOTO"), file("DRIVING_LICENSE")], "4.4.4.4");
    assert.equal((await authenticateCourier(form.email, form.password, "4.4.4.4")).id, c.id);
    await assert.rejects(courierAccept(c.id, "commande-quelconque"), /inactif/);
    await decide(admin.id, "COURIER", c.id, "APPROVE");
    await assert.rejects(courierAccept(c.id, "commande-quelconque"), /plus disponible/, "validé : il peut désormais accepter");
    await decide(admin.id, "COURIER", c.id, "SUSPEND", { note: "Retards répétés." });
    await assert.rejects(courierAccept(c.id, "commande-quelconque"), /inactif/);
    assert.ok(await authenticateCourier(form.email, form.password, "4.4.4.4"), "suspendu, il peut encore se connecter pour lire son statut");
  });

  test("un compte livreur désactivé hors vérification reste refusé", async () => {
    const legacy = await db.courier.findFirstOrThrow({ where: { email: "livreur@demo.pharma-ai.local" } });
    await db.courier.update({ where: { id: legacy.id }, data: { active: false } });
    await assert.rejects(authenticateCourier(legacy.email, "x"), /incorrect/);
    await db.courier.update({ where: { id: legacy.id }, data: { active: true } });
  });
});
