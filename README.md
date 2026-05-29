# 🤖 KunKun (クンクン)

KunKun est un bot Discord dédié à l'**analyse de sécurité et de qualité de code** pour des dépôts GitHub et GitLab. Il
intègre plusieurs outils d'analyse reconnus et les expose directement dans Discord via des interfaces interactives.

## Fonctionnalités

- **SonarQube** — Analyse de qualité du code : bugs, vulnérabilités, code smells, couverture, duplications
- **Semgrep** — Analyse de sécurité basée sur les règles OWASP Top 10
- **TruffleHog** — Détection de secrets et credentials exposés dans le code source
- **Pipeline** — Scan des logs de CI/CD (GitHub Actions / GitLab CI) à la recherche de secrets

Chaque analyse produit un rapport interactif dans Discord (menus déroulants, boutons, détails par finding) ainsi qu'un *
*rapport PDF** téléchargeable.

---

## Prérequis

- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/)
- [Docker](https://www.docker.com/) (avec le daemon actif)

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/DorianRena/KunKun.git
cd KunKun
npm install
```

### 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
# Discord
DISCORD_TOKEN=votre_token_discord
CLIENT_ID=votre_client_id_discord # pour le déploiement des commandes en dev
GUILD_ID=votre_guild_id_discord   # pour le déploiement des commandes en dev

# SonarQube
SONAR_TOKEN=votre_token_sonarqube

# (Optionnel) Tokens pour l'analyse des pipelines CI/CD
GITHUB_TOKEN=votre_token_github
GITLAB_TOKEN=votre_token_gitlab

# (Optionnel) Empêcher l'arrêt des containers Docker à l'extinction du bot
# Par défaut (true) : SonarQube et PostgreSQL sont arrêtés proprement à chaque extinction
# Mettre à false pour les garder actifs entre les redémarrages (plus rapide en développement)
DOCKER_STOP_CONTAINERS_ON_SHUTDOWN=true
```

> **Note :** Le token Discord se crée sur le [Discord Developer Portal](https://discord.com/developers/applications).

### Obtenir le token SonarQube

Le token SonarQube ne peut être généré qu'**après** le premier démarrage du bot, car c'est lui qui lance le serveur
SonarQube automatiquement.

**Étape 1 — Premier démarrage sans token Sonar**

Lancez le bot une première fois sans renseigner `SONAR_TOKEN`. SonarQube va démarrer et être accessible sur
`http://localhost:9000`. Ignorez l'erreur de validation au démarrage, le serveur tourne quand même.

**Étape 2 — Connexion à SonarQube**

Ouvrez `http://localhost:9000` dans votre navigateur.

Connectez-vous avec les identifiants par défaut :

- Login : `admin`
- Mot de passe : `admin`

SonarQube vous demandera de changer le mot de passe lors de la première connexion.

**Étape 3 — Générer un token d'accès**

1. Cliquez sur votre avatar en haut à droite → **My Account**
2. Allez dans l'onglet **Security**
3. Dans la section **Generate Tokens**, saisissez un nom (ex: `kunkun-bot`)
4. Choisissez le type **User Token**
5. Cliquez sur **Generate**
6. **Copiez le token immédiatement** — il ne sera plus affiché après.

**Étape 4 — Renseigner le token**

Ajoutez le token dans votre `.env` :

```env
SONAR_TOKEN=squ_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Puis redémarrez le bot :

```bash
npm run start
```

### 3. Déployer les commandes Slash

```bash
npm run deploy-commands
```

### 4. Lancer le bot

```bash
npm run start
```

Au démarrage, KunKun :

1. Lance automatiquement les containers Docker nécessaires (PostgreSQL, SonarQube)
2. Télécharge les images Docker manquantes (Semgrep, TruffleHog, sonar-scanner-cli, etc.)
3. Connecte le bot à Discord

> **Premier démarrage :** le téléchargement des images Docker (Semgrep, TruffleHog, SonarQube, sonar-scanner-cli, etc.)
> peut prendre plusieurs minutes selon la connexion.
>
> **À chaque démarrage :** SonarQube nécessite un temps de démarrage important (jusqu'à 2 minutes). Ce délai se produit
> à chaque redémarrage du bot, sauf si `DOCKER_STOP_CONTAINERS_ON_SHUTDOWN=false` est défini — dans ce cas les
> containers
> restent actifs entre les redémarrages et SonarQube est déjà prêt.
---

## Utilisation

### Commandes disponibles

| Commande       | Description                                                       |
|----------------|-------------------------------------------------------------------|
| `/analyse`     | Lance une analyse complète sur un dépôt                           |
| `/modal`       | Lance une analyse via un formulaire interactif (choix des outils) |
| `/github_info` | Affiche les informations publiques d'un dépôt GitHub              |
| `/sonar_rule`  | Affiche le détail d'une règle SonarQube par sa clé                |
| `/ping`        | Vérifie que le bot est en ligne                                   |
| `/reload`      | Recharge une commande sans redémarrer le bot                      |

---

### `/analyse` — Analyse rapide

```
/analyse url:<url_du_dépôt> [branch:<branche>] [commit:<true|false>]
```

Lance les quatre analyses (Sonar, Semgrep, TruffleHog, Pipeline) sur le dépôt.

L'option `commit` contrôle le mode de clone :

| `commit`         | Comportement                                                                                                                            |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `false` (défaut) | Clone superficiel (`--depth=1`), plus rapide. TruffleHog scanne les fichiers présents.                                                  |
| `true`           | Clone complet avec tout l'historique git, plus lent. TruffleHog scanne commit par commit — détecte les secrets supprimés dans le passé. |

**Exemples :**

```
/analyse url:https://github.com/user/repo
/analyse url:https://gitlab.com/org/projet branch:develop
/analyse url:https://github.com/user/repo commit:true
```

> **Contraintes :**
> - Seuls les **dépôts publics** sont supportés — aucune authentification n'est transmise lors du clone
> - L'URL doit être en **HTTPS** (pas SSH), sans token embarqué
> - Formats acceptés : `https://github.com/owner/repo` et `https://gitlab.com/owner/repo` (le `.git` final est
    facultatif)

---

### `/modal` — Analyse avec sélection des outils

Ouvre un formulaire permettant de :

- Saisir l'URL du dépôt et la branche
- Choisir les analyses à exécuter parmi : Sonar, Semgrep, TruffleHog, Pipeline
- Activer ou non l'analyse de l'historique des commits (équivalent à l'option `commit` de `/analyse`)

---

### Naviguer dans les rapports

Une fois l'analyse terminée, chaque rapport est interactif :

- **SonarQube** : menu déroulant pour filtrer par type (Bugs / Vulnérabilités / Code Smells), puis sélectionner un
  problème individuel et consulter la règle associée. Les fichiers Java sont exclus de l'analyse.
- **Semgrep** : filtre par sévérité (ERROR / WARNING / INFO), puis détail par finding avec lien vers le fichier
- **TruffleHog** : filtre par type de secret détecté, puis détail par occurrence avec statut de vérification. Avec
  `commit:true`, TruffleHog scanne l'ensemble de l'historique git et peut détecter des secrets supprimés dans le passé —
  chaque finding inclut alors le commit concerné.- **Pipeline** : filtre par type de secret dans les logs CI/CD, avec
  contexte de la ligne incriminée et lien vers le
  run. Seuls les **5 derniers runs** sont analysés.

Le bouton **📄 Télécharger le rapport PDF** en bas de chaque analyse permet de récupérer un rapport complet (disponible
pendant 5 minutes).

Le PDF est nommé `{date}-{projectKey}-report.pdf` (ex: `2026-05-29-github-user-repo-report.pdf`) et contient :

- **Page de couverture** — KPIs globaux (nombre d'outils, total findings, nombre de critiques) et sommaire
- **Section SonarQube** — Quality Gate, notes de fiabilité/sécurité/maintenabilité, répartition des issues par sévérité
  et type, top 8 fichiers les plus touchés, liste groupée par règle et tableau détaillé
- **Section Semgrep** — tableau des vulnérabilités avec références OWASP et CWE
- **Section TruffleHog** — tableau des secrets détectés avec valeurs anonymisées (4 premiers + 4 derniers caractères,
  reste masqué)
- **Section Pipeline** — findings par type avec liens vers les runs CI/CD et contexte de commit

Les fichiers référencés dans le PDF sont des **liens cliquables** pointant directement vers la ligne correspondante sur
GitHub ou GitLab.

---

## Architecture

```
kunkun/
├── index.js                    # Point d'entrée, gestion des interactions Discord
├── deploy-commands.js          # Script de déploiement des commandes Slash
├── config.js                   # Configuration centralisée (env vars)
├── commands/
│   ├── git/                    # Commandes d'analyse (analyse, modal, github_info)
│   └── utility/                # Commandes utilitaires (ping, reload, sonar_rule)
├── utility/
│   ├── analyse.js              # Orchestrateur principal des analyses
│   ├── docker/                 # Wrappers Docker (git-clone, sonar, semgrep, trufflehog)
│   ├── sonar/                  # Intégration SonarQube (API, rapport interactif)
│   ├── semgrep/                # Intégration Semgrep (analyse, rapport interactif)
│   ├── trufflehog/             # Intégration TruffleHog (analyse, rapport interactif)
│   ├── pipeline/               # Scan des logs CI/CD (GitHub Actions & GitLab CI)
│   ├── pdf/                    # Génération et envoi du rapport PDF
│   └── git/                    # Utilitaires Git (validation URL, pipeline logs)
└── tools/
    ├── eclipse-temurin-cnes/   # Image Docker pour le rapport CNES SonarQube
    └── python-reportlab/       # Image Docker pour la génération PDF
```

Chaque analyse s'exécute dans un **container Docker éphémère** et isolé sur le code cloné dans un volume temporaire,
supprimé automatiquement à la fin.

> **Note — Cache en mémoire :** Les résultats des analyses (utilisés par les menus interactifs Discord) sont stockés en
> mémoire dans le processus Node.js. Un redémarrage du bot efface ce cache — les menus déroulants des analyses passées
> ne
> fonctionneront plus et afficheront une erreur « résultats expirés ».