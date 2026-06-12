# Songho 

Application web permettant de jouer au **Songho** (jeu de semailles à deux joueurs, type Awalé), réalisée dans le cadre du TP de Programmation Web.

Le projet propose **deux versions** :

- **V1** : deux joueurs sur le même navigateur (HTML/CSS/JS pur)
- **V2** : deux joueurs sur deux navigateurs distants, via Ajax + PHP

## Démo en ligne

|Version|Mode                    |Lien                                       |
|-------|------------------------|-------------------------------------------|
|V1     |Locale (même navigateur)|<https://songho.pages.dev/songo.html>      |
|V2     |Distante (Ajax)         |<http://songhov2-bnaa.kesug.com/songo.html>|

## Règles du jeu

Chaque joueur (Nord / Sud) possède 7 cases avec 5 graines chacune (70 graines au total). À tour de rôle, un joueur sème les graines de l’une de ses cases dans les cases suivantes, selon le cycle :

```
N0 - N1 - N2 - N3 - N4 - N5 - N6 - S6 - S5 - S4 - S3 - S2 - S1 - S0 - 
```

Si la dernière graine tombe dans une case adverse contenant 2, 3 ou 4 graines, le joueur capture ces graines (capture en chaîne possible). Des règles particulières s’appliquent : grenier (cases de plus de 13 graines), interdiction d’affamer l’adversaire, solidarité, coups interdits depuis la case d’attaque.

La partie se termine quand un joueur atteint **40 graines capturées**, qu’il reste **moins de 10 graines** sur le plateau, ou qu’un joueur n’a plus de coup légal.

Les règles complètes sont détaillées dans le document *Formalisation du jeu Songho/Songo et algorithme complet* et par le lien: *https://www.clubawale.com/post/comment-jouer-le-songo*, qui sert de référence aux deux versions.

## Architecture

### Principe directeur : moteur pur

Le cœur du jeu repose sur une règle d’or :

> Le moteur du jeu ne doit jamais lire le DOM et ne doit jamais faire d’Ajax. Il reçoit un état + un coup, et retourne un nouvel état + un résultat.

Cela permet de **réutiliser exactement le même moteur** (porté en PHP) entre la V1 et la V2.

### V1 — Local (même navigateur)

```
v1/
songo.html   # structure (config, scores, tablier, overlay)
songo.css    # mise en page, animations, responsive
songo.js     # moteur (A-H) + interface DOM (I-J)
```

|Section                 |Rôle                                                                                       |
|------------------------|-------------------------------------------------------------------------------------------|
|A. Constantes & cycle   |`RULES`, `CYCLE`, `OPPONENT_PATH`                                                          |
|B. Utilitaires          |`other`, `sum`, `samePos`, `attackPit`, `cloneState`, `assertInvariant`                    |
|C. État initial         |`createGame`                                                                               |
|D. Semaille             |`nextPositionsAfter`, `sowNormal`, `sowGranary`, `sow`                                     |
|E. Capture              |`canStartCapture`, `captureChain`, `wouldEmptyOpponent`, `applyCaptures`, `resolveCaptures`|
|F. Coups légaux         |`ownNonEmpty`, `isForbiddenAttackMove`, `getSolidarityMoves`, `getLegalMoves`              |
|G. Application d’un coup|`applyForcedDonation`, `applyMove`                                                         |
|H. Fin de partie        |`collectRemaining`, `computeWinner`, `checkEndAfterMove`, `checkEndBeforeTurn`             |
|I. Interface DOM        |rendu du tablier, messages, animations, clics                                              |
|J. Démarrage            |construction des rangées, écouteurs, `startGame()`                                         |

### V2 — Distant (Ajax + PHP)

```
v2/
songo.html        # lobby (créer/rejoindre) + zone de jeu
songo.css         # styles partagés + section lobby
songo-remote.js   # logique Ajax (polling, envoi des coups, rendu)
api/
    engine.php    # moteur du jeu — port PHP de songo.js (préfixe songho_)
    storage.php   # lecture/écriture des parties (JSON) + CORS
    new_game.php  # POST : créer une partie
    state.php     # GET  : lire l'état (polling)
    move.php      # POST : jouer un coup
    data/
         .htaccess         # interdit l'accès direct aux fichiers JSON
         <game_id>.json    # généré automatiquement par partie
```

**Fonctionnement :**

1. Le joueur **Sud** crée une partie → reçoit un `game_id` et un lien de partage.
1. Le joueur **Nord** rejoint via ce lien.
1. Chaque navigateur fait du **polling toutes les 2 secondes** (`GET api/state.php?game_id=...`).
1. Un coup est envoyé via `POST api/move.php` avec `game_id`, `player`, `pitIndex`.
1. Le serveur rejoue le coup avec le moteur PHP, sauvegarde le nouvel état, et le renvoie.

> Le client ne connaît aucune règle du jeu : toute la validation est faite côté serveur, ce qui empêche la triche.

### Choix techniques (V2)

|Point             |Décision                         |Justification                                      |
|------------------|---------------------------------|---------------------------------------------------|
|Communication     |Ajax avec polling (2s)           |Simple à mettre en place sous XAMPP, sans WebSocket|
|Stockage          |Fichier JSON par partie          |Évite MySQL, suffisant pour un projet pédagogique  |
|Concurrence       |`flock()` lors de l’écriture     |Évite la corruption en cas d’écriture simultanée   |
|Sécurité `game_id`|Filtrage alphanumérique + tirets |Empêche les attaques par traversée de chemin       |
|Identification    |Créateur = Sud, rejoignant = Nord|Cohérent avec « Sud commence »                     |

## Installation / Déploiement

### V1 (statique)

Déposer le dossier `v1/` sur n’importe quel hébergement statique (ex. Cloudflare Pages).

### V2 (PHP)

**En local avec XAMPP :**

1. Copier `v2/` dans `htdocs/songho/`
1. Démarrer Apache
1. Ouvrir `http://localhost/songho/songo.html`
1. Vérifier que `api/data/` est accessible en écriture par le serveur web

**En ligne (ex. InfinityFree) :**

1. Créer un compte d’hébergement PHP gratuit
1. Uploader le contenu de `v2/` dans `htdocs/` : `songo.html`, `songo.css`, `songo-remote.js`, et le dossier `api/` (avec `data/` et `.htaccess`)
1. PHP fonctionne nativement, aucune configuration supplémentaire requise

## Tests effectués

- **Simulation** : des parties complètes jouées pour les deux moteurs (JS et PHP)
  - Invariant des 70 graines respecté à chaque coup
  - Aucune boucle infinie ; fin de partie toujours valide (`score_40`, `low_board`, `solidarity_impossible`)
  - Comportements JS et PHP cohérents
- **API V2** (testée via `curl`) :
  - Création de partie, lecture d’état, envoi de coup valide
  - Rejet d’un coup hors tour, rejet d’un `pitIndex` invalide, réponse 404 pour partie inexistante

## Conventions spécifiques au projet

- **Don forcé** : en cas de solidarité, si un joueur doit jouer sa case d’attaque avec 1 ou 2 graines, ces graines sont directement ajoutées au score adverse (sans semaille normale).
- Le **polling** a été préféré aux WebSockets pour rester simple sous XAMPP.
- Le **stockage JSON** a été préféré à une base de données pour la simplicité ; `storage.php` peut être remplacé par une vraie BD sans toucher au moteur ni aux endpoints.

## Auteur

**BONDTOUM NDZIE ANAËLLE AURORE** — 24F2605
Université de Yaoundé I — Faculté des Sciences — Département d’Informatique
Sous la supervision du **Dr Messi**. 