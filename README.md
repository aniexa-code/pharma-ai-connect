# Pharma AI Connect — V1.1

Recherche de médicaments et de pharmacies, vérification de disponibilité, commande, paiement et suivi **sans compte obligatoire** (cahier des charges V1.1).

> Règle officielle : rechercher sans compte, vérifier sans compte, commander sans compte et suivre sa commande sans compte.

Stack : Next.js 15 (App Router, Server Actions), Prisma + PostgreSQL (Neon via Vercel), Tailwind CSS 4, `jose` pour les sessions. Même architecture que BILLION'S Trading.

## Ce que fait la V1.1

| Exigence (§ 7) | Où |
| --- | --- |
| Recherche de pharmacies et de produits sans inscription, géolocalisation facultative, rayon | `/`, `/recherche`, `src/lib/services/search.ts` |
| Disponibilité, niveau de fiabilité et date de dernière confirmation | `src/lib/reliability.ts` |
| Demande de confirmation et échange avec la pharmacie sans compte (référence `VER-…` + lien secret) | `/demande/nouvelle`, `/demande/[jeton]`, `src/lib/services/requests.ts` |
| Commande invitée, retrait ou livraison, créneau, coordonnées minimales, aucun mot de passe | `/commander`, `src/lib/services/orders.ts` |
| Paiements en attente / confirmés / échoués / annulés / remboursés | `src/lib/services/orders.ts` (`applyPaymentResult`, `retryPayment`, remboursement à l'annulation) |
| Référence publique non prévisible `CMD-XXXX-XXXX`, identifiant interne distinct | `src/lib/crypto.ts` |
| Suivi sécurisé sans compte : lien à jeton aléatoire (256 bits), expiration, révocation, récupération par code à usage limité | `/suivi`, `/suivi/[jeton]`, `src/lib/services/tracking.ts` |
| Code de retrait / remise à usage unique, jamais stocké en clair | `handoverCode` (HMAC) + `completeHandover` |
| Notifications SMS, WhatsApp, e-mail ou lien sécurisé seul | `src/lib/notify.ts` |
| Compte facultatif : historique, suivi centralisé, adresses, favoris, préférences, suppression | `/compte` |
| Proposition de compte après commande (« Créer mon compte » / « Continuer sans compte ») | `/suivi/[jeton]?nouvelle=1` |
| Rattachement ultérieur d'une commande : depuis le lien de suivi, ou référence + code envoyé au contact | `/compte/rattacher`, `src/lib/services/accounts.ts` |
| Produits réglementés (§ 8) : ordonnance validée par le pharmacien avant paiement et retrait en pharmacie ; délivrance restreinte non commandable en ligne | `Regulation` dans `prisma/schema.prisma` |
| Espace pharmacie (centre de contrôle) : activité du jour, réponses en un geste, cycle de la commande, stock avec quantités | `/pharmacie` |
| Centre de livraison : missions libres (zone seulement), acceptation, itinéraire, remise validée par le code du client | `/livreur`, `courierAccept` dans `orders.ts` |

### Sécurité du suivi (§ 5)

- La base ne stocke que l'empreinte SHA-256 des jetons de suivi ; le code de remise est recalculé par HMAC et n'existe nulle part en clair.
- La référence de commande ne donne accès à rien : `/suivi/CMD-…` répond 404.
- Lien perdu : référence + téléphone de la commande → code à 6 chiffres envoyé au contact (10 min, 5 essais, usage unique) → nouveau lien, l'ancien est révoqué. La réponse est identique que la commande existe ou non.
- Pages à lien secret servies en `no-store`, `noindex` et `Referrer-Policy: no-referrer`.
- Anti-fraude : prix toujours relus en base, quantités plafonnées, limitation de débit par appareil et par numéro, champ piège anti-robot.
- Les SMS ne contiennent ni nom de produit ni information de santé.

## Identité visuelle

- Palette : Deep Navy `#10243B` (marque, navigation), Medical Blue `#176B87` (actions), Technology Turquoise `#28D5C2` (disponibilité, états actifs, avec parcimonie), Icy White `#F4F8FB` (fond). Jetons dans `src/app/globals.css`.
- Logo : croix formée de quatre nœuds connectés autour d'un point turquoise (`src/components/brand.tsx`, favicon `src/app/icon.svg`).
- Typographie : Manrope. Icônes : trait fin géométrique (`Icon` dans `brand.tsx`).
- Disponibilité en quatre états : Disponible (turquoise), Confirmation nécessaire (orange), Indisponible (rouge), Information ancienne (gris), toujours avec « Mis à jour il y a … » (`src/lib/availability.ts`).
- Carte : réseau abstrait en SVG, sans fournisseur de cartes ni clé d'API (`src/components/NetworkMap.tsx`). L'itinéraire ouvre Google Maps.
- Micro-animations : halo des points disponibles, passage orange → turquoise à la confirmation d'un stock, médicaments flottants dans le hero, timeline qui pulse, données rafraîchies en direct. Toutes désactivées si l'appareil demande moins d'animations.

## Démarrer en local

```bash
cp .env.example .env      # renseigner DATABASE_URL et AUTH_SECRET
npm install
npm run setup             # crée les tables et les données de démonstration
npm run dev
```

Données de démonstration : 6 pharmacies fictives à Cotonou et Abomey-Calavi (Bénin, XOF), 14 produits. Espace pharmacie : `<slug>@demo.pharma-ai.local` (ex. `pharmacie-de-ganhi@demo.pharma-ai.local`). Centre de livraison : `livreur@demo.pharma-ai.local`. Administration (`/admin`) : `ADMIN_EMAIL`, ou `admin@demo.pharma-ai.local` en démonstration. Mot de passe : `DEMO_PHARMACY_PASSWORD` (pour le changer, modifiez la variable puis redéployez : les comptes de démo sont mis à jour).

## Tests

Les tests utilisent une base PostgreSQL dont le nom contient « test » (voir `.env.test`).

```bash
npm test          # 24 tests d'acceptation et de sécurité (services)
npm run build && npm run test:e2e   # parcours complet dans Chromium (13 étapes, livreur et administration compris)
```

Le test exigé au § 9 (« personne ne peut consulter la commande d'un autre en devinant ou en connaissant son numéro ») est couvert par `tests/security.test.ts` et l'étape 7 de `tests/e2e/run.ts`.

## Déployer sur Vercel

1. Importer le dépôt dans Vercel (Framework : Next.js). La commande de build `vercel-build` crée les tables et les données de démonstration à chaque déploiement, sans écraser les données existantes.
2. Storage → Neon → créer la base : `DATABASE_URL` et `DATABASE_URL_UNPOOLED` sont ajoutées automatiquement.
3. Variables d'environnement : `AUTH_SECRET` (64 caractères aléatoires), `NEXT_PUBLIC_SITE_URL` (adresse du site), `DEFAULT_COUNTRY` (BJ par défaut), `PAYMENT_PROVIDER`, `DEMO_PHARMACY_PASSWORD`, et pour l'administration `ADMIN_EMAIL` + `ADMIN_PASSWORD`. Les anciennes variables `CURRENCY` et `TIMEZONE` sont ignorées : devise et fuseau viennent du pays.
4. Facultatif : `RESEND_API_KEY` + `MAIL_FROM` pour les e-mails, `TWILIO_*` pour les SMS et WhatsApp. Sans eux, les notifications sont enregistrées en mode « simulé » et restent visibles sur le lien de suivi.
5. `DEMO_MODE=true` affiche à l'écran les codes de vérification non envoyés : utile pour une démo, **à ne jamais activer en production réelle**.

## Réglages et administration

Aucune règle commerciale n'est figée dans le code : rayon de recherche (par défaut, proposés, maximum), validité des horaires déclarés, frais de service, barème de livraison (minimum, prise en charge, par km, supplément de nuit, regroupement), commission, seuil de retrait des livreurs, abonnements et délai de grâce se règlent dans `/admin/reglages`, pays par pays. Chaque modification est tracée (auteur, date, valeurs avant / après) dans le journal d'audit.

Une pharmacie n'est jamais affichée « ouverte » sur des données périmées : ses horaires doivent être reconfirmés depuis son espace (validité réglable), et une garde se déclare avec une heure de fin, au-delà de laquelle elle disparaît d'elle-même.

## Limites connues de cette version

- Paiement en ligne : prestataire simulé (`PAYMENT_PROVIDER=sandbox`). Brancher un vrai prestataire Mobile Money / carte revient à appeler `applyPaymentResult` depuis son webhook signé.
- Pas de téléversement d'ordonnance : l'ordonnance originale est vérifiée au comptoir (collecte de données de santé réduite au strict nécessaire).
- Les zones géographiques reconnues sont celles de la table `Zone` (quartiers de Cotonou en démo).
