# L'Observateur et les usines : qui formule, qui construit, qui juge

*Écrit le 24 septembre 2026, d'après la discussion avec Guillaume de la nuit
du 23 au 24. Ce document fixe la séparation des rôles entre l'Observateur,
les usines et le jumeau, et la boucle qui fait évoluer un graphe d'après son
écart au réel. Il dit ce qui est construit et ce qui ne l'est pas encore.*

---

## 1. Deux rôles, un seul modèle

L'Observateur et l'usine sont deux rôles joués par **le même modèle de
langage**, celui du slot `reasoner` (Claude aujourd'hui, Nemotron sur Nebius
demain). Ce qui fait le rôle, c'est le prompt et ce qu'on montre au modèle,
pas le modèle.

| rôle | reçoit | produit | ne voit jamais |
|---|---|---|---|
| **l'Observateur** | la description d'un système physique, un résumé calculé de sa télémétrie | la `TWIN_FACTORY_REQUEST` : ce que le jumeau doit savoir faire | le catalogue de nœuds, la liste des usines |
| **une usine** | la demande, le catalogue de nœuds, sa bibliothèque, ses outils | un artefact : un graphe, un modèle, un protocole, un nœud | la télémétrie brute tant qu'elle ne lui est pas confiée |
| **le jumeau** | un graphe candidat, la télémétrie de référence | une simulation, un écart | rien de plus : il calcule |

La règle qui organise tout : **l'Observateur énonce des besoins, jamais des
solutions.** S'il voyait le catalogue, il formulerait le problème en fonction
de ce qu'on sait déjà fabriquer. Avec la même demande, un catalogue enrichi
demain donne un meilleur graphe, sans rien changer à l'Observateur.

## 2. La chaîne

```
description / télémétrie
          |
      OBSERVATEUR          un modèle, son prompt, sa garde
          |
   TWIN_FACTORY_REQUEST    ce que le jumeau doit savoir faire
          |
      AIGUILLAGE           côté usines : laquelle construit
          |
   USINE (graphe, modèle, code, 3D, ...)  <->  catalogue de nœuds
          |
   graphe candidat
          |
       JUMEAU              simulation sur la télémétrie de référence
          |
   écart au réel (score)
          |
          +--------------> retour à l'USINE : paramètres ou topologie
```

## 3. L'Observateur (construit le 24 septembre)

Fichiers : `harness/observer/` (le contrat, la garde, le résumé de
télémétrie, le prompt, la boucle), `slots/observer/` (le slot, outil
`observe`), `tests/observer.test.ts`.

**Ce qu'il reçoit.** La description du système, telle qu'un ingénieur
l'écrirait (composants, but, ce qui se commande, ce qui se mesure), et un
**résumé de la télémétrie calculé par du code** : pour chaque colonne, le
nombre de valeurs, la première et la dernière, le minimum, le maximum, la
moyenne, et si elle varie. Jamais les lignes : elles coûtent cher et
n'ajoutent rien que le résumé ne dise.

**Ce qu'il produit.** Une `TWIN_FACTORY_REQUEST` : l'objectif, les entités et
leurs relations, les grandeurs observables, les commandes, les influences
extérieures, les entrées et les sorties du jumeau, les comportements à
reproduire, les contraintes, **ce qui manque et ce qu'il suppose à la place,
dit comme supposé**, et comment le jumeau sera jugé contre le réel.

**Sa garde, en code, sans modèle.** Trois règles :

1. **la forme** : les sections indispensables sont là, chaque grandeur a son
   unité, il y a au moins un critère de validation ;
2. **la séparation** : aucun type de nœud du catalogue n'est nommé (un
   identifiant comme `Physics.LifeSupport:cabin-air`, ou toute chaîne qui en
   a la forme). La garde lit le catalogue pour refuser ; le modèle ne le voit
   pas ;
3. **les faits** : une grandeur dite lue dans la télémétrie nomme une colonne
   qui existe.

Une demande refusée revient au modèle avec les raisons, trois tentatives au
plus. Premier essai réel (Claude Haiku 4.5) : sa première demande sur le Lab
lisait une colonne `co2_hab_b_ppm` qui n'existait pas ; la garde l'a refusée,
la seconde était juste, et elle rangeait d'elle-même le volume du Lab, le
débit par le sas et le taux de CO2 de l'équipage dans « ce qui manque ».

**Il ne choisit pas l'usine.** La demande part sans sujet (`topics: "auto"`).
Il ne sait pas qu'il existe une usine de graphes, de modèles ou de code, et il
n'a pas à le savoir.

## 4. Plusieurs usines, chacune avec son harnais

Une usine, dans ce dépôt, est un **sujet** de la boucle de l'usine
(`harness/topics/<sujet>/`). La boucle est commune (`harness/core/runner.ts`) ;
chaque usine apporte son harnais :

| pièce | ce qu'elle fixe |
|---|---|
| ses outils | ce que le constructeur a le droit d'appeler, rien d'autre |
| sa garde | ce qu'elle refuse avant toute exécution |
| son validateur | quand le contrat est tenu |
| son prompt | le rôle, pour un constructeur qui est un modèle |
| son brief | les étapes, dites au modèle au fil de la tâche |
| sa bibliothèque | les méthodes et leurs règles d'application, là où il faut chercher |

| usine | sujet | état |
|---|---|---|
| modèle ONNX (moniteur de l'épurateur) | `onnx` | construite (F4), constructeur scripté ; le prompt est F5 |
| protocole d'essai (mise en service) | `procedure` | construite le 23 septembre, constructeur = le modèle, essai réel réussi |
| graphe de jumeau | `graph` | construite le 24 septembre : la structure par le modèle, les nombres par un estimateur interchangeable, l'écart par le code ; détail et limites dans `usine-de-graphes.fr.md` |
| code (un nœud nouveau) | `code` | en réserve (section 6) |
| 3D, autres | | plus tard, même forme |

**L'aiguillage est du côté des usines, jamais de l'Observateur.** Chaque usine
publiera une fiche de ce qu'elle sait produire (les genres d'artefacts, les
grandeurs). La première version de l'aiguillage est écrite en code depuis le
24 septembre (`topicFor`, `harness/core/task.ts`) : une tâche qui porte les
exigences d'un Observateur va à l'usine de graphes, une tâche qui nomme son
sujet le garde, le reste va au modèle ONNX. Une version suivante pourra confier ce choix au planificateur de
l'usine (le `task.plan` existe déjà). Dans les deux cas l'Observateur n'en
sait rien.

## 5. La boucle d'apprentissage structurel (construite le 24 septembre, voir `usine-de-graphes.fr.md`)

C'est le retour qui compte : l'usine ne construit pas un graphe une fois, elle
le fait **évoluer d'après son écart au réel**.

1. l'usine construit un graphe candidat à partir de la demande et du
   catalogue (`twin.registry_search`, `twin.document_build`) ;
2. le jumeau le fait tourner sur les conditions de la télémétrie de
   référence (`twin.session_run`) ;
3. **l'écart est calculé par du code**, contre les critères de validation de
   la demande (quelle sortie contre quelle mesure, quel seuil) ; ni l'usine
   ni le modèle ne se notent eux-mêmes ;
4. l'écart revient à l'usine, avec la courbe prévue et la courbe mesurée ;
5. l'usine corrige : **les paramètres**, ou **la topologie** (ajouter un
   nœud, un passage d'air, une source), et le candidat suivant repart en 2 ;
6. chaque candidat est gardé, avec son écart : on voit la topologie évoluer,
   et un candidat rejeté reste une preuve.

Le modèle ne règle alors plus seulement les paramètres d'un modèle du monde :
il en modifie la structure. Mais il ne juge jamais son propre travail : le
score est calculé par du code, et l'acceptation reste celle de la chaîne de
confiance (juge indépendant, registre, validation de l'opérateur, carte).

**La mise en service en est le premier cas.** Les deux candidats de la
section 11 de `mise-en-service.fr.md` (deux pièces séparées, puis reliées par
le sas) sont deux tours de cette boucle : l'échange par le sas n'a pas été
mesuré, c'est une hypothèse, et c'est l'écart du premier candidat qui fait
naître le second.

## 6. En réserve : quand le catalogue n'a pas ce qu'il faut

Décidé le 24 septembre : **on garde la possibilité**, on ne la construit pas
encore.

Si l'usine de graphes ne trouve dans le catalogue aucun nœud pour un
comportement demandé, elle le déclare dans son plan comme capacité manquante,
avec le sujet qui saura la fabriquer : `code`. Le point d'accroche existe déjà
(`missing_capabilities` de `task.plan`, avec son `topic`).

Une **usine de code** repart alors sur sa propre boucle : écrire un nœud
nouveau dans un plugin à part, `generated`. Ce qu'il faudra tenir, et qu'on
écrit maintenant pour ne pas l'oublier :

- le nœud généré a sa signature (entrées, sorties, unités), sa documentation
  et ses tests, écrits avant d'être chargés ;
- il ne rejoint le catalogue qu'après avoir passé ses tests dans un bac à
  sable et un `evaluate` positif, comme tout artefact ;
- le plugin `generated` est séparé des plugins écrits par des humains,
  versionné par sha256, et le catalogue dit de chaque nœud s'il est généré ;
- l'usine de graphes repart ensuite avec le catalogue enrichi, et la même
  demande.

### 6.1 Le bac à sable du code est un slot : `forge` (décidé le 25 septembre au soir, pour la reprise)

Après la journée du 25 septembre (l'état de raisonnement, les briefs par
étape, les exigences, les refus gardés, la couche des contrats, le journal
des états ; `harness-refactoring.fr.md`), presque toute la boucle de
l'usine de code existe déjà, indépendante du sujet. Ce qui est neuf, c'est
qu'un artefact du modèle s'exécute comme code et non comme données ; et
dans cette architecture, un bac à sable est un slot de plus sur le broker,
avec ses outils, sa grammaire, ses ressources, sa garde et sa trace, comme
`twin` ou `library`. Rien n'entre dans le processus du jumeau tant que ce
n'est pas sorti de là.

**Le slot `forge`.**

- Son propre processus et son propre runtime spikypanda, avec un catalogue
  à lui : ce que le modèle compile et charge ne vit que là ; le twin ne le
  voit pas.
- Ses outils : `plugin_write` (les fichiers d'un plugin dans l'atelier de
  la tâche : le nœud, sa signature, sa documentation, ses tests, écrits
  avant le nœud) ; `plugin_build` (la compilation dans un processus séparé,
  imports sur liste blanche, `@spiky-panda/core` et rien d'autre, un budget
  de temps, les erreurs rendues telles quelles) ; `plugin_test` (les tests
  du nœud, et les vérifications déterministes : la signature contre le
  vocabulaire des grandeurs par le service des unités et la vérification de
  signature du substrat, la conservation sur un pas de simulation) ;
  `plugin_load` (dans le runtime de la forge, le nœud versionné par
  sha256) ; `registry_search` et `registry_describe_node` (le catalogue de
  la forge, chaque nœud dit généré) ; `session_run` (un graphe candidat avec
  le nœud, comme le twin : `graph.evaluate` vise `runtimeSlot: "forge"` au
  lieu de `twin`, le paramètre existe déjà).
- La promotion : `plugin_promote` ne fait qu'un artefact signé (le plugin,
  son sha256, ses tests passés, l'évaluation) proposé à la station ; Mother
  le dit, le commandant l'autorise, et c'est le twin qui, sur cette
  autorisation, charge le plugin `generated` chez lui. La forge ne pousse
  jamais rien.
- Ses ressources : `forge://plugins` (ce qui est chargé, sha256 et
  provenance), `forge://builds` (les compilations, réussies ou non).

**Ce que l'usine de graphes n'a pas à apprendre.** Le sujet `code` écrit le
nœud, la forge le juge, et la même demande est rejouée sur le catalogue de
la forge par l'évaluateur existant (couverture, seuils nommés, diagnostic).
Un `STRUCTURAL_MISMATCH` sur le catalogue du twin est l'entrée du sujet
`code` ; un `PASS` sur celui de la forge devient la proposition. Le sujet
`code` reçoit les crochets que `procedure` a reçus (`state`, `brief`,
`key`, `claims`), et la couche des contrats refuse un port mal typé avant
tout chargement. Le superviseur des contrats, quand il existera, est ce qui
empêchera l'usine de code de « réparer » un graphe en inventant une
physique qui contredit un fait documenté.

**Le point d'attention** : l'isolation réelle de la compilation et de
l'exécution, un `child_process` sans réseau ni accès au reste du dépôt, un
répertoire de travail par tâche, un temps maximal. Le reste est du harnais
qu'on a déjà.

**L'ordre proposé** : le slot `forge` et le validateur du nœud d'abord
(déterministes, testables sans clé), la boucle du sujet `code` ensuite, le
superviseur quand deux usines se parlent vraiment. Le sujet `onnx` sur
l'état (le dernier en conversation) vient après : il sort des données du
graphe et n'est pas sur le chemin de la mise en service.

## 7. Le cache du prompt

Le prompt d'un rôle (l'Observateur, une usine) est fixe : les mêmes octets
pour chaque système. Il passe en tête de la requête, avec la liste d'outils
dans un ordre stable, et ce qui varie (la description, la télémétrie, les
raisons d'un refus) vient après. Côté Anthropic, le prompt porte un marqueur
`cache_control` : la clé du cache est le préfixe lui-même, octet pour octet,
isolé par espace de travail ; aucun jeton n'est renvoyé, et changer le prompt
crée une nouvelle entrée. Le sha256 du fichier de prompt, déjà dans le
manifeste, en est de fait la version.

Mesuré le 24 septembre : rien n'est mis en cache sur Claude Haiku 4.5, dont le
seuil est de 4096 jetons de préfixe ; celui de l'Observateur en fait environ
2100. Sur Claude Opus 5 le seuil est de 512. Côté Nebius, un serveur
compatible OpenAI met en cache les préfixes identiques de lui-même, s'il le
fait ; la conception est la même.

## 8. Ce qui existe, ce qui manque

| pièce | état |
|---|---|
| l'Observateur, sa garde, son slot, ses tests | construit |
| la demande portée entière dans la tâche de l'usine (`requirements`) | construit |
| le cache du prompt côté Anthropic | construit ; inactif sous le seuil de Haiku 4.5 |
| l'aiguillage vers les usines | à construire (section 4) |
| l'usine de graphes, et la boucle écart puis correction | construite le 24 septembre (`usine-de-graphes.fr.md`, exemple complet dans `exemple-mise-en-service.fr.md`) |
| l'usine de code et le plugin `generated` | en réserve (section 6) ; le bac à sable est un slot, `forge` (section 6.1, décidé le 25 septembre au soir, à construire en premier à la reprise) |
| le superviseur des contrats | construit la nuit du 25 septembre (`harness-refactoring.fr.md`, section 16) : un rôle sur le slot `reasoner`, un verdict typé gardé par code, l'Observateur renvoyé dans sa boucle, l'usine de graphes qui lit le verdict |
