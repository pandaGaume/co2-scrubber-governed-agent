# Les forks : un bac à sable pour laisser les agents se modifier

*Aide-mémoire du 29 septembre 2026 (P3 de `comportement-en-donnees.fr.md`). Le code est dans `lib/fork.ts`, la commande dans `scripts/fork.ts`, l'étanchéité est testée par `tests/fork.test.ts`.*

## En une phrase

Un fork est une copie des données du contexte (la bibliothèque et ses signatures, les specs, les graphes) où un serveur à part laisse les agents tout modifier, sans jamais toucher au dépôt. Chaque fork est un dépôt git : on relit son évolution instantané par instantané.

## Les commandes

`npm run` est la syntaxe de npm pour lancer le script `fork` du `package.json` ; tout ce qui suit `--` va au script. Seule `run` démarre un serveur ; les autres lisent ou écrivent le fork et rendent la main.

| commande | ce qu'elle fait |
|---|---|
| `npm run fork -- create <id>` | copie le contexte actuel du dépôt dans `outputs/forks/<id>/` ; premier commit : le contexte tel quel, avec le commit du dépôt d'où il vient |
| `npm run fork -- create <id> --from <autre>` | fork d'un fork : un clone, qui garde l'histoire de son parent |
| `npm run fork -- run <id> --port 3003` | démarre le serveur du fork (tableau de bord sur http://localhost:3003/) ; instantané au démarrage et à l'arrêt (Ctrl+C) |
| `npm run fork -- snapshot <id> <texte>` | enregistre ce qui a changé depuis le dernier instantané, sous ce libellé ; ne fait rien si rien n'a changé |
| `npm run fork -- reflect <id> --port 3003` | le serveur du fork doit tourner : Mother lit les traces du fork (motifs), et s'il y en a, l'usine de réflexion propose une adaptation que la station adopte dans le fork ; `--builder scripted` pour son script, sans clé |
| `npm run fork -- log <id>` | l'évolution : chaque instantané, sa date, son libellé et les fichiers qu'il a changés |
| `npm run fork -- diff <id>` | la divergence avec le dépôt tel qu'il est maintenant : fichiers ajoutés, changés, supprimés |
| `npm run fork -- list` | les forks existants et leur origine |
| `npm run fork -- remove <id>` | supprime le fork et son histoire (rien n'est gardé ailleurs) |

Il faut avoir fait `npm run build` au moins une fois. Le port 3001 reste celui du serveur du dépôt : prendre un autre port pour un fork.

## Une séance type

```bash
npm run fork -- create essai
npm run fork -- run essai --port 3003
# ... on joue des scénarios, les usines travaillent, on signe dans le fork ...
# Ctrl+C : le serveur s'arrête, un instantané est pris
npm run fork -- log essai
npm run fork -- diff essai
```

Pour marquer une étape en cours de route (sans arrêter le serveur), depuis un autre terminal :

```bash
npm run fork -- snapshot essai après la deuxième mise en service
```

## Ce qui est isolé, et comment on le voit

- **Isolé** : la bibliothèque et ses signatures, les specs (y compris les rôles et les playbooks), les graphes, et toutes les sorties (ateliers des tâches, recettes, propositions à la bibliothèque). Le code, lui, reste celui du dépôt.
- **Ignoré dans un fork** : les variables d'environnement qui enverraient des données ailleurs (`LIBRARY_SIGNATURES_DIR`, `LIBRARY_PROPOSALS_DIR`, `STATION_ROLES_FILE`, `WORKSHOP_DIR`, `FACTORY_RECIPES_DIR`). Les clés de `.env` passent.
- **Visible** : le serveur l'annonce au démarrage (`FORK <id>: ...`) ; la salle de contrôle affiche un badge « fork <id> » en haut ; la page bibliothèque dit que ses signatures n'engagent rien hors du fork ; les lignes de Mother, les manifestes des tâches et les signatures portent l'identifiant du fork. Un fork ne se présente pas sur le réseau comme la salle.
- **Dans l'histoire du fork** : les données du contexte, les recettes (`outputs/factory/_recipes/`) et les propositions (`outputs/factory/library-proposals/`). Les ateliers des tâches restent sur disque mais n'entrent pas dans les instantanés.

## Signer dans un fork

Un fork a ses propres rôles (`specs/station/roles.json` copié). Pour qu'un agent ou une personne de test signe dans le fork, on modifie les titulaires dans la copie du fork, pas dans le dépôt. Les signatures du fork restent dans le fork.

Les commits d'un fork ont pour auteur « fork <id> » et ne sont pas signés avec ta clé git : ce sont les modifications des agents, pas les tiennes.

## Laisser les agents se modifier : la réflexion (P4)

Quand les agents ont travaillé dans un fork (des scénarios joués, des tâches d'usine), `npm run fork -- reflect <id>` demande à Mother de relire leurs traces. Elle y cherche des motifs : une même cause qui arrête plusieurs essais d'une mise en service, une capacité refusée plusieurs fois de suite sur les mêmes points, une tâche finie STUCK. S'il y en a, l'usine de réflexion propose une adaptation : un patch sur un playbook ou un fichier de mots, avec sa raison et les motifs qu'il corrige. La station la revérifie, l'applique dans le fork seulement, prend un instantané libellé de la raison, et Mother le dit. `npm run fork -- log <id>` montre alors l'adaptation comme une étape de l'évolution.

Ce qui ne s'adapte jamais, même dans un fork : la bibliothèque, les faits, les règles de la garde, les rôles, et les bornes de la réflexion elle-même (`specs/reflection/format.json`, qui dit pourquoi pour chacun).

## Ce qui n'existe pas encore

- faire remonter un changement d'un fork vers le dépôt : il passera par une proposition et une signature (niveaux 2 et 3 de `comportement-en-donnees.fr.md`) ;
- le banc qui compare un fork à l'original sur les scénarios de référence (P5), et la réflexion lancée d'elle-même après chaque run.
