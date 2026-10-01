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
- **E5. Le diagnostic par reasoner** (conçu le 1er octobre, à faire avant E4). Les détecteurs ne donnent plus que des pistes. Un reasoner les diagnostique, le harnais vérifie ses prédictions, et la confiance est calculée puis calibrée. Voir la section E5 plus bas.

## E1, fait (2026-09-30)

- **Les détecteurs** sont dans `lib/evaluator.ts` (D4, D5, D2, D3, D8). Ce sont des requêtes sur le graphe, sans modèle, et leurs seuils sont dans `specs/harness/evaluator.json`.
- **L'outil** `station.harness_evaluate` les lance sur l'atelier du dépôt ou sur plusieurs forks ensemble. La page `dashboard/evaluator.html` (ouverte depuis la bibliothèque) montre les constats par classe, avec leur chemin, et permet de parcourir le graphe de nœud en nœud.
- **Le corpus** : `tests/fixtures/evaluator` contient les tâches réelles de neuf forks, copiées allégées par `scripts/evaluator/corpus.mjs`. `tests/evaluator.test.ts` y vérifie chacun des huit cas.

Ce qu'E1 a dû ajouter au graphe :

- **Plusieurs ateliers.** Un graphe peut lire plusieurs ateliers à la fois. Une tâche héritée d'un fork parent n'est comptée qu'une fois.
- **Les refus du harnais.** Ceux qui précèdent le guard (troncature, schéma, répétition) sont des formes à part, et les étapes refusées hors des capacités jugées deviennent des nœuds `step`.
- **La mémoire lue**, prise dans la trace. Deux tâches ne sont comparées que si elles ont lu les mêmes textes, mémoire comprise.
- **L'origine du fork dans l'empreinte.** Avant E0, le `tools.sha256` d'un manifeste ne couvrait pas les schémas d'entrée : exp3 et exp6 avaient la même empreinte alors que le contrat avait changé entre les deux. Pour ces manifestes, le commit d'origine du fork fait partie de l'empreinte, et D5 lit dans git les fichiers changés entre deux commits : textes, réglages du modèle (`profiles/`), code.
- **Le jugement du guard dans les vieux manifestes.** Un manifeste écrit avant la marque `judged` retrouve le jugement du guard à partir des mots de son refus (`guard.refused` du topic).
- **Le cas** d'une tâche est sa requête, sans les mesures ni les dates. D3 compare deux modèles sur les mêmes cas.
- **Les tâches scriptées sont écartées.** Ce sont des doublures dont les erreurs sont écrites exprès (`models.ignore`).
- **Les parenthèses imbriquées.** `shapesOf` les retire désormais : le texte d'un modèle cité par le guard en contient parfois.

Ce qu'E1 retrouve des huit cas :

| Cas | E1 | Détecteur |
|---|---|---|
| Troncature à 4096 | artefact du harnais, 13 appels ; disparue à l'empreinte suivante, qui change `profiles/anthropic-sonnet.json` | D4, D5 |
| Référence composite | trou de contrat : même correction (`reference:narrowed`) dans 22 tâches, au premier retry ; 6 sur 10 chez Sonnet, 0 sur 10 chez GPT sur les mêmes cas ; disparue après la correction du contrat, `specs/procedure/words.json` nommé | D2, D3, D5 |
| `Speed` en percent | récurrent (3 tâches), non classé : le refus du guard ne nomme pas de chemin, donc aucune correction ne s'y rattache | pour D1 |
| Boucle de lecture | artefact du harnais : deux tâches finies en boucle sur la relecture refusée | D4 |
| Historique fictif | non vu : aucun détecteur d'E1 ne compare ce qu'un brief promet avec ce que l'état contient | à venir |
| `steps.0` (GPT) | une constante sans justification, corrigée en l'ajoutant, chez Sonnet et chez GPT ; trou de contrat ou politique, D1 tranchera | D2 |
| `/steps/0/reason` | régression, avec le texte changé désigné (la description de `workspace.read`, conservée) ; cas **reconstitué** dans le test, les traces ayant été perdues avec le fork | D5 |
| v4 | erreur du modèle, sans recommandation | D8 |

Deux choses que personne n'avait lues sont apparues dans les forks :

- `procedure.analyse` est refusé par son schéma dans 10 tâches de Sonnet (`evidence` envoyé autrement qu'en liste) ;
- 25 relectures ont été refusées comme répétitions, dans 19 tâches.

Les limites d'E1 :

- Deux conditions parallèles (exp-learn puis exp-control) sont vues comme deux états successifs du harnais. D5 les compare donc comme un avant et un après.
- Les réglages du modèle (sa limite de sortie) ne sont pas dans le manifeste d'une usine. On ne les retrouve que par git, pour les runs d'avant E0.
- Une même forme peut couvrir deux causes. « L'analyse dit que * change » réunit v4 (erreur du modèle) et v9 (la convention de chemin). E1 la laisse non classée ; la convention du registre (E2) les séparera.

## E2, fait (2026-09-30)

**Le registre des règles du guard** est dans `specs/procedure/rules.contract.json` (et le code qui le lit, dans `lib/rules-register.ts`). Chaque vérification y a :

- **un code stable.** Les règles du document signé gardent leur identifiant (`floor.stop`, `bounds.abortCeiling`…) et sont reconnues à leurs propres mots ; les vérifications écrites dans le code reçoivent un code (`REFERENCE_NOT_A_FACT`, `SAFETY_UNJUSTIFIED`, `UNKNOWN_UNIT`…) ;
- **un motif qui reconnaît son refus.** Aucun code n'a été ajouté au texte des refus : ce que lisent les modèles ne change pas, ce qui évite de reproduire l'amorçage de `/steps/0`, et les vieux manifestes sont lus comme les nouveaux ;
- **les énoncés qui la disent.** Un énoncé est un fichier du contrat (avec un pointeur JSON quand c'est du JSON) et une phrase qu'il doit contenir, ou un document de la bibliothèque ;
- **les conventions qu'elle suppose.** Par exemple `path-keys` : un élément de liste se nomme par sa clé ;
- **un statut.** Une règle est *énoncée*, *tacite* (voulue : le modèle n'y peut rien, ou cela va de soi), ou *lacune* (dite nulle part avant un refus, en attente d'une décision).

**Le test de conformité** est `tests/rules-register.test.ts`. Il vérifie que :

- chaque énoncé contient aujourd'hui sa phrase ;
- chaque règle du document signé est dans le registre ;
- l'exemple de chaque code n'est reconnu que par ce code ;
- chacun des 66 problèmes de refus du corpus est reconnu par un code et un seul.

Les refus du 28 septembre, rédigés avant que les règles passent dans le document signé, sont reconnus par des motifs anciens, chacun avec son exemple. Les 671 problèmes de l'atelier du dépôt sont ainsi tous reconnus par un code unique.

**Qu'une tâche ait lu un énoncé** se juge sur le texte de la version sous laquelle elle a tourné :

- les mots conservés dans le stockage de l'atelier, sinon git au commit du fork ou du dépôt ;
- pour un document de la bibliothèque, le fait qu'elle l'a lu (`library.read`) avant sa première soumission ;
- pour les manifestes d'avant E0 hors d'un fork, la version n'est pas connue, et l'évaluateur le dit au lieu de deviner.

**Les nouveaux détecteurs :**

- **D1** : une règle refusée au premier essai de plusieurs tâches dont aucun texte ne l'énonçait (lacune de contrat, avec ce qui l'énonce depuis). Il signale aussi une règle énoncée, lue, et refusée quand même (`stated-not-followed`).
- **D6** : ce qu'est une entrée de mémoire, d'après les règles des refus sur lesquels elle repose. Une règle non énoncée donne une lacune de contrat compensée ; une règle énoncée, une politique apprise ; aucune règle, de la connaissance du domaine.
- **Les classes qu'E1 laissait ouvertes** sont maintenant tranchées : D2 (lacune ou politique), D3 (quel texte), D8 (erreur du modèle confirmée ou non).

**Les lacunes que le registre fait apparaître**, dites nulle part avant un refus :

- les conditions d'arrêt obligatoires (`abort.required` : le CO2 et une commande refusée) ;
- la surveillance d'un volume occupé (`monitoring.occupied` : nommer chaque occupant et s'arrêter sur ses signes vitaux) ;
- la forme de l'identifiant d'une procédure (`INVALID_ID`).

Elles attendent la décision d'une personne (E3).

**Les huit cas, avec E2 :**

| Cas | E2 |
|---|---|
| Troncature à 4096 | inchangé (D4, D5) |
| Référence composite | `REFERENCE_NOT_A_FACT` refusée au premier essai de 16 tâches (23 avant la correction du 1er octobre, voir plus bas) dont aucun texte ne disait « un seul identifiant » ; énoncé depuis par `words.json` et le schéma de `justify.ts` (D1) ; D3 : dit à aucun des deux modèles |
| `Speed` en percent | `UNKNOWN_UNIT` au premier essai de 2 tâches (3 avant la correction du 1er octobre) dont le schéma ne disait pas que la grandeur d'une propriété est celle du registre ; énoncé depuis (D1) |
| Boucle de lecture | inchangé (D4) |
| Historique fictif | toujours non vu |
| `steps.0` (GPT) | la règle de justification était dite, pas la convention de chemin qu'elle suppose : lacune de contrat (D1, D2) |
| `/steps/0/reason` | inchangé (D5, reconstitué) |
| v4 | erreur du modèle confirmée : la règle était dite et lue. La forme partagée avec v9 se sépare tâche par tâche : v9 n'avait pas reçu la convention de chemin, v4 avait reçu tout |

**D6 sur l'entrée apprise par Sonnet** : elle compense `REFERENCE_NOT_A_FACT`, qu'aucun texte reçu par ses échecs n'énonçait. C'est une lacune du contrat, apprise au lieu d'être écrite, et devenue redondante depuis que le contrat l'énonce.

E0 à E2 suffisent à retrouver sans modèle les huit cas, sauf l'historique fictif.

## E3, fait (2026-10-01)

**L'usine de recommandation** est le topic `recommendation` (`harness/topics/recommendation/index.ts`, `specs/recommendation/*`), construit sur le modèle de l'usine de playbooks : une conduite en trois étapes (le plan, la recommandation, la remise), un prompt et des mots en anglais, et une doublure scriptée.

**Une tâche, un constat, une recommandation.** Ce que l'usine reçoit est lu dans le graphe (`lib/recommendation.ts`) :

- le constat entier ;
- les textes qu'elle peut changer, avec ce qu'ils disent aujourd'hui : les énoncés de la règle, ceux des conventions qu'elle suppose, ceux des règles du même genre, la description d'une capacité refusée, et le prompt du topic en dernier recours ;
- l'entrée de mémoire ou les documents de la bibliothèque concernés ;
- la règle et ses propres mots ;
- les cas à rejouer ;
- ce qu'on mesure ;
- les conventions.

**Le chemin et les preuves du constat** sont attachés par le harnais à ce que l'usine propose ; le modèle n'en écrit aucun.

**Le garde est déterministe** et la station le refait avant de déposer. Il refuse :

- un genre que la classe du constat ne prend pas (`contract`, `guard-message`, `guard-decision`, `library`, `memory`) ;
- une cible qui n'est pas offerte ;
- un texte « actuel » qui n'est plus celui du disque ;
- un texte proposé identique, en français, ou avec un tiret cadratin ;
- un exemple qu'une convention contredit (un élément de liste nommé par sa position, `/steps/0`, `abort.0` : la leçon de `/steps/0/reason`) ;
- un changement de ce que le garde accepte qui ne se déclare pas comme tel ;
- une vérification qui ne rejoue pas les cas du constat, en compte moins de cinq, ou ne mesure pas ce dont il s'agit.

**La gouvernance.**

- La recommandation acceptée est déposée sur le rayon des propositions de la bibliothèque (`library.propose`). Elle y figure comme une page que lit une personne, accompagnée de la recommandation elle-même, et la signature couvre les deux.
- Mother l'annonce, et le rôle `authorised-signatory` est sollicité.
- Signée, elle ne change encore rien : elle sera appliquée dans un fork et mesurée (E4).

**La station.** `station.recommend` choisit le premier constat qui n'a pas encore de recommandation, dans cet ordre : régressions, lacunes de contrat, de bibliothèque, artefacts, règles dites et non suivies. Elle peut aussi prendre le constat qu'on lui nomme. Un constat qui a déjà sa recommandation, ou qui n'a rien à recommander, est refusé. La page de l'évaluateur montre la recommandation d'un constat, ou un bouton pour la demander ; c'est une personne qui le clique, jamais la page.

**D7, les lacunes de la bibliothèque.** Le registre marque les règles qui concernent la bibliothèque (`concerns: "library"` : un document que personne n'a signé, un fait cité là où il ne borne pas). D7 les relève quand elles reviennent, avec les documents que nomment leurs propres refus.

**Un constat clos** est un constat dont toutes les règles manquantes sont énoncées aujourd'hui. Il n'a plus rien à recommander, reste visible, et se marque « stated since ». Seul D6 fait exception : une entrée de mémoire devenue redondante se retire.

**Ce que la doublure scriptée sait écrire, et que vérifie `tests/recommendation-factory.test.ts` sur le vrai corpus :**

- retirer l'entrée apprise par Sonnet : une lacune comblée depuis, la mémoire devenue redondante ;
- ajouter à la description d'une capacité ce que son schéma exige, quand le harnais refuse ses arguments (`procedure.analyse` : `evidence` est une liste) ;
- faire signer un document (D7, dans l'atelier du dépôt : `FACT_UNSIGNED`).

Tout le reste revient au modèle, qui écrit avec ce prompt et sous ce garde. E3 et E4 ferment la boucle que nous avons faite à la main pendant deux jours. Plus tard, les mêmes nœuds accueilleront la connaissance du domaine (le comportement de l'épurateur, les causes d'abort, les écarts du jumeau), reliée aux faits signés et aux paramètres du jumeau.

## Le premier essai réel (2026-10-01)

L'usine a tourné avec Sonnet 5.5 sur trois constats, dans des forks à part (`docs/experiments/2026-10-01-recommendation-trial`). L'essai a corrigé deux défauts du harnais et un de l'évaluateur.

- **Le Broker** gardait une session qu'il n'avait pas pu ouvrir. La station avait demandé la bibliothèque au démarrage, avant qu'elle soit publiée, et ne l'a plus jamais atteinte. Ses trois recommandations, acceptées par le garde de l'usine, ont été refusées pour « fetch failed ». La session ratée est maintenant rouverte à l'appel suivant, et la station refuse de continuer quand elle ne peut pas lire le rayon.
- **L'usine recevait trop et pas assez.** Elle recevait du code entier comme cible (`justify.ts`, 28 000 caractères), mais pas ce que le garde vérifie. Pour `expected`, le modèle a écrit une règle à lui (des prédictions chiffrées), alors que le garde ne vérifie que la présence du champ. Elle ne reçoit maintenant que des textes qu'une recommandation peut changer, avec la vérification du garde, et son prompt dit de recommander ce que le garde applique, rien de plus. Au second passage : `expected` dit exactement la règle, et la tâche de mémoire passe de 86 000 à 19 000 jetons lus.
- **D1 comptait comme premier essai une tentative qui suivait une troncature.** Le constat `expected` venait de deux tâches dont la soumission avait été coupée à 4096 jetons ; le refus portait sur la révision envoyée ensuite. Une tentative qui suit une troncature ou un refus du harnais n'est plus un premier essai sur le contrat. `expected` n'est plus un constat, et les comptes de D1 baissent (16 au lieu de 23, 2 au lieu de 3).

Un troisième passage a porté sur des constats plus durs (l'atelier du dépôt, les tâches de Haiku).

- **La règle de surveillance**, dite nulle part (une lacune du registre), a été bien énoncée.
- **La recommandation de bibliothèque était fausse.** Elle proposait de signer une fiche déjà signée, et prétendait qu'une fois signée, un de ses faits pourrait justifier la vitesse d'une étape, alors que la règle `floor.step` l'interdit.
- **Les troncatures** ont reçu une réponse trop large : plusieurs règles ajoutées à une seule recommandation.

Les corrections :

- D7 se ferme quand ses documents sont signés depuis ;
- l'usine reçoit l'état des signatures ;
- le garde refuse de faire signer un document déjà signé ;
- les cas à rejouer sont les tâches quand le demandeur ne les distingue pas ;
- le prompt demande un seul changement par constat.


## E5, le diagnostic par reasoner (conception, 2026-10-01)

### Pourquoi le script ne suffit pas

Sur les six constats donnés à l'usine de recommandation pendant les essais, trois étaient justes et actuels : le schéma de `procedure.analyse`, l'entrée de mémoire redondante, la règle de surveillance dite nulle part. Les trois autres ne l'étaient pas :

- **`expected` était faux.** C'était la séquelle d'une soumission coupée, pas une règle énoncée et non suivie.
- **D7 était périmé.** Les documents avaient été signés depuis.
- **La troncature était réglée.** Le passage à 8192 jetons l'avait fait disparaître, et D5 le disait lui-même, pendant que D4 continuait de la recommander.

Les huit cas du corpus, eux, étaient tous retrouvés. Mais les détecteurs avaient été écrits à partir d'eux : le corpus mesurait que le code reproduisait nos conclusions, pas qu'il en tirait de justes de cas nouveaux.

Le script sait **trouver** : lire les traces, relier, compter. Il ne sait pas **diagnostiquer**. Dire pourquoi c'est arrivé et si c'est encore vrai demande de former des hypothèses, de les confronter aux faits et d'en écarter. Chaque correction au cas par cas (une condition de plus, un détecteur de plus) a réparé un échec sans empêcher le suivant.

Le diagnostic revient donc à un reasoner. Mais un modèle qui note ses propres réponses converge vers des réponses sûres d'elles, pas vers des réponses justes. La confiance n'est donc jamais déclarée par le modèle : le harnais la calcule à partir de vérifications qu'il exécute lui-même. C'est le principe de tout le projet appliqué à l'évaluateur : le modèle propose, des règles déterministes jugent.

### Le principe

```
détecteurs (script)      ->  pistes
usine de diagnostic      ->  diagnostic : cause, classe, actualité, preuves, prédictions
harnais                  ->  exécute les prédictions ; une prédiction réfutée revient au modèle
second reasoner          ->  le même travail, sans voir le premier
harnais                  ->  confiance = prédictions confirmées, accord des deux, alternatives écartées
seuil calibré            ->  au-dessus : l'usine de recommandation ; en dessous : une personne
```

Ce qui reste au script, parce qu'il le fait bien et sans se tromper :

- le graphe et les pistes ;
- l'exécution des prédictions ;
- le garde ;
- le calcul de la confiance ;
- la calibration.

Ce qui revient au modèle : les hypothèses, le choix des preuves, les prédictions qui départagent les hypothèses.

### Les pistes

D1 à D8 continuent de tourner, mais leur sortie change de statut : une **piste** (ce qui mérite qu'on regarde, avec ses nœuds et ses comptes), plus un verdict. Leur classe devient une hypothèse de départ parmi d'autres. Une piste n'atteint jamais l'usine de recommandation sans diagnostic.

### L'usine de diagnostic

C'est un topic `diagnosis`, construit comme les autres usines : une conduite en étapes, un prompt et des mots en anglais, un garde déterministe et une doublure scriptée. Une tâche correspond à une piste.

**Ce qu'elle reçoit** (`observations.diagnosis`, lu dans le graphe, jamais écrit par un modèle) :

- la piste entière ;
- le voisinage de ses nœuds dans le graphe, à deux sauts ;
- les règles du registre qu'elle touche, avec leur vérification ;
- l'état d'aujourd'hui des choses dont elle dépend :
  - les énoncés tels qu'ils sont ;
  - les signatures ;
  - le profil du modèle ;
  - les empreintes postérieures ;
- les hypothèses déjà réfutées pour cette piste, avec la prédiction qui les a réfutées.

**Ses outils**, tous en lecture seule :

- **`station.harness_graph`** : un nœud et ses liens, les nœuds d'un type.
- **Une étape d'une tâche, réduite** : ce que le modèle a reçu (son état, son brief) et ce qu'il a envoyé (les arguments), lu dans la trace. C'est ce qui manquait pour voir qu'un champ promis par un brief était absent de l'état.
- **Un texte du contrat à une version** : celle d'une tâche, ou aujourd'hui.
- **La bibliothèque** : documents, faits, signatures.

**Ce qu'elle rend** (`diagnosis.submit`) :

- la **cause**, en une phrase ;
- la **classe**, dans la taxonomie de l'évaluateur ;
- l'**actualité** : encore vrai, réglé depuis, ou inconnu ;
- les **preuves**, des nœuds du graphe ;
- les **prédictions**, au moins trois, et parmi elles au moins une sur la cause, au moins une sur l'actualité, et au moins une qui écarte une hypothèse concurrente qu'elle nomme.

### Le langage des prédictions

Une prédiction est un **prédicat fermé** que le harnais sait évaluer sur le graphe et ses sources, et qui rend vrai, faux ou inconnu, avec les nœuds qui le montrent. Le modèle les choisit et les remplit ; il ne les évalue jamais.

| Prédicat | Ce qu'il vérifie | Ce qu'il aurait départagé |
|---|---|---|
| `preceded-by` (tâche, étape, issue) | la tentative précédente a cette issue : coupée, refusée par le harnais, refusée par le garde | `expected` : la soumission précédente était coupée |
| `stated-at` (énoncé, version : tâche ou aujourd'hui) | le texte à cette version contient la phrase | les lacunes de contrat, et leur fermeture |
| `signed` (document, moment : tâche ou aujourd'hui) | le document est signé, et sa signature valide | D7 : signé depuis |
| `rate` (forme, modèle, empreinte, comparaison, valeur) | la part des tâches où la forme apparaît, sous une empreinte | la troncature, disparue après le profil |
| `read-before` (tâche, document) | le document a été lu avant la première soumission | une règle de la bibliothèque, lue ou non |
| `in-state` (tâche, étape, pointeur) | ce que le modèle a reçu contient ce champ | l'historique promis par un brief et absent |
| `run-setting` (tâche, réglage, comparaison, valeur) | le réglage du modèle sous lequel la tâche a tourné : limite de sortie, effort | la troncature, sa cause |
| `same-form` (tâches, forme) | ces tâches ont été refusées pour cette forme | une forme, une cause ou deux |

**Le langage est fermé exprès.** Une cause qu'il ne sait pas exprimer donne des prédictions « inconnu », et la piste va à une personne, ce qui est sûr. On l'étend quand un cas réel le demande, avec un test, comme les détecteurs.

`run-setting` suppose que le manifeste enregistre les réglages du modèle. C'est le point ouvert d'E1, à faire en premier.

### Le garde du diagnostic

Il refuse, avant toute vérification :

- une preuve qui n'est pas un nœud du graphe ;
- une classe hors de la taxonomie ;
- une prédiction mal formée ;
- trop peu de prédictions, ou aucune sur l'actualité, ou aucune hypothèse écartée ;
- une prédiction qui ne fait que redire la piste (les mêmes nœuds et le même compte que ceux qui l'ont fait naître) : elle ne départage rien.

Puis **le harnais exécute les prédictions.** Une prédiction réfutée revient au modèle comme un refus du garde aujourd'hui : la prédiction, ce qui a été observé, les nœuds. Le modèle révise sa cause ou ses prédictions. Il ne peut pas se contenter de retirer la prédiction gênante, car les minimums restent dus. Trois refus sur les mêmes points font une tâche bloquée : la piste va à une personne, comme « diagnostic impossible ».

### Le second reasoner

Un autre modèle, d'une autre famille quand c'est possible, reçoit la même piste et les mêmes outils, sans le premier diagnostic. Les deux familles partagent des angles morts différents. Deux diagnostics s'**accordent** quand ils ont la même classe, la même actualité, et des preuves qui se recoupent sur le nœud de la cause. On compare des nœuds, pas des phrases. En cas de désaccord, la confiance est plafonnée, et les deux diagnostics vont ensemble à la personne qui tranche.

### La confiance

Calculée par le harnais, jamais déclarée par le modèle :

- **la part des prédictions confirmées.** Une prédiction « inconnu » compte comme non confirmée ;
- **l'accord des deux reasoners** : un désaccord plafonne la confiance ;
- **le nombre d'hypothèses concurrentes écartées par une prédiction confirmée** ;
- **la taille de l'échantillon** : une piste de deux tâches ne peut pas atteindre la confiance d'une piste de vingt.

Les poids et le seuil sont dans `specs/harness/diagnosis.json`. Ils ne sont jamais choisis au jugé : la calibration les fixe.

### La calibration

Un corpus **étiqueté** (`tests/fixtures/evaluator/labels.json`) dit, pour chaque piste, la cause, la classe et l'actualité justes, avec qui les a établies et comment. On y met :

- les huit cas du début ;
- les verdicts des essais : `expected` faux (séquelle de troncature), D7 périmé (signé depuis), la troncature réglée (le profil), le schéma de `procedure.analyse` juste, l'entrée de mémoire juste et redondante, la surveillance juste et ouverte.

Chaque passe mesure la **précision par tranche de confiance**. Le seuil est le plus bas qui donne la précision visée (par exemple 9 sur 10) sur ce corpus. La précision du script seul, environ une sur deux sur les essais, est le point de départ à battre.

Pour ne plus mesurer sur ce qui a servi à construire, un second corpus est **réservé** : les prochains runs réels, étiquetés par une personne avant que l'évaluateur ne les lise. Le seuil n'est jamais réglé sur lui. Il sert à vérifier que la précision tient sur des cas nouveaux.

### La gouvernance

- **Au-dessus du seuil**, le diagnostic, et non la piste brute, est donné à l'usine de recommandation. Elle reçoit la cause, les preuves et les prédictions confirmées, et sa recommandation porte la confiance.
- **En dessous**, une personne voit la piste, les diagnostics, les prédictions confirmées et réfutées, et décide.
- Rien n'est jamais signé par un modèle, et rien de signé n'est appliqué hors d'un fork mesuré (E4).
- La page de l'évaluateur montre pour chaque piste son diagnostic, sa confiance et ses prédictions, chacune avec son résultat.

### Le coût

Pour une piste : deux reasoners, chacun quelques tours de 10 000 à 30 000 jetons lus, soit de l'ordre de 100 000 à 300 000 jetons. Les passes se font donc **par lots**, sur demande, jamais après chaque tâche, en commençant par les pistes les plus graves.

Un diagnostic est gardé avec l'empreinte de ses sources : les tâches, les énoncés, les signatures. On ne refait un diagnostic que si l'une d'elles a changé.

### Ce qui peut mal tourner

- **Deux modèles qui se trompent ensemble.** C'est pour cela que la confiance repose d'abord sur les prédictions exécutées par le harnais, et que la calibration se mesure sur un corpus réservé.
- **Des prédictions faciles.** Le garde refuse celles qui redisent la piste, et exige une hypothèse écartée. La calibration montrera si cela suffit.
- **Un langage trop pauvre.** Le cas sort en « inconnu » vers une personne. On l'étend, au cas réel près.
- **Le coût.** Lots, priorités, et diagnostics gardés tant que leurs sources n'ont pas changé.

### Le plan

- **E5.0 Mesurer.** Écrire les étiquettes du corpus. Mesurer la précision des détecteurs actuels sur ce corpus. Enregistrer dans le manifeste les réglages du modèle (limite de sortie, effort), dont `run-setting` a besoin.
- **E5.1 Les prédictions.** Le langage fermé et son exécuteur sur le graphe, déterministes, chaque prédicat testé sur le corpus.
- **E5.2 L'usine de diagnostic.** Le topic, son garde, sa doublure scriptée, ses outils de lecture (étape réduite, texte à une version).
- **E5.3 Le second reasoner et la confiance.** L'accord par nœuds, le calcul, `specs/harness/diagnosis.json`.
- **E5.4 La calibration réelle.** Les deux reasoners sur le corpus étiqueté, la précision par tranche, le seuil. Puis une vérification sur le corpus réservé, dès qu'il existe.
- **E5.5 Le branchement.** L'usine de recommandation ne reçoit plus que des diagnostics au-dessus du seuil ; la page montre diagnostics et prédictions.

E4, la boucle de vérification, vient ensuite. Elle mesurera des recommandations nées de diagnostics, et ses mesures entreront à leur tour dans la calibration : une recommandation qui ne produit pas l'effet prédit dit que son diagnostic était faux.
