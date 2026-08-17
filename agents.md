# Configuration et Vue d'ensemble du Projet - Hofeti (immobilier-saas_be)

Ce document fournit une vue d'ensemble de l'architecture du projet, de sa stack technique, des commandes disponibles, ainsi que des conventions de développement implicitement suivies dans le code source.

## 1. Arborescence du Projet

Le projet suit une structure modulaire NestJS classique :

```
immobilier-saas_be/
├── .cache/                       # Cache local (données de profil Puppeteer, etc.)
├── .cursor/                      # Configuration Cursor
├── .vscode/                      # Configuration VS Code
│   └── settings.json             # Paramètres d'espace de travail
├── dist/                         # Dossier de build (fichiers JS compilés)
├── immobilier-saas/              # Collection de requêtes API Bruno (.bru) pour les tests d'endpoints
├── prisma/                       # Configuration de la base de données (Prisma ORM)
│   ├── migrations/               # Fichiers de migration SQL générés
│   ├── schema.prisma             # Schéma de modélisation des entités PostgreSQL et Enums
│   └── seed.ts                   # Script de seeding (génération de données de test en Français via Faker)
├── src/                          # Code source principal (NestJS)
│   ├── main.ts                   # Point d'entrée de l'application (bootstrap)
│   ├── app.module.ts             # Module racine configurant les modules de fonctionnalités et les guards globaux
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── auth/                     # Authentification (JWT, stratégies Passport, décorateurs, guards)
│   ├── billing/                  # Gestion de la facturation et intégration des webhooks Stripe
│   ├── common/                   # Éléments partagés (DTOs de base)
│   ├── contracts/                # Gestion des contrats de bail (conformes à la réglementation togolaise)
│   ├── dashboard/                # Calcul et agrégation des statistiques du tableau de bord
│   ├── email/                    # Envoi d'e-mails de service (Nodemailer, serveurs SMTP)
│   ├── expenses/                 # Enregistrement et suivi des dépenses
│   ├── invoices/                 # Gestion des factures (loyers, cautions, charges, pénalités)
│   ├── managers/                 # Profils et contrats des gestionnaires de biens
│   ├── owners/                   # Profils des propriétaires
│   ├── pdf/                      # Moteurs de rendu et de génération de PDF (Puppeteer)
│   ├── prisma/                   # Module d'abstraction et de connexion Prisma
│   ├── properties/               # Gestion des biens immobiliers (immeubles, villas, appartements...)
│   ├── rentals/                  # Gestion des sous-unités de location (studios, appartements, magasins...)
│   ├── sms/                      # Envoi de SMS / OTP (Twilio et AfricasTalking)
│   ├── storage/                  # Moteurs de stockage de fichiers (Cloudinary et squelette S3)
│   ├── tenants/                  # Profils des locataires
│   ├── types/                    # Déclarations de types globaux (ex: types pour AfricasTalking)
│   └── users/                    # Profils des utilisateurs et gestion administrative
├── test/                         # Tests d'intégration et de bout en bout (e2e)
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── .env                          # Configuration des variables d'environnement
├── .gitignore
├── .prettierrc                   # Configuration des règles Prettier
├── eslint.config.mjs             # Configuration ESLint (Flat Config)
├── nest-cli.json                 # Configuration globale de NestJS CLI
├── package.json                  # Fichier des métadonnées, scripts et dépendances
├── pnpm-lock.yaml                # Fichier de verrouillage des versions des paquets pnpm
├── tsconfig.build.json           # Configuration TS spécifique pour le build
└── tsconfig.json                 # Configuration TS globale de l'application
```

---

## 2. Stack Technique Détectée

Le projet est une application backend conçue avec les technologies suivantes :

*   **Runtime & Package Manager** : Node.js (via `pnpm`).
*   **Langage** : TypeScript avec support des décorateurs expérimentaux.
*   **Framework principal** : NestJS (v11.0.1) basé sur Express.
*   **Base de données & ORM** : PostgreSQL, géré via Prisma ORM (v6.6.0).
*   **Authentification et Autorisations** :
    *   Passport (`@nestjs/passport`) avec les stratégies `jwt` et `local`.
    *   Gestion des hashs de mots de passe via `bcryptjs`.
    *   Garde globale à deux niveaux : vérification du JWT (`JwtAuthGuard`) suivie de la vérification du rôle (`RolesGuard`).
*   **Validation des données** : Validation automatisée des DTOs par `class-validator` et `class-transformer` injectés via le `ValidationPipe` global.
*   **Moteurs configurables (Dynamic Engines & Providers)** :
    *   **Stockage de fichiers** : Configuration via `STORAGE_ENGINE` (support de `cloudinary` et d'une structure pour `s3`).
    *   **Génération PDF** : Configuration via `PDF_ENGINE` (support actif de `puppeteer` pour transformer des templates HTML en PDF A4).
    *   **Envoi de SMS / OTP** : Configuration via `SMS_PROVIDER` (support de `africastalking` et `twilio`).
    *   **Mails** : Envoi SMTP standard via `nodemailer`.
*   **Facturation & Paiement** : Intégration de l'API `stripe` (gestion des signatures de webhooks, création de `PaymentIntent`).
*   **API Client & Tests** : Collection Bruno (.bru) sous le dossier `immobilier-saas` pour simuler et valider le comportement des routes.

---

## 3. Commandes de Build, de Base de données et de Test

Les scripts définis dans le fichier `package.json` sont les suivants :

### Installation des dépendances
```bash
pnpm install
```

### Initialisation et Génération Prisma (Post-Install automatique)
```bash
pnpm run postinstall    # Génère le client Prisma local
pnpm run db:seed        # Injecte les données de test Faker dans la base de données
```

### Build et Démarrage
```bash
pnpm run build          # Compile l'application en JavaScript dans le dossier /dist
pnpm run start          # Lance l'application
pnpm run start:dev      # Lance l'application en mode "watch" (rechargement automatique)
pnpm run start:debug    # Lance l'application avec un inspecteur de débogage
pnpm run start:prod     # Démarre l'application compilée (/dist/main.js)
```

### Formatage et Qualité (Linters)
```bash
pnpm run format         # Formate le code avec Prettier
pnpm run lint           # Analyse le code avec ESLint et corrige les erreurs
```

### Tests
```bash
pnpm run test           # Exécute les tests unitaires avec Jest
pnpm run test:watch     # Exécute les tests unitaires en mode "watch"
pnpm run test:cov       # Génère la couverture de tests unitaires
pnpm run test:e2e       # Exécute les tests de bout en bout (e2e) configurés dans /test
```

---

## 4. Conventions de Code Implicites

Voici les règles et conventions observées dans la base de code existante :

### A. Structure Modulaire
*   Chaque domaine fonctionnel (ex : `contracts`, `users`) possède son propre dossier sous `src/` contenant :
    *   Un fichier `*.module.ts` centralisant les dépendances.
    *   Un fichier `*.controller.ts` pour définir les routes HTTP, les rôles requis (`@Roles`), et appeler le service associé.
    *   Un fichier `*.service.ts` contenant la logique métier.
    *   Un sous-dossier `dto/` contenant les structures de transfert de données `create-*.dto.ts` et `update-*.dto.ts`.

### B. Choix Linguistique
*   **Code technique** : Toutes les variables, classes, interfaces, méthodes et modèles de données (Prisma) sont écrits en **anglais** (ex : `UsersService`, `rentAmount`, `LeaseType`).
*   **Messages et Exceptions utilisateur** : Les messages d'exception HTTP et de succès renvoyés au client ainsi que les commentaires explicatifs sont écrits en **français** (ex : `throw new NotFoundException('Utilisateur non trouvé')`, `// Mise à jour de ses propres infos`).

### C. Sécurité et Contexte de Requête
*   Les routes d'écriture ou de consultation restreinte exploitent le rôle de l'utilisateur via le décorateur personnalisé `@Roles(...)`.
*   L'identifiant de l'utilisateur connecté et son organisation (`organizationId`) sont systématiquement récupérés à l'aide du décorateur `@GetCurrentUser() user: RequestUser` pour contraindre les requêtes SQL (principe du multi-tenant).
*   Exemple typique :
    ```typescript
    @Post()
    @Roles(UserRole.ADMIN)
    create(@Body() createContractDto: CreateContractDto, @GetCurrentUser() user: RequestUser) {
        return this.contractsService.create(user.id, createContractDto);
    }
    ```

### D. Gestion des Erreurs et Exceptions
*   Les erreurs systèmes internes ou de contraintes de clé unique (ex : code Prisma `P2002`) sont enveloppées par des blocs `try/catch` dans les services pour être transformées en exceptions HTTP explicites de NestJS (`ConflictException`, `NotFoundException`, `ForbiddenException`).
*   Toutes les routes paramétrées avec des IDs numériques utilisent le pipe de transformation de NestJS `ParseIntPipe` (ex : `@Param('id', ParseIntPipe) id: number`).
