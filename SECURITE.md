# Sécurité de Pharma AI Connect

Ce document décrit les protections en place et ce qui reste à régler dans Vercel. À relire avant chaque mise en production importante.

## Reverse proxy : déjà fourni par Vercel

Sur Vercel, aucune requête n'atteint directement le code du site : elle passe d'abord par le réseau Vercel (« Edge »), qui joue exactement le rôle d'un reverse proxy :

- terminaison HTTPS (certificats automatiques, TLS 1.2+) ;
- protection anti-DDoS de niveau réseau, active d'office ;
- réécriture des en-têtes d'adresse IP (`x-forwarded-for`, `x-real-ip`) : un visiteur ne peut pas se faire passer pour une autre adresse ;
- pare-feu applicatif (Vercel Firewall / WAF) configurable dans le tableau de bord.

Ajouter un proxy séparé (Nginx, Cloudflare devant Vercel…) doublerait les coûts et la latence sans rien apporter ici, et casserait la lecture fiable de l'adresse IP. Le site ajoute par-dessus son propre filtre (`src/middleware.ts`), exécuté sur l'Edge avant chaque page.

## Protections en place dans le code

| Domaine | Protection |
| --- | --- |
| En-têtes | CSP à nonce unique par requête (`script-src 'self' 'nonce-…' 'strict-dynamic'`, aucune ressource tierce, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`), HSTS 2 ans, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP. Pages à lien secret (`/suivi`, `/demande`) : jamais indexées, jamais en cache, jamais transmises en Referer. Espaces privés : `noindex` + `no-store`. `robots.txt` exclut les espaces privés. |
| Limitation de débit | Stockée dans Postgres (partagée entre toutes les instances Vercel), enregistrée avant d'être comptée pour résister aux rafales parallèles. Connexions : par adresse IP **et** par compte visé (client, pharmacie, livreur, admin). Inscriptions client / pharmacie / livreur, commandes, panier, demandes de vérification, messages, codes SMS/e-mail : plafonnés. |
| Sessions | Jetons signés HS256 (algorithme imposé), cookies `HttpOnly`, `Secure`, `SameSite=Lax` (`Strict` pour l'administration). Chaque session a un identifiant : la déconnexion la révoque côté serveur (un cookie copié devient inutilisable). Durées : admin 8 h, pharmacie/livreur 12 h, client 30 jours. |
| Mots de passe | bcrypt ; 8 caractères minimum et refus des mots de passe les plus courants. Réponse en temps constant que l'e-mail existe ou non. |
| Contrôle d'accès | Middleware par espace (pharmacie, livreur, admin, compte) + contrôle systématique dans chaque page et chaque action serveur ; toutes les requêtes sont filtrées par la pharmacie / le client connecté (pas d'accès à la commande d'un autre en changeant un identifiant). Commandes invitées : jeton de suivi de 256 bits, seul son empreinte est stockée. |
| CSRF | Actions serveur Next.js : vérification automatique de l'origine. Aucune route `GET` ne modifie de données. Cookies `SameSite`. |
| Entrées | Validation zod de tous les formulaires ; requêtes Prisma paramétrées (pas d'injection SQL) ; React échappe tout l'affichage. |
| Fichiers | Pièces justificatives : 2 Mo max, type réel vérifié sur les octets (JPEG, PNG, WebP, PDF), nom nettoyé, stockées en base, servies uniquement à l'admin avec une CSP `sandbox`. Imports de stock : 2 Mo, 5 000 lignes. |
| Cron | `/api/cron/billing` exige `Authorization: Bearer CRON_SECRET` (comparaison à temps constant) ; fermé tant que la variable n'existe pas. |
| Administration | Toute connexion réussie ou échouée est inscrite au journal d'audit (IP réduite à une empreinte). Dès que `ADMIN_EMAIL` est défini, l'admin de démonstration est désactivé au déploiement suivant. |
| Secrets | `AUTH_SECRET` de 32 caractères minimum, et la valeur d'exemple de `.env.example` est refusée. Aucun secret dans le code. |

## À faire dans Vercel (par le propriétaire du projet)

1. **Variables d'environnement** (Settings → Environment Variables, environnement *Production*) :
   - `AUTH_SECRET` : 64 caractères aléatoires (`openssl rand -base64 48`). Ne jamais le réutiliser ailleurs.
   - `CRON_SECRET` : 32 caractères aléatoires minimum, sinon la facturation quotidienne ne tourne pas.
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` (16 caractères ou plus) : désactive l'admin de démonstration.
   - `DEMO_PHARMACY_PASSWORD` : différent de la valeur d'exemple ; tant que les pharmacies de démo existent, ce mot de passe ouvre leurs comptes.
2. **Vercel Firewall** (onglet Firewall du projet) :
   - activer les *Managed Rulesets* / *Bot Protection* si l'offre le permet ;
   - ajouter une règle *Rate Limit* globale, par exemple 300 requêtes / minute / IP sur `/`, et 60 / minute / IP sur `/recherche` (protège la base contre l'aspiration du catalogue) ;
   - en cas d'attaque, activer *Attack Challenge Mode* (un bouton).
3. **Deployment Protection** : laisser *Vercel Authentication* activé sur les prévisualisations (elles partagent la base de production).
4. **Équipe** : activer la double authentification sur les comptes Vercel et GitHub ayant accès au projet.
5. **Base Neon** : vérifier que les sauvegardes / la restauration à un instant donné sont actives.

## Points connus, à traiter plus tard

- Pas de double authentification pour l'administration (recommandée avant d'ouvrir à plusieurs administrateurs).
- Pas de « mot de passe oublié » : à construire avec un lien à usage unique et le même limiteur.
- Le verrouillage par compte peut être déclenché par un tiers (15 minutes) : compromis standard contre le vol de mot de passe.
- `npm audit` signale des failles dans `postcss` (outil de build de Next.js), `uuid` (via `exceljs`) et `deepmerge-ts` (via Prisma) : non exploitables ici (pas de CSS ni d'objets fournis par les visiteurs à ces bibliothèques). À suivre lors des mises à jour.
