# La mémoire des usines

*2026-09-29, après l'audit de la mémoire.* Une usine n'apprend plus en réécrivant ses consignes : elle apprend en construisant une mémoire, à partir de ce qu'elle a vécu.

## La chaîne

```
manifeste (vérité terrain)
  → épisode         harness/core/episodes.ts      fonction pure, sans modèle
  → mémoire de travail  lib/working-memory.ts     les N derniers épisodes d'un topic, reconstruits des manifestes
  → réflexion       station.reflect + usine reflection
  → candidate       le registre (ledger) du fork
  → essai (trial)   memory/<topic>.json du fork, lue par l'usine
  → consolidée ou rejetée
```

Il n'y a qu'une source de vérité : les manifestes. L'épisode en est une lecture structurée, et la mémoire de travail une fenêtre d'épisodes. La mémoire long terme contient ce qui a été appris de l'historique, pas l'historique lui-même.

## L'épisode

Un épisode, c'est ce qu'une tâche a soumis à son guard (`judges` du topic : `procedure.submit`/`revise`, `playbook.submit`, `reflection.*`). Chaque tentative porte :

- ses arguments utiles, sous forme d'un condensé fourni par le topic (pour une procédure : les justifications et les changements, par champ) ;
- qui l'a tranchée :
  - `ACCEPTED`,
  - `GUARD_REJECTED`,
  - `PRE_GUARD_REJECTED` (le harnais, avant le guard),
  - `TRUNCATED` (réponse coupée à la limite de sortie),
  - `CAPABILITY_FAILED` ;
- le motif du refus.

L'épisode porte aussi le **contraste** : le champ refusé, ce qui y a été envoyé (X), et ce que la tentative acceptée suivante y a envoyé (Y).

Pour le reconstruire depuis des traces existantes (aucun coût) :

```bash
node scripts/learning-experiment/episodes.mjs exp-learn exp-control
```

## Ce que voit l'usine

L'état de raisonnement porte un champ `memory`, seulement à l'étape dont le brief appelle la capacité concernée :

- `learned` : les entrées en essai ou consolidées de son domaine, avec ce sur quoi elles reposent ;
- `episodes` : les derniers épisodes, dont celui de la tâche en cours (marqué `current`), avec `refusedThenAccepted`.

Le prompt et les mots de l'usine ne changent pas. Le socle dit une fois pour toutes ce qu'est ce champ.

## La consolidation

Tout se règle dans `specs/harness/memory.json`. La réflexion ne peut jamais adapter ce fichier.

- **Candidate** : proposée par `reflection.remember` (une règle, son type, les capacités qu'elle concerne, les épisodes d'échec et de réussite qu'elle cite). Elle n'est pas encore en vigueur.
- **Essai** : dès que la mémoire de travail contient au moins 2 échecs de la forme et au moins 1 réussite qui y a répondu (un refus suivi d'un retry accepté). Des échecs seuls ne suffisent jamais. L'entrée est écrite dans `memory/<topic>.json` et lue dès la tâche suivante.
- **Consolidée** : après 3 tâches du topic, si l'erreur y apparaît moins souvent qu'avant. Elle reçoit alors sa confiance (la part des tâches sans l'erreur, et combien de tâches).
- **Rejetée** : dans le cas contraire. Elle est retirée du fichier.

Tant qu'une entrée attend ou est à l'essai, les motifs de sa famille attendent aussi. Une fois une entrée d'un topic mise à l'essai, les anciens motifs de premier essai de ce topic ne relancent pas la réflexion, sauf si l'erreur revient dans un épisode postérieur.

## Ce qui ne s'adapte plus

Les `specs/*/words.json` d'une usine sont désormais dans `never` (`specs/reflection/format.json`) : ce qu'on dit à une usine est écrit par une personne. La réflexion ne peut patcher que des playbooks (`reflection.propose`).

## Ablation

Dans un fork, mettre `"previousTasks": false` dans `specs/harness/memory.json`. L'usine ne voit alors que l'épisode de la tâche en cours, et la mémoire long terme reste la seule chose transmise d'une tâche à l'autre.
