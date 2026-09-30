# L'évaluateur post-procédure et le graphe du harnais

*Conception, 2026-09-30, révisée le même jour autour du graphe.* Pendant deux jours, un humain et moi avons relu à la main les épisodes des tâches qui échouaient pour trouver pourquoi. L'évaluateur fait ce travail. Il le fait en parcourant un **graphe du harnais** : un graphe de connaissance qui relie le contrat, le guard, la bibliothèque, la mémoire et l'expérience. Il propose ensuite des corrections qu'une personne approuve, et n'en applique jamais aucune lui-même.

## Pourquoi

La mémoire apprend de l'expérience, mais elle ne dit pas *ce que* l'expérience révèle. Une entrée consolidée peut compenser en silence un trou du contrat : la règle « une seule référence » a été apprise par Sonnet alors que c'était une règle du guard jamais écrite. Les expériences du 29 et du 30 septembre ont montré que la plupart des échecs répétés venaient du harnais ou de mes tâches, pas du modèle :

| Cas réel | Ce qu'on voyait | Ce que c'était | Correction |
|---|---|---|---|
| Troncature à 4096 | « capability outside the allowlist » | réponse coupée, motif perdu en mode state | artefact du harnais : motif `truncated`, limite 8192 |
| Référence composite | « is not a fact of the library » | règle du guard jamais énoncée, message trompeur | trou de contrat : schéma, C, message du guard |
| `Speed` en percent | quantité refusée puis supprimée | homonymie propriété / grandeur, refus sans la bonne réponse | trou de contrat : le refus nomme la grandeur déclarée |
| Boucle de lecture | STUCK après un abort | le brief promettait la procédure abortée, absente ; JSON illisible | trou de contrat et artefact du harnais |
| Historique fictif | procédure introuvable | mes tâches de validation | artefact de l'expérience |
| `steps.0` (GPT) | justification manquante | convention de chemin jamais énoncée | trou de contrat |
| `/steps/0/reason` | `steps.0` chez Sonnet, 3 tâches sur 3 | un exemple dans la description d'un outil | régression causée par un changement du harnais |
| v4, analyse et procédure en désaccord | refus « analysis » | incohérence du modèle, règle énoncée | rien : erreur du modèle, corrigée au retry |

L'évaluateur doit arriver à ces mêmes conclusions tout seul. Chacune de ces conclusions est un **chemin dans un graphe** : une règle que rien n'énonce, une forme d'échec qui apparaît juste après un changement de texte, une entrée de mémoire qui compense une règle muette.

## Ce qu'il est, et ce qu'il n'est pas

- **Il lit.** Il lit le graphe du harnais, reconstruit des sources à chaque passage.
- **Il classe.** Chaque constat reçoit une classe : trou de contrat, artefact du harnais, régression, lacune de la bibliothèque, politique apprise, connaissance du domaine, ou erreur du modèle.
- **Il recommande.** Il écrit une proposition (le texte à changer, la raison, les preuves, la vérification à faire) et la dépose pour signature.
- **Il n'applique rien.** Il ne modifie ni le contrat, ni le guard, ni la bibliothèque, ni la mémoire, ni le graphe. Une recommandation acceptée est d'abord appliquée dans un fork et mesurée, comme on l'a fait à la main.
- **Il ne juge pas le modèle en soi.** « Le modèle s'est trompé » est une conclusion permise, mais seulement quand la règle était énoncée et que le modèle l'avait reçue.

## Le graphe du harnais

### Le modèle : le graphe de la physique

Le projet a déjà un graphe de connaissance, celui de la physique (`slots/physics/knowledge.ts`).

- Les grandeurs, les unités, les lois et les relations y sont des nœuds d'un `Graph` SpikyPanda, typés par une ontologie.
- Ils sont reliés par des liens typés (`from`, `to`, `follows`, `measures`, `names`).
- Surtout, le graphe est **dérivé** : « le cœur reste la seule source des unités, le graphe est la façon de les parcourir ».
- Un outil permet de le parcourir (`physics.units_knowledge`).

Le graphe du harnais suit la même forme : le cœur SpikyPanda, une ontologie en spec et un constructeur dérivé des sources. C'est aussi le principe de la mémoire de travail : ce n'est pas une nouvelle source de vérité, c'est une façon de parcourir celles qui existent.

### L'ontologie (`specs/harness/graph.json`, jamais adaptable par la réflexion)

**Les nœuds**, et d'où chacun vient :

| Nœud | Ce qu'il représente | Source |
|---|---|---|
| `capability` | une capacité d'une usine (`procedure.submit`) | le catalogue des outils |
| `rule` | une vérification du guard, par son code stable (`INVALID_REFERENCE_CARDINALITY`) | le registre des règles du guard |
| `statement` | un texte du contrat : une description de schéma, une clé de mots, une grammaire d'outil, une étape de playbook | les specs et les grammaires, par leur chemin |
| `convention` | une convention de forme (un élément de liste nommé par sa clé, une référence par un identifiant) | `specs/<topic>/format.json` (`keys`) et le registre |
| `fact` / `document` | un fait de la bibliothèque, le document qui le porte, sa signature | la bibliothèque (`library.facts`), déjà indexée |
| `constant` | une constante de sécurité d'une procédure (`steps.*.speedPercent`) | les règles signées (`factsBounding`), déjà calculées pour C |
| `model` | un modèle et son fournisseur | les manifestes (`provider`) |
| `fingerprint` | un état du harnais : `tools.sha256`, `prompt.sha256`, le commit du dépôt | les manifestes |
| `task` / `episode` / `attempt` | une tâche, son épisode, chaque tentative | les manifestes (`episodes.ts`) |
| `form` | une forme d'échec (`shapesOf`) | les refus des tentatives |
| `correction` | une réponse Y qui a été acceptée après un X refusé | les contrastes des épisodes |
| `memory-entry` | une entrée de mémoire, candidate, en essai ou consolidée | le registre et `memory/<topic>.json` |
| `finding` / `recommendation` | un constat de l'évaluateur, sa proposition | l'évaluateur (ce qu'il écrit, jamais le reste) |

**Les liens** :

```
rule          --enforces-->      capability      la règle juge ce que la capacité reçoit
statement     --states-->        rule            le texte énonce la règle (le registre le dit)
statement     --states-->        convention
rule          --applies-->       convention      la règle suppose la convention (steps par n)
constant      --bound-by-->      fact            ce qui est déjà dans les règles signées
fact          --in-->            document        et sa signature
attempt       --read-->          statement       ce que le modèle a reçu avant de soumettre (la trace)
attempt       --of-->            episode         --of--> task
task          --ran-by-->        model
task          --ran-under-->     fingerprint
attempt       --refused-for-->   form            --of--> rule
episode       --corrected-by-->  correction      le Y qui a passé, sur le chemin refusé
attempt       --cited-->         fact            ce que ses justifications citent
fingerprint   --changed-->       statement       le diff d'un état du harnais au suivant
memory-entry  --rests-on-->      episode
memory-entry  --compensates-->   rule            quand ses échecs sont des refus de cette règle
finding       --about-->         (tout nœud)     --classed-as--> classe
recommendation --addresses-->    finding         --signed-by--> rôle
```

### Comment il est construit

- **Il est reconstruit des sources à chaque passage** : les manifestes et les traces, les specs, les grammaires, la bibliothèque, le registre de la mémoire, l'historique git des specs. Aucun nœud n'a d'autre origine, sauf ceux de l'évaluateur (`finding`, `recommendation`), qui sont ses propres écrits.
- **Le lien `read` est calculé à partir de la trace.** Un énoncé est lu si son texte figure dans la requête que le modèle a reçue avant la tentative : l'état, le brief, les descriptions d'outils. C'est ce qui distingue une règle énoncée quelque part d'une règle énoncée **au modèle, au bon moment**.
- **Le lien `changed` est calculé à partir du diff** entre deux empreintes : les descriptions d'outils, les mots, les schémas. C'est le lien qui aurait désigné `/steps/0/reason` tout de suite.
- **Seuls les types de nœuds qu'une requête utilise sont construits.** On ajoute un type quand un détecteur en a besoin, pas avant.

### Comment on le parcourt

Un outil, sur le modèle de `physics.units_knowledge`, est lu par une personne sur la page de la bibliothèque et par l'usine de recommandation. Il renvoie un nœud et ses liens entrants et sortants, ou un chemin entre deux nœuds. Par exemple :

- « pourquoi cette entrée de mémoire ? » : `memory-entry → compensates → rule ← states ← (rien)` ;
- « d'où vient cette forme ? » : `form → of → rule`, puis `task → ran-under → fingerprint → changed → statement`.

La bibliothèque devient ainsi un RAG en graphe. Un fait signé y est relié aux règles qui le citent, aux constantes qu'il borne, aux épisodes qui l'ont cité juste ou faux, et aux leçons apprises à son sujet.

## Les détecteurs, écrits comme des requêtes

Les détecteurs sont des requêtes déterministes sur le graphe, sans modèle. Ils produisent des `finding` avec leurs preuves, c'est-à-dire le chemin qui les justifie.

| Détecteur | Requête | Classe | Cas réel |
|---|---|---|---|
| **D1, règle non énoncée** | une `rule` refusée dans au moins 2 tâches, dont aucun `statement` qui la `states` n'a été `read` par les tentatives refusées | trou de contrat | référence composite, `steps.0`, `abort.0` |
| **D2, corrigé au premier retry** | une `form` dont les épisodes sont `corrected-by` le même Y dans au moins 2 tâches, en un retry | trou de contrat si D1 le confirme, sinon politique apprise | la référence composite (Y = `test.speedFloorPercent`, 12 fois) |
| **D3, divergence entre modèles** | une `form` fréquente sous un `model` et rare sous un autre, sur les mêmes tâches | trou de contrat (ambiguïté) | `reference` : citation chez Sonnet, identifiant chez GPT et Fable |
| **D4, artefact du harnais** | une `attempt` coupée (troncature), refusée avant le guard, ou une boucle de lectures refusées ; un `statement` du brief qui promet un champ absent de l'état lu | artefact du harnais | troncature, boucle de lecture, `previous` promis |
| **D5, régression** | une `form` dont la fréquence change entre deux `fingerprint` reliés par `changed` ; le `statement` modifié est désigné | régression | `/steps/0/reason` : 0 sur 3 avant, 3 sur 3 après |
| **D6, nature d'une entrée de mémoire** | `memory-entry → compensates → rule` sans `statement` lu : un trou de contrat déguisé. Une entrée sur l'ordre du travail : une politique. Une entrée reliée à des `fact` ou à des mesures de l'installation : une connaissance du domaine | selon le cas | la règle apprise par Sonnet |
| **D7, lacune de la bibliothèque** | une `constant` sans `bound-by` ; un `fact` cité faux dans plusieurs tâches ; un document cité et non signé | lacune de la bibliothèque | (à venir) |
| **D8, erreur du modèle** | une `form` isolée, dont la `rule` est énoncée et lue, sans divergence entre modèles | erreur du modèle : comptée, sans recommandation | v4 |

Le seuil de récurrence reprend celui de la mémoire : au moins 2 tâches.

## Le registre des règles du guard

D1 a besoin du lien `states`. Aujourd'hui, il n'existe que dans ma tête.

- **Chaque vérification du guard a un code stable.** `UNKNOWN_UNIT` et `INVALID_REFERENCE_CARDINALITY` existent déjà ; il faut généraliser aux autres.
- **`specs/<topic>/rules.contract.json`** associe à chaque code les `statement` qui l'énoncent, par leur chemin (schéma, clé de mots, grammaire), et les `convention` qu'il suppose.
- **Un test de conformité** vérifie que chaque code a au moins un énoncé existant, sinon il est marqué « tacite, voulue ». Une règle muette ne peut plus apparaître en silence.
- **C'est ce registre qui donne au graphe ses liens `states` et `applies`.** C'est aussi la version durable du principe qu'on s'est donné : écrire le contrat plutôt que l'apprendre.

## De la découverte à la recommandation

Pour chaque constat récurrent, une **usine de recommandation** (topic, guard, playbook, script de remplacement, sur le modèle de la réflexion) rédige la proposition. Elle lit le graphe pour voir le chemin du constat, les énoncés concernés et ce qu'ils disent aujourd'hui.

- **Contrat** : un nouveau texte pour un `statement`, en anglais uniquement pour ce que lisent les modèles. Son guard refuse un exemple qui contredit une `convention` du graphe : c'est la leçon de `/steps/0`, que le graphe rend vérifiable.
- **Message du guard** : dire la vraie raison, sans changer la décision.
- **Décision du guard** : proposée seulement, marquée « change ce qui est accepté », avec un niveau d'approbation plus élevé.
- **Bibliothèque** : un fait manquant ou ambigu, déposé sur le rayon des propositions, non signé.
- **Mémoire** : retirer une entrée qui compense une règle maintenant énoncée, ou la re-classer.

Chaque proposition porte :

- sa classe ;
- le chemin du graphe qui la justifie ;
- les comptes (tâches, modèles) ;
- le texte proposé ;
- l'effet attendu ;
- un plan de vérification : quelles tâches rejouer, dans quelles conditions, avec combien de tâches.

## La gouvernance

- **Les propositions vont sur le rayon des propositions.** Mother les annonce, la page de la bibliothèque les montre avec leur chemin dans le graphe, et le rôle `authorised-signatory` les signe ou les refuse. Aucune n'est appliquée sans signature. Un modèle ne signe jamais.
- **Signée, une proposition est appliquée dans un fork**, puis mesurée par son plan de vérification (le driver et les conditions de `scripts/learning-experiment` servent tels quels). Le résultat revient avec la proposition :
  - amélioration : elle est intégrée au dépôt par un commit humain ;
  - effet nul ou régression : elle est rejetée, avec la mesure.
- **L'évaluateur surveille aussi ses propres corrections.** Tout changement de texte crée une nouvelle `fingerprint`, et D5 compare les formes avant et après.

## Quand il tourne

- **Après chaque tâche**, en léger : D4 et D8, qui ne regardent que la tâche. Les artefacts graves, comme une boucle ou une troncature, sont signalés tout de suite.
- **Par lots** (sur demande, ou toutes les N tâches d'un topic) : le graphe est reconstruit, puis D1, D2, D3, D5, D6 et D7 tournent.
- **Toujours en lecture seule**, dans un fork comme sur le dépôt. L'application passe par un fork.

## Comment on sait qu'il marche

Les huit cas du tableau du début forment un corpus de test : leurs traces sont conservées dans `docs/experiments/*`, et certaines tâches dans les forks. L'évaluateur doit :

- classer chacun comme on l'a fait, avec le bon chemin ;
- ne rien recommander pour v4 ;
- désigner le `statement` modifié pour `/steps/0`.

C'est le test de non-régression de l'évaluateur lui-même, sans modèle pour les détecteurs.

## Ce qu'il faut ajouter au harnais

1. **L'empreinte du dépôt dans chaque manifeste** (le commit et son état), à côté de `tools.sha256` et `prompt.sha256`, pour les nœuds `fingerprint` et les liens `changed`.
2. **Des codes stables pour les refus du guard**, pour les nœuds `rule`.
3. **Le registre des règles** et son test de conformité, pour les liens `states` et `applies`.
4. **Les traces conservées jusqu'au passage de l'évaluateur**, pour le lien `read`. Les dossiers de tâches des forks ne sont pas versionnés, et la suppression du fork contaminé a déjà coûté trois traces.

## Plan

- **E0. Le graphe du harnais.** L'ontologie en spec, le constructeur dérivé (sur le modèle de la physique : le `Graph` du cœur, des nœuds typés), les nœuds dont E1 a besoin (tâches, épisodes, tentatives, formes, corrections, modèles, empreintes, énoncés lus), et l'outil de parcours.
- **E1. Premiers détecteurs, sans le registre.** D4, D5, D8, puis D2 et D3, avec la page qui montre les constats et leurs chemins, et le corpus de test.
- **E2. Le registre des règles.** Les codes du guard, `rules.contract.json` et son test de conformité, les liens `states` et `applies`, puis D1 et D6.
- **E3. L'usine de recommandation.** Elle lit le graphe. Son guard vérifie qu'un exemple ne contredit aucune convention. Ajoutent aussi D7 et les propositions pour la bibliothèque.
- **E4. La boucle de vérification.** La proposition signée est appliquée dans un fork, mesurée, puis intégrée ou rejetée avec sa mesure.

E0 à E2 suffisent à retrouver les huit cas sans modèle. E3 et E4 ferment la boucle que nous avons faite à la main pendant deux jours. Plus tard, les mêmes nœuds accueilleront la connaissance du domaine (le comportement de l'épurateur, les causes d'abort, les écarts du jumeau), reliée aux faits signés et aux paramètres du jumeau.
