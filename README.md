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
npm test          # 48 tests (acceptation, sécurité, zone de recherche, réglages, stock, confirmation)
npm run build && npm run test:e2e   # parcours complet dans Chromium (15 étapes : livreur, administration, import de stock et confirmation en deux temps compris)
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

## Stock numérique

Depuis `/pharmacie/stock`, la pharmacie recherche et filtre son stock, ajoute ou retire un produit du référentiel, modifie prix, quantité et disponibilité, et exporte le tout en CSV ou Excel. L'import (CSV ou .xlsx, 2 Mo, 5000 lignes) se fait en deux temps : un rapport classe chaque ligne (correcte, incorrecte, produit inconnu, doublon, champ manquant, erreur de format), puis seules les lignes correctes sont publiées, sur confirmation. Un fichier exporté peut être corrigé et réimporté tel quel. Un produit absent du référentiel n'est jamais créé par un import : la classification réglementaire reste décidée par Pharma AI Connect.

## Commande en deux temps

Le stock numérique n'engage pas la pharmacie. Toute commande commence donc par une vérification physique : pour chaque produit, la pharmacie répond Disponible, Quantité insuffisante (avec la quantité réelle), Indisponible, Nécessite validation du pharmacien ou Autre précision, confirme le prix et indique si elle autorise le retrait, la livraison ou les deux. Le client reçoit une notification avec le lien vers sa commande, voit les produits retenus et leurs prix, puis clique « Je confirme ma commande » en choisissant retrait ou livraison. Rien n'est payé avant cet accord, qui est horodaté dans l'historique (« Autorisation client : CONFIRMÉE »). Une livraison se règle en ligne ; un produit sur ordonnance exige la validation du pharmacien et se retire en pharmacie. Chaque écran indique qui doit agir à l'étape en cours.

## Panier multi-pharmacies et clôture

Le panier (cookie, sans compte) peut contenir des produits de plusieurs pharmacies. À la validation, une commande est créée par pharmacie, chacune vérifiée et confirmée séparément ; une page de suivi groupée (référence PAN-…) les rassemble. Les produits à délivrance encadrée ne peuvent pas y entrer.

Une commande n'est terminée que lorsque toutes les parties l'ont clôturée. En retrait, la pharmacie clôture en validant le code du client. En livraison, la pharmacie confirme la remise au livreur (le livreur ne peut pas partir avant), puis le livreur clôture en validant le code du client. Le client clique enfin « J'ai bien reçu ma commande » ou signale un problème, qui laisse la commande ouverte et prévient la pharmacie.

## Inscriptions vérifiées

Une pharmacie (`/pharmacie/inscription`) ou un livreur (`/livreur/inscription`) s'inscrit avec ses pièces justificatives : photos ou PDF, 2 Mo au plus chacune. Le type réel de chaque fichier est contrôlé, et les photos sont allégées dans le navigateur avant l'envoi. Les pièces sont stockées en base et ne sont consultables que par l'administration.

S'inscrire ne vaut pas vérification :
- tant qu'un administrateur n'a pas validé le dossier dans `/admin/inscriptions`, la pharmacie reste invisible et ne peut pas recevoir de commandes ;
- de même, le livreur ne voit aucune mission et ne peut en accepter aucune ;
- le demandeur se connecte pour suivre son statut et compléter son dossier.

L'administrateur peut valider (en corrigeant la position sur la carte), demander des compléments, refuser, suspendre ou réactiver. Chaque décision est expliquée au demandeur et inscrite au journal d'audit. Les problèmes signalés par les clients à la réception sont listés dans `/admin/reclamations`.

## Frais, grand livre et gains des livreurs

Tous les montants viennent des réglages de l'administration et peuvent être définis pays par pays.

**Frais de livraison.** Ils se calculent ainsi : prise en charge, plus un tarif au kilomètre entre la pharmacie et le quartier de l'adresse, avec un plancher minimum, un supplément de nuit et un arrondi. Quand le quartier n'est pas reconnu, une distance forfaitaire est retenue. Une adresse au-delà de la zone de livraison de la pharmacie est refusée.

**Frais de service.** Ils s'appliquent une fois par panier, ou pour chaque pharmacie, selon le réglage choisi. Les montants sont figés sur la commande au moment où le client la confirme.

**Grand livre** (`LedgerEntry`). À la remise de chaque commande, quatre écritures sont créées :
- les ventes de la pharmacie ;
- les frais de service ;
- la commission de la plateforme sur la livraison ;
- le gain du livreur.

Un déclencheur PostgreSQL, installé par le seed, interdit toute modification ou suppression d'une écriture. Une correction s'ajoute toujours en écriture inverse.

**Gains des livreurs** (`/livreur/gains`). Le livreur voit son solde et ses gains du jour, de la semaine et depuis le début. Il peut demander un retrait à partir du seuil fixé dans les réglages, par Mobile Money ou Moov Money.

**Traitement des retraits** (`/admin/finances`). L'administration :
- ne peut marquer un retrait comme payé qu'avec la référence de la transaction ;
- peut le refuser, et le montant est alors recrédité au livreur.

## Abonnements des pharmacies et avis

**Essai et formules.** Une pharmacie validée commence par un essai gratuit, dont la durée est un réglage. Elle choisit ensuite sa formule dans `/pharmacie/abonnement` :
- un forfait mensuel, trimestriel ou annuel ;
- ou le modèle sans abonnement, facturé chaque mois en pourcentage des ventes inscrites au grand livre.

Tous les montants et délais sont des réglages de l'administration. Les pharmacies de démonstration ne sont jamais facturées.

**Facturation quotidienne.** La route `/api/cron/billing`, déclarée dans `vercel.json` et protégée par `CRON_SECRET`, tourne chaque jour :
- elle émet la facture de renouvellement quelques jours avant l'échéance (rappel) ;
- elle passe la pharmacie en retard à l'échéance ;
- elle la suspend automatiquement après le délai de grâce. Une pharmacie suspendue disparaît de la recherche et ne reçoit plus de commandes, mais garde l'accès à son espace pour payer.

Une facture n'est réglée que sur preuve : soit un paiement confirmé par le prestataire, soit une référence de transaction saisie par l'administration dans `/admin/abonnements`. Le règlement réactive la pharmacie immédiatement.

À configurer sur Vercel : la variable `CRON_SECRET`. Sans elle, la route refuse de s'exécuter. L'administration peut aussi lancer la facturation à la main.

**Avis.** Une fois la commande clôturée, le client peut noter la pharmacie et le livreur, une seule fois par commande. La note moyenne et les derniers commentaires s'affichent sur la fiche de la pharmacie. L'administration peut masquer un avis depuis « Réclamations ».

## Limites connues de cette version

- Paiement en ligne : prestataire simulé (`PAYMENT_PROVIDER=sandbox`). Brancher un vrai prestataire Mobile Money / carte revient à appeler `applyPaymentResult` depuis son webhook signé.
- Pas de téléversement d'ordonnance : l'ordonnance originale est vérifiée au comptoir (collecte de données de santé réduite au strict nécessaire).
- Les zones géographiques reconnues sont celles de la table `Zone` (quartiers de Cotonou en démo).

## Sécurité

Protections en place et réglages à faire dans Vercel : voir [SECURITE.md](SECURITE.md).
