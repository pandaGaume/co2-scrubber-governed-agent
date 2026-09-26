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

### 6.2 La forge, construite (la nuit du 25 septembre, branche `forge`)

Le slot existe (`slots/forge/provider.ts`, sa garde dans
`slots/forge/plugin-check.ts`, ses mots dans `slots/forge/grammars/`), sans
modèle et sans clé, et un plugin généré le traverse entier dans le test
(`tests/forge.test.ts`, une fuite de CO2 : `Generated.Habitat:leak`).

Ce qui est fait, dans l'ordre où un plugin passe :

- **son propre runtime** : un registre à lui (les plugins du substrat, le
  plugin `habitat` écrit à la main, les plugins générés par-dessus) avec la
  surface runtime du substrat montée dessus (`registry_search`,
  `registry_describe_node`, `document_build`, `session_run` : les mêmes
  outils que le jumeau, donc `graph.evaluate` vise `runtimeSlot: "forge"`
  et rien d'autre ne change). Le catalogue du jumeau ne voit pas ce que la
  forge charge ; le test le vérifie.
- `plugin_write` : les fichiers dans l'atelier de la tâche
  (`outputs/factory/<tâche>/forge/<plugin>/`), les sources sous `src/`
  (`index.ts` qui exporte `register(registry, doc)`, les nœuds, les tests),
  les fiches sous `docs/` ; rien ailleurs, rien au-dessus. La disposition et
  les imports sont jugés à l'écriture.
- `plugin_build` : `tsc` dans un processus enfant, répertoire de travail
  propre, environnement vidé, budget de temps (120 s), après la liste
  blanche des imports (`@spiky-panda/core` et les fichiers du plugin ;
  `node:test` et `node:assert` dans les tests ; pas d'`eval`, pas d'import
  calculé). Les diagnostics reviennent entiers (fichier, ligne, code,
  message).
- `plugin_test` : les tests du plugin par le lanceur de node (processus
  enfant, 60 s), puis les vérifications déterministes sur un registre à
  blanc : chaque type nommé sous `Generated.` (c'est ainsi que tout
  catalogue, tout plan et tout candidat disent qu'un nœud est généré, sans
  métadonnée que le substrat ne porte pas), une signature présente et
  valide pour le vérificateur du substrat (`validateSignature`), chaque
  unité résolue par le service des unités contre sa grandeur, la fiche sur
  le disque.
- `plugin_load` : dans le registre vivant de la forge, par sha256 ; refusé
  sans test positif ; un type que le registre tient déjà n'est jamais
  remplacé.
- `plugin_promote` : l'artefact signé (fichiers et sha256, types, tests et
  vérifications, le rapport d'évaluation nommé) écrit dans l'atelier et
  proposé à la station par `station.propose` (kind `plugin`), et nulle part
  ailleurs. La forge ne pousse rien.
- Ses ressources : `forge://plugins`, `forge://builds`, `forge://proposals`.
- Son propre processus : `npm run forge` (`slots/forge/main.ts`) contre un
  courtier déjà lancé, la démo démarrée avec `--no-forge`. Sans cela, la
  démo publie la forge dans son processus, ce qui suffit aux tests.

Ce qui n'est pas fait, dit tel quel : la conservation d'une grandeur sur un
pas de simulation (une vérification à faire sur un document que le runtime
construit) ; le chargement par le jumeau du plugin `generated` sur
l'autorisation du commandant (la station reçoit la proposition et attend) ;
l'isolation réseau des processus enfants.

### 6.3 Le sujet `code`, sur la forge (la même nuit)

Le sujet existe (`harness/topics/code/`), avec les crochets que `procedure`
a reçus le 25 septembre : les outils, une garde à lui, sa part de l'état de
raisonnement, le brief par étape, la clé des recettes, les revendications
construites par le code, le validateur. Il ne fait presque rien lui-même :
la forge tient le bac à sable et les vérifications, le constructeur tient
la boucle. Une tâche s'ouvre avec `topics: ["code"]` (l'entrée prévue est
la capacité manquante qu'une usine de graphes déclare avec ce sujet ; le
branchement automatique d'une tâche sur l'autre n'est pas fait).

Ses six étapes, dans l'ordre où un plugin traverse la forge :

1. **l'écart et le catalogue** : `forge.registry_search` d'abord, un nœud
   n'est écrit que pour ce que rien ne produit ; la garde refuse un plan
   avant cette lecture ;
2. **le plan** : `selected_nodes` vide, une capacité manquante par sortie
   requise, sujet `code` ;
3. **le plugin** : `forge.plugin_write` ; la garde refuse, avant toute
   compilation, un type qui n'est pas nommé sous `Generated.` (la règle
   nommée, avec l'exemple), et un second nom de plugin dans la même tâche ;
4. **compilé, testé, chargé** : `forge.plugin_build`, `forge.plugin_test`,
   `forge.plugin_load` ; les exigences se déduisent des réponses de la forge
   (une compilation plus vieille que les fichiers ne compte plus, ni ce qui
   l'a suivie) ; un refus revient entier dans l'état sous `evaluation`
   (les diagnostics, les vérifications refusées, la sortie des tests) ;
5. **exécuté** : `graph.evaluate` sur la forge quand la tâche porte une
   télémétrie (le même évaluateur, les mêmes seuils, le même diagnostic que
   l'usine de graphes ; `evaluateCapability(context, "forge")`), sinon un
   document qui câble le nœud (`forge.document_build`, `forge.session_run`)
   avec une sonde sur l'un de ses observables ; la promotion est refusée
   avant ;
6. **proposé, remis** : `forge.plugin_promote`, puis `task.done` avec
   l'artefact de type `plugin` ; le validateur exige que le fichier
   revendiqué soit celui que la forge a signé (même chemin, même sha256), et
   le runner propose le manifeste à la station avec lui (kind `plugin`).

Le constructeur scripté (`harness/scripted/code.ts`, la fixture
`code-fixture.ts`) joue la chaîne sans clé : dix pas, la tâche finit
`proposed`, la station tient deux propositions (celle de la forge, celle de
la tâche avec son manifeste), le catalogue du jumeau ne voit rien. Avec un
mauvais nom de type d'abord, la garde refuse l'écriture, nomme la règle, le
script corrige, une seule compilation est dépensée (`tests/code.test.ts`).
**Trois passages sur Haiku** (`scripts/code-example.ts`, la même demande :
une fuite de CO2 qu'aucun nœud du catalogue ne produit ; les journaux, les
traces et les plugins écrits sous `docs/exemples/2026-09-26-forge-<n>-haiku-code/`).
Ce que chacun a montré, et ce qui en est sorti :

| passage | ce qui s'est passé | ce qui a changé |
|---|---|---|
| 1 | le plan corrigé en un refus (le nom de la sortie écrit avec sa grandeur) ; le plugin écrit sur une API inventée (`registerNodeType`, `factory:`, `ports:`, des imports sans extension) ; `plugin_build` appelé avec `taskId: "build"` et refusé par la forge dix-sept fois de suite, la même entrée à chaque fois ; budget épuisé, 70 k jetons | l'id de la tâche lié pour les outils `forge.plugin_*` comme pour l'atelier (le modèle ne l'écrit plus) ; la garde des répétitions refuse aussi l'appel identique à un appel qui a échoué ; `forge.plugin_template`, un plugin minimal complet exactement comme le substrat l'accepte (un gain), exigé avant l'écriture ; le brief du plan nomme les sorties exactement |
| 2 | le plan encore corrigé en un refus (le brief n'était pas encore corrigé) ; le modèle lit le modèle de plugin, écrit un `index.ts` juste et un nœud à côté (`InputPort`, `OutputPort`, `@editable()` sans argument) ; cinq diagnostics ; puis il tente de relire son fichier à un mauvais chemin, sept fois le modèle, huit fois la liste : sur l'état de raisonnement il n'a plus ce qu'il a écrit ; budget épuisé, 80 k jetons | la forge répond à une écriture avec les sources entières telles qu'elles sont ; l'état porte le plugin entier (`hypothesis.plugin.sources`) et le modèle de plugin entier tant que rien n'est compilé ; le brief d'une compilation échouée dit de corriger là, contre le modèle, et de ne renvoyer que les fichiers qui changent |
| 3 | 14 pas, aucun refus, 76 k jetons, 67 s : le catalogue, le plan, le modèle lu, le plugin écrit sur sa forme (`Generated.Physics:leak-co2`, une commande bornée, un débit éditable, un observable), compilé du premier coup, testé, chargé, un document construit quatre fois (les mêmes clés dans un autre ordre, la garde des répétitions ne l'a pas vu), exécuté, proposé, remis ; la tâche `proposed`, l'artefact signé au manifeste | la garde des répétitions compare en JSON canonique (clés triées) |

Ce que ces passages disent : sur l'état de raisonnement, tout ce que le
modèle doit corriger doit être dans l'état entier, ses propres fichiers
compris ; et une API se lit sur un exemple qui compile, jamais de mémoire.
Le plugin du troisième passage est celui de la fixture à quelques noms près,
écrit par le modèle sur le modèle de plugin. Le nœud du troisième passage, rejoué
dans la forge avec une commande câblée (0,25 puis 1, débit 0,002 kg/s),
donne -0,0005 puis -0,002 kg/s à la sonde : la physique demandée. Ce que le
modèle s'était donné comme démonstration, lui, ne câblait pas la commande
(la fuite y valait zéro) et l'exigence « exécuté » s'en contentait : depuis,
la garde du sujet refuse un document où le nœud généré n'a aucune entrée
câblée (`documentProblems`), et le brief le dit.

### 6.4 Le contrat de capacité : le modèle n'écrit jamais à la fois le code, les tests d'acceptation et le verdict

Une relecture du troisième passage a trouvé le vrai défaut, plus important
que le document non câblé. La demande disait « 1 quand rien n'est câblé » ;
le nœud du modèle prenait 0 ; sa signature disait 0 ; ses tests, nommés
« the leak rate is negative and scales with command », ne testaient que le
setter ; et le harnais a exécuté précisément ce cas (60 pas, commande non
câblée, fuite à zéro) et l'a compté comme succès. Le compilateur et le
lanceur de tests étaient indépendants du modèle, le contrat fonctionnel ne
l'était pas ; et `plugin_promote` prenait un `verdict: "pass"` du modèle.

Ce qui a changé (`slots/forge/contract.ts`, `plugin_acceptance`,
`code.accept`) :

- **le contrat de capacité** est écrit par la tâche
  (`requirements.capability`), jamais par le modèle : les entrées et sorties
  avec grandeur, unité, plage et valeur prise quand rien n'est câblé ; les
  paramètres que le nœud doit exposer comme éditables, par ces noms, avec la
  valeur des essais ; les comportements, une ligne chacun,
  `output(command=0.5) == -0.5 * rateAtFullOpening`,
  `output(unwired) == -rateAtFullOpening`. Sa forme est jugée par le code
  (une unité par le service des unités, une formule par l'évaluateur du
  sujet graphe) ;
- **la forge en dérive les tests d'acceptation et les exécute elle-même** :
  la signature contre les ports du contrat (l'unité convertible, pas la
  chaîne), les paramètres comme setters du nœud instancié, puis chaque
  comportement sur un runtime à blanc : le nœud dans un document, une
  timeline par entrée câblée à sa valeur ou rien, sa sortie lue par un
  transducteur ouvert et sans bruit, huit pas, la dernière mesure contre la
  formule (tolérance relative 1e-6). Ce qui échoue est nommé avec la valeur
  mesurée et la valeur dite ;
- **le sujet `code`** porte le contrat entier dans l'état (`hypothesis.contract`),
  ajoute `code.accept` (sans entrée : le contrat est celui de la tâche),
  exige l'acceptation avant le chargement, et la forge refuse de charger un
  plugin dont l'acceptation a échoué ;
- **la promotion ne prend plus de verdict** : l'artefact porte
  l'acceptation telle que la forge l'a exécutée (ou `null`, dit tel quel,
  quand la tâche n'a pas de contrat) ;
- la fixture de test porte son contrat, et un nœud qui prend 0 quand rien
  n'est câblé passe ses propres tests et les vérifications de la forge, puis
  est refusé par l'acceptation avec la mesure (`co2Delta(unwired) is 0, the
  contract says == -0.002`) et n'est pas chargé (`tests/forge.test.ts`).

Le même relecteur a relevé ce qui restait du domaine hors du code : le
prompt du sujet parlait d'un habitat lunaire et de « la physique de
l'habitat » (il parle maintenant d'un système de jumeau numérique et des
documents du domaine) ; l'état du sujet portait le rayon entier de la
bibliothèque (le graphe de référence, ses variables `V`, `Vh`, `eta`...)
dont l'usine de code n'a aucun besoin (`TopicDefinition.shelf: false`, le
runner ne le donne plus à ce sujet). Les exemples d'unités et de faits dans
les descriptions des outils `physics` et `library` restent : ce sont les
mots de ces slots, du domaine par construction.

**Quatrième passage sur Haiku**, avec le contrat dans la demande
(`docs/exemples/2026-09-26-forge-4-haiku-code/`) : 20 pas, 5 refus,
108 k jetons, 81 s, la tâche `proposed`. Le modèle a écrit
`let command = 1; // Default to 1 when unwired` ; l'acceptation a mesuré les
quatre comportements (0 ; -0,001 ; -0,002 ; -0,002 à vide) et les a tenus ;
le plugin chargé après. Les cinq refus : quatre `document_build` avec les
segments de la timeline en tableau là où le substrat veut une chaîne JSON
(le brief le dit maintenant, avec l'exemple), un `plugin_promote` avec
`claims` en phrase (le brief dit un objet).

### 6.5 Le relais entre l'usine de graphes et l'usine de code (le 26 septembre)

Le branchement demandé : une capacité manquante de l'usine de graphes ouvre
une tâche `code`, et le contrat est écrit par le modèle de l'usine de
graphes, un autre rôle que celui qui écrira le code (le principe de 6.4
tient : celui qui code ne définit jamais ses propres tests d'acceptation).

- **Le plan** : une capacité manquante déclarée avec le sujet `code` porte
  son `contract` (le schéma de `task.plan` dit sa forme) ; la garde du plan
  le juge par le code (`contractProblems` : ports, unités, formules,
  comportements ; un `type` s'il est nommé est sous `Generated.`, sinon
  laissé à l'usine de code ; une sortie porte la grandeur requise). Une
  tâche `code` ne répète pas dans son plan le contrat qu'elle porte.
- **La fin de la tâche de graphes** : un plan qui déclare une capacité pour
  une autre usine termine la tâche de lui-même (`MISSING_CAPABILITY`) : rien
  à évaluer, le jumeau se construit au rejeu. (Le cinquième passage avait
  vu le modèle appeler `task.done` douze fois au lieu de `task.fail`.)
- **Le relais** (`slots/factory/handoff.ts`, `provider.ts`) : l'usine ouvre
  la tâche `code` sur le contrat (sur la forge, `task.runtime` est un champ),
  puis, la tâche `code` proposée, rejoue la demande de graphes sur le
  catalogue de la forge avec les types générés nommés dans ses observations ;
  la garde du plan refuse au rejeu de déclarer manquant ce qu'un type généré
  a été fait pour produire ; la profondeur des relais est bornée ; la
  signature d'une tâche porte les types générés pour que les recettes
  apprises sans le nœud ne rejouent pas avec lui.
- **Au passage** : le runner termine une tâche bloquée sur quatre propositions
  identiques refusées (`STUCK`), classe le nom d'un document une seule fois
  sous la tâche, le sujet `code` n'a plus les outils de l'atelier (tout est
  dans l'état) et une tâche `code` ouverte par le relais a 32 pas.

Six passages sur Haiku pour le régler (`docs/exemples/2026-09-26-forge-<5..10>-haiku-handoff/`) :
le contrat du modèle avec un type étranger (5), les `task.done` répétés (5),
les fichiers perdus, les noms doublés (6), la recherche bloquée (8), le rejeu
qui redéclarait manquant (9) ; le dixième traverse : le contrat de l'usine de
graphes (une commande de 0 à 1, une pression, un débit éditable, trois
comportements), le nœud de l'usine de code accepté contre lui en 13 pas, la
demande rejouée et tenue en 4. Ce que ces passages disent du contrat écrit
par un modèle : sa forme est garantie par le code, sa physique est celle du
modèle (une fois une fuite en L/min avec sa conversion, une fois une
conductance en kg/s/Pa que le système d'unités refuse), et c'est le contrat
qui fait loi pour l'usine de code, pas la prose de la demande.

### 6.6 Le Tier 4 dans les décisions : les questions au commandant

L'automatisation complète n'est pas souhaitable : à chaque relais, le
commandant décide, et une usine peut poser une question avant de continuer.
Le mécanisme est celui de l'autorisation d'une mise en service, généralisé
(`slots/station/questions.ts`) :

- **Une question de la station** (`station.ask`) : qui demande, de quel
  genre (`open-code`, `replay`, `load-twin`, `ask`), la question, ses
  options, ce qu'il faut pour décider (le contrat écrit, l'artefact signé,
  la raison), et qui rappeler avec la réponse. Mother la dit et la garde
  ouverte (`station://questions`).
- **La réponse du Tier 4** (`station.answer`) : l'option choisie, qui,
  comment (un clic, la voix, un script), une note, des amendements quand
  l'option le permet (`amend` : le contrat amendé). Mother le dit ; la
  station rappelle le demandeur (`factory.resume`), qui prend le pas retenu.
  Ni `answer`, ni `questions_policy`, ni `factory.resume` ne sont au
  catalogue de l'agent de nuit.
- **La consigne permanente** (`station.questions_policy`) : chaque question
  attend (`ask`), ou les questions d'un genre, ou toutes, reçoivent aussitôt
  une option (`auto`). Réglée au poste de contrôle ; une question répondue
  par consigne est gardée comme telle (`how: policy`).
- **Où l'usine demande** : avant d'ouvrir l'usine de code sur le contrat
  (options `open`, `amend`, `stop`), avant de rejouer la demande avec le
  plugin accepté (`replay`, `stop`) ; le chargement dans le jumeau
  (`load-twin`) est le troisième point, pas encore construit. Ce qu'une
  réponse aura besoin de savoir est gardé sous un jeton avant que la
  question soit posée : une consigne répond pendant la demande même.
- **Une usine qui demande** (`task.ask`) : la question, ses options en mots
  courts, pourquoi. Sous consigne la réponse revient dans l'appel et la
  boucle continue ; sinon la tâche s'arrête en `waiting`, et à la réponse
  l'usine relance la boucle avec la réponse dans les observations de la
  tâche (`answers`), le manifeste de la boucle qui attendait gardé à côté.
  La boucle repart de son premier pas : c'est le prix d'une question, dit
  tel quel, et la raison de n'en poser que qui change ce qu'on va faire.
- **Le poste de contrôle** (`dashboard/panel.html`) : le panneau des
  questions, une option par bouton, le contexte déplié, la consigne
  permanente en liste ; et **la réponse à la voix** par la reconnaissance
  du navigateur (Web Speech API, français ou anglais, sans serveur) : la
  transcription affichée, l'option reconnue par ses mots, une confirmation
  avant l'envoi, la transcription gardée en note. Un outil `listen` du slot
  `speech` (Whisper, Scribe) ferait la même chose hors navigateur ; noté,
  pas construit.
- **Les scripts d'exemple** : `handoff-example.ts` met chaque question au
  clavier (vous êtes le commandant) ; `--auto` pose la consigne permanente.

Onzième passage, sous consigne (`docs/exemples/2026-09-26-forge-11-haiku-handoff-auto/`) :
la chaîne entière tenue (graphes 12 pas dont 10 refus du contrat : un type
étranger, une conductance en kg/s/Pa que le système d'unités ne connaît pas,
des formules sur des noms absents ; code 13 pas, 0 refus ; rejeu 4 pas), les
deux questions posées et répondues par consigne. Les tests jouent le
commandant au clavier (`tests/handoff.test.ts` : la chaîne répondue question
par question, l'arrêt, la consigne, `task.ask` en attente puis relancée, et
sous consigne répondue dans l'appel).

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
| l'usine de code et le plugin `generated` | construits : le slot `forge` (6.2), le sujet `code` (6.3), le contrat et l'acceptation par la forge (6.4), le relais graphes vers code et retour sur la forge (6.5), les questions au commandant à chaque relais et `task.ask` (6.6), branche `forge` ; scriptés et testés sans clé ; sur Haiku la chaîne entière tient (passages 10 et 11) ; reste le chargement du plugin dans le jumeau sur la réponse du commandant (`load-twin`) |
| le superviseur des contrats | construit la nuit du 25 septembre (`harness-refactoring.fr.md`, section 16) : un rôle sur le slot `reasoner`, un verdict typé gardé par code, l'Observateur renvoyé dans sa boucle, l'usine de graphes qui lit le verdict |
