# Le refactoring du harnais de l'usine de graphes : l'état de raisonnement à la place de la transcription

*Fait le 25 septembre 2026 au soir, sur le brief « Graph Factory Harness,
Refactoring Brief » de Guillaume, dans l'ordre qu'il donne. Ce document dit
ce qui a été fait priorité par priorité, ce que ça a mesuré, et ce qui
reste. Le code : `harness/core/reasoning-state.ts`, `compact.ts`,
`runner.ts`, `workspace-observer.ts`, `topic.ts`, les adaptateurs
`harness/providers/*`, le sujet `harness/topics/graph/`, la page
`harness/browser/factory-loop.ts`.*

---

## 1. Ce que les traces disaient avant

Sur le quatrième passage (`exemple-mise-en-service-4.fr.md`), l'usine de
graphes d'Opus 5.5 a fait 5 appels pour 68 k jetons en entrée et 1,4 k en
sortie ; celle de Haiku 7 appels pour 114 k en entrée. Presque tout le
coût venait de la conversation rejouée à chaque pas : le brief et les
réponses des outils (le fichier de tâche, 17 k caractères ; le rayon, 9 k)
s'accumulaient, et la réponse de chaque outil y entrait deux fois (dans
l'observation et dans le `tool_result`). La taille de l'entrée croissait de
1 k à 23 k jetons en cinq pas.

## 2. Priorité 1 : le contexte

**L'état de raisonnement** (`reasoning-state.ts`). Le harnais reconstruit à
chaque pas, de façon déterministe, ce que le modèle lit :

| partie | ce qu'elle tient |
|---|---|
| `invariants` | l'objectif et ses sorties, le seuil, les contraintes ; les constantes connues avec leur statut (`documented`, `band`) et leur source ; ce qui manque ; qui et quoi ont été observés (les personnes, les appareils du registre) ; la forme de la télémétrie ; le rayon de la bibliothèque, chaque graphe avec ses variables et leur statut |
| `phase`, `iteration`, `budget` | où on en est, ce qui reste (pas et passages du bac à sable ; jamais l'horloge, voir plus bas) |
| `evidence` | ce que la tâche a lu jusqu'ici, chaque réponse compacte, par capacité et argument (dix au plus) |
| `hypothesis` | le candidat en cours : le graphe, ses variables avec leur statut (`fitted`, `device`, `documented`), les personnes à bord |
| `lastAction` | le dernier appel, son issue, sa réponse compacte, la poignée de sa réponse entière |
| `lastRefusal` | le dernier appel que le harnais a arrêté (la garde, le schéma) : la capacité, la raison, et l'entrée entière telle que proposée (bornée), pour corriger ce qui est écrit plutôt que le réécrire avec la même faute (passage 10, section 14) |
| `evaluation` | la dernière évaluation, compacte : statut, diagnostic, seuils par leur nom, couverture, résidus, paramètres (valeur, unité, nom, statut), variables au bord, plages d'identifiabilité (jamais un verdict), calibration et validation |
| `requirements` | les faits que la phase exige, chacun vrai ou faux |
| `openQuestions`, `nextActions` | ce que le sujet dit rester ouvert ; les capacités permises |

**Le mode « état » des adaptateurs.** `AnthropicProvider` et
`OpenAiCompatibleProvider` prennent `contextMode: "state"` : chaque pas est
un seul message (la situation et l'état), rien n'est rejoué, aucun
`tool_result`. Le slot `reasoner` porte le mode par conversation
(`decide { contextMode }`), le client du harnais le demande
(`ReasonerProvider.useContext`), et le slot `factory` le donne au sujet
`graph` seulement : les sujets `procedure` et `onnx` gardent la
conversation tant que leur état ne porte pas ce qu'ils lisent (essayé sur
la procédure : le modèle relisait sans fin ce que l'état ne gardait pas).

**Les réponses compactes et les poignées** (`compact.ts`). Un compacteur
par outil connu (un document de la bibliothèque : son identifiant, sa
taille, sa tête ; le rayon : les variables avec leur statut ; un gabarit :
ses variables, réglages et sondes, jamais son spec ; une évaluation : le
verdict, les résidus, les variables, les trois meilleurs essais), une tête
au-delà d'une taille pour les autres. La réponse entière d'un appel long va
dans l'atelier (`results/step-<n>-<capacité>.json`) et le modèle lit son
résumé et sa poignée ; `workspace.read` la lui rend s'il la veut.

**La télémétrie** (`manifest.telemetry`) : appels, jetons en entrée et en
sortie, cache lu et écrit, caractères du contexte par catégorie (prompt
système, outils, situation, observation, résultats d'outils, historique),
octets des réponses entières contre ce que le modèle en a lu.

**Deux pièges trouvés en route.**
- L'horloge dans l'état : le runtime relit le monde juste avant d'exécuter
  et refuse une décision dont l'observation a bougé (« Stale decision »).
  Une minute restante arrondie au dixième bougeait entre la décision et
  l'exécution. L'état ne porte plus l'horloge.
- Les recettes : la clé sous laquelle un pas est appris était
  `phase:capacité:issue`, la même après un candidat qui tient et après un
  qui échoue ; « évaluer encore » appris après un échec se rejouait après
  une réussite, jusqu'au budget. Le sujet ajoute le diagnostic du dernier
  candidat à la clé (`TopicDefinition.key`).

## 3. Priorité 2 : les transitions sur des faits

`requirementsOf` (sujet `graph`) : `telemetryAvailable`,
`knownConstantsResolved` (la tâche porte des constantes, ou un document a
été lu, ou le rayon tient un graphe de référence dont le gabarit les
porte), `referenceGraphsKnown`, puis `planAccepted`, `candidateEvaluated`,
`candidateHeld`. Le garde refuse `task.plan` tant que les trois premières
ne sont pas vraies, et dit ce qui les satisferait. Comme le runner lit le
rayon et la forme de la télémétrie une fois au départ, elles le sont dès le
premier pas : le chemin heureux est `task.plan`, `graph.evaluate`,
`task.done`, sans lecture.

## 4. Priorité 3 : la boucle scientifique

Le diagnostic est un état du harnais (`diagnose`, `evaluate.ts`), pas une
phrase du prompt :

| diagnostic | quand |
|---|---|
| `PASS` | la calibration tient le seuil (l'identifiabilité est un avertissement, pas un refus) |
| `INVALID_EVALUATION` | la couverture des prédictions manque (priorité 4) |
| `PARAMETER_MISMATCH` | une variable ajustée finit à moins de 2 % d'une borne de sa plage, la première fois pour cette structure ; ou une variable que le graphe dit être celle de l'installation a été tenue à une valeur (`heldFitted`) |
| `STRUCTURAL_MISMATCH` | un second échec de la même structure, quelles que soient les bornes : élargir encore ne rendrait pas la structure juste |
| `INSUFFICIENT_INFORMATION` | réservé : un harnais qui demande une expérience (pas construit) |

Le brief se branche dessus (« la panne est un paramètre : élargis seulement
si la physique le permet » ; « la panne est structurelle : ne touche plus
aux bornes, révise la topologie »), les questions ouvertes de l'état aussi.
La boucle est dessinée sous les douze étapes de la page de l'usine
(`graphs/factory-agent.spikypanda`, `factory-loop.ts`) et éclairée par le
diagnostic de chaque pas.

## 5. Priorité 4 : la couverture des prédictions

Avant tout résidu, `coverageProblems` vérifie que chaque colonne comparée
a une prédiction finie à chaque minute de la télémétrie ; sinon
`status: invalid`, `pass: false`, un diagnostic par manque
(`missing_prediction`, la colonne, la minute ; `missing_probe`). La cause
de la minute 60 nulle du quatrième passage : le bac à sable échantillonne
les ticks avant la durée, pas à la durée ; le passage tourne maintenant un
tick de plus.

## 6. Priorité 5 : le statut de chaque paramètre

Rien n'est réduit à « constante » : `known` (documentée, tenue), `device`
(le nombre propre de l'appareil enregistré, tenu), `band` (une bande
documentée, placée dedans), `fitted` (ce que seule l'installation connaît),
dans le gabarit, dans l'état (`hypothesis.variables`) et dans l'évaluation.
`gRest` reste `known` à 0,30 L/min (la bibliothèque de la NASA).

## 7. Priorité 6 : Qe et eta

Le nœud `Physics.Habitat:scrubber` calcule `removal = efficiency × flow ×
co2MassPerM3(ppm)` ; le gabarit écrit `flowAtFullM3ps = Qe / eta / 60` et
`efficiency = eta`, avec `Qe` le `effectiveFlowAtFull` enregistré fois 60.
Le débit d'air à pleine commande vaut donc le `flowAtFull` de la fiche
(0,055 m³/s) et le débit efficace le `effectiveFlowAtFull` enregistré
(0,016667) : le rendement n'est appliqué qu'une fois. Test :
`tests/habitat.test.ts`, « the scrubber's Qe and eta as the template maps
them ».

## 8. Priorité 7 : l'identifiabilité

`identifiabilityOf` : pour chaque variable ajustée, la plage qu'elle prend
parmi les essais dont le score est à un ppm (ou 10 %) du meilleur
(`nearOptimalRange`, l'amas du simplexe, qui ne dit presque rien), et la
plage qu'elle prend parmi tous les essais sous le seuil
(`underThresholdRange`, ce que la télémétrie a accepté). Depuis le soir du
25 septembre le candidat ne dit plus « identifiable » : aucune vraisemblance
de profil ni analyse de sensibilité n'existe, le statut est
`identifiabilityAssessment: NOT_ASSESSED`, l'avertissement donne les plages
sous le seuil (L de 0,067 à 0,107 kg au passage 13) et le brief demande de
le dire à la remise. Pas de covariance encore.

## 9. Priorité 8 : calibration contre validation

Chaque candidat porte `calibration: PASS | FAIL` et
`validation: NOT_PERFORMED` ; l'état et le brief disent à la remise que le
jumeau est calibré sur cette télémétrie et non validé sur un autre profil,
un autre état du sas, une autre occupation.

## 10. Priorités 9 et 10

Le graphe de bibliothèque est instancié, pas reconstruit ; le modèle
n'inspecte un nœud que s'il change la topologie. Le harnais tient l'état,
l'historique, les budgets, les transitions, les poignées, les règles de
validation et la comptabilité des jetons ; les outils la simulation,
l'ajustement, le score, la validation du graphe ; le modèle le choix de
l'hypothèse, le diagnostic, la révision.

## 11. Les tests du brief

| test | où | ce qu'il vérifie |
|---|---|---|
| A, chemin heureux | `graph.test.ts`, la boucle par le broker | trois appels utiles (plan, deux évaluations, remise), l'observation bornée (moins de 14 k caractères, sans croissance d'un pas à l'autre), les poignées dans `results/` |
| B, prédiction manquante | `coverageProblems`, une évaluation avec un bac à sable court | `invalid`, `pass: false`, le diagnostic nomme la colonne et la minute |
| C, écart de paramètre | `diagnose` par règle ; la boucle (L tenu) | `PARAMETER_MISMATCH`, `heldFitted: ["L"]` |
| D, écart de structure | `diagnose` par règle | un second échec de la même structure est structurel, celui d'une autre structure ne compte pas |
| E, non identifiable | `identifiabilityOf` ; la boucle | les plages proches de l'optimum, l'avertissement quand elles sont larges |
| F, compaction | `compactOutput`, `reasoningStateOf` ; la boucle | un résumé sous 900 caractères pour 2 000, l'état sous 6 k, la télémétrie de l'atelier |

## 12. La mesure

Le même exemple, le même modèle (Claude Haiku 4.5), la même tâche pour
l'usine de graphes (le registre et les personnes dans les observations),
avant et après. Les jetons sont ceux des réponses brutes de l'API ; le
cache tient le prompt système et les outils (4 496 jetons), écrit au
premier appel et relu ensuite.

| passage de l'usine de graphes | appels | entrée hors cache | cache relu | sortie | résultat |
|---|---|---|---|---|---|
| 5, conversation (`exemple-mise-en-service-4.fr.md`, Haiku) | 7 | **114 426** | 26 976 | 1 791 | 1 candidat, 5,8 / 4,3 ppm |
| 8, état, les types du graphe absents du rayon | 7 | **20 164** | 26 976 | 1 557 | 1 candidat, 4,6 / 2,8 ppm, identifiable (V 27,4, Vh 423, L 0,098 soit 2,15 m³/min, g 0,407) |
| 9, état, les types dans le rayon | **3** | **10 091** | 13 488 | 1 129 | 1 candidat, 5,7 / 0,8 ppm, identifiable (V 27,1, Vh 404, L 0,086 soit 2,2 m³/min, g 0,416) |
| 14, état, les trois boucles (section 14) | 3 | 9 356 | (cache non relu : prompt sous le minimum) | 1 094 | 1 candidat, 5,8 / 3,3 ppm, identifiabilité non évaluée (V 25,8, Vh 379, L 0,101, g 0,408) |

Les deux autres boucles, mêmes modèle et même exemple, avant et après leur
passage sur l'état (section 14) ; les jetons d'entrée sont ceux des
réponses de l'API, sans cache (le prompt de Haiku est sous le minimum) :

| boucle | passage | pas | entrée | sortie | ce qui s'est passé |
|---|---|---|---|---|---|
| Procedure Factory | 9, conversation | 14 | **228 696** | 4 969 | 1 refus (plancher 20 %), acceptée |
| Procedure Factory | 10, état | 25 | 190 173 | 19 800 | 8 refus par le schéma (`threshold: null`), la procédure refusée absente de l'état |
| Procedure Factory | 11, état, le refus dans l'état | 25 | 172 056 | 4 403 | 20 plans refusés (`required_output` avec son rendu) |
| Procedure Factory | 12, état, le nom exact dans la garde | 9 | **61 151** | 4 179 | 1 refus, acceptée |
| Procedure Factory | 14, état, les unités | 10 | 71 109 | 4 904 | 1 refus, acceptée |
| Observateur | 9, conversation | 7 | **103 866** | 6 281 | 5 lectures, 1 refus, acceptée |
| Observateur | 10, état | 6 | 36 594 | 5 151 | 4 lectures, 1 refus, acceptée |
| Observateur | 14, état, les unités | 8 | 54 848 | 7 021 | 5 lectures, 2 refus, acceptée |

La Procedure Factory divisée par 3,7 (passage 12) et l'Observateur par 2,8
(passage 10) ; le passage 14 est plus lourd que le 12 parce que la garde des
unités a refusé une fois de plus et que la procédure a relu le registre. Ce
que le passage 14 a montré de neuf : la garde des unités a refusé `eta`
écrit sans dimension contre une fiche pleine de pourcentages (100 %, 40 %),
et le modèle a « corrigé » en `eta = 40 percent`, un mauvais nombre pour
satisfaire une garde ; une constante sans dimension n'est plus vérifiée
contre un document (rien à convertir). Le reste de la demande est juste
pour la première fois sur les unités : `Qe_full = 1 m3/min`, les bandes
NASA en L/min, `tau_scrubber = 3.33 min`. Les journaux et les traces :
`docs/exemples/2026-09-25-mise-en-service-7-haiku-etat-tous/`.

Entrée hors cache divisée par 5,7 à nombre d'appels égal (passage 8), par
11,3 sur le chemin heureux (passage 9 : plan, évaluation, remise, trois
appels, aucune lecture) ; l'entrée de chaque pas est plate (2 à 4 k
jetons) au lieu de croître de 7 k à 28 k ; le résultat tient (5,7 ppm sur
le Lab, Hab-B à 404 m³ pour 400). Au passage 8, quatre des sept pas
étaient deux plans refusés : le modèle inventait des identifiants de nœuds
(`Physics.Crew:person`), parce que le rayon dans l'état donnait les
variables du graphe et pas ses types ; le rayon les porte depuis (passage
9). Les journaux et les traces complètes (l'Observateur compris, pour la
première fois) : `docs/exemples/2026-09-25-mise-en-service-5-haiku-etat/`
(passage 8) et `-6-haiku-etat-types/` (passage 9).

## 13. Ce qui reste

- Le sujet `onnx` sur l'état (les deux autres y sont, section 14).
- `INSUFFICIENT_INFORMATION` et la demande d'expérience.
- La covariance ou la sensibilité locale, à côté des plages ; jusque-là
  l'identifiabilité reste `NOT_ASSESSED`.
- Un second point de cache : le prompt système de Haiku (600 jetons) est
  sous le minimum de cache (1 024) ; les outils (9,7 k caractères) sont
  renvoyés à chaque pas et pourraient être mis en cache avec le prompt.
- Les unités : le service couvre ce que le substrat déclare ; les grandeurs
  que la démo écrit encore hors de lui (`FlowResistance`, `Particulate`,
  `Category`) sont dites inconnues, jamais devinées, jusqu'à ce qu'elles
  soient déclarées dans le cœur.

## 14. Le passage suivant, le même soir : les deux autres boucles sur l'état, le cas infaisable, le contrat de l'évaluateur, les unités

La relecture de la trace du passage 9 disait où étaient les jetons (97 % dans
la Procedure Factory et l'Observateur), et ce que l'évaluateur laissait
passer : une conversion fausse de l'Observateur (`Qe_full = 60 L/min`), une
remise inventant un sens pour `L`, une identifiabilité trop optimiste, un
seuil ambigu (RMSE ou pire minute), pas de bloc de couverture, des variables
hors interface acceptées sur un graphe de bibliothèque. Tout y est passé,
dans cet ordre.

**Les deux autres boucles sur l'état.** Le sujet `procedure` a sa part de
l'état (`stateOfTopic`) : l'installation (volumes, ouvertures, inconnues,
l'appareil en mise en service), la présence par module, le moniteur, la
fiche de méthode entière, les soumissions avec leurs raisons ; ses
`requirements` (installation lue, présence lue, méthode lue, plan déclaré,
procédure acceptée) et la garde qui refuse un plan avant l'installation et
la méthode. Ce que la garde écrit à l'état, c'est un refus seulement : une
soumission acceptée est enregistrée par la capacité elle-même, après que
le runtime a vérifié que le monde observé n'a pas bougé (une garde qui
écrivait l'état le faisait bouger, et la décision devenait périmée).
L'Observateur reconstruit lui aussi son observation à chaque pas quand son
fournisseur est en mode état : la description, le résumé de la télémétrie,
le vocabulaire, les documents lus (le dernier entier, les précédents par
leurs lignes qui portent un nombre), la dernière demande refusée entière
avec ses raisons, et un brief. Le slot `factory` met `procedure` sur
l'état ; `onnx` reste en conversation.

**Ce que les passages ont appris, un par un.** Passage 10 : la procédure
refusée par le schéma (`abort[].threshold: null`) n'était pas dans l'état,
le modèle la réécrivait avec la même faute, sept fois. L'état porte depuis
`lastRefusal.input`, l'entrée entière du dernier appel arrêté, quelle que
soit la garde. Passage 11 : le plan écrivait `required_output: "V_lab
(Volume, m3)"` en copiant le rendu du brief, refusé vingt fois sans que la
raison dise pourquoi ; la garde nomme maintenant l'écart et le brief donne
le nom exact. Passage 12 : l'usine de graphes a relu `task.json` six fois,
puis les recettes ont rejoué la lecture vingt-deux fois, l'identifiant de
l'observation ne bougeant pas ; la garde refuse depuis un appel identique
au pas précédent qui avait abouti (sa réponse est dans l'état), et
l'identifiant compte les répétitions (`:again2`), donc aucune recette ne
rejoue à l'infini un pas qui ne change rien. Le même passage a montré un
premier candidat diagnostiqué structurel : la règle dit désormais qu'un
premier échec d'une structure est une question de paramètres (un simplexe
de quarante passages n'établit rien sur la structure), et que la même
structure échouant deux fois, paramètres cherchés, est structurel.

**Le cas infaisable** (`tests/graph.test.ts`) : le monde de rechange avec
un troisième occupant du Lab que l'observation ne liste pas. Le premier
candidat tient L : `PARAMETER_MISMATCH` ; le second l'ajuste et manque
encore : `STRUCTURAL_MISMATCH` ; le script joue l'hypothèse qu'un ingénieur
essaierait d'abord, une source dans le Lab que l'observation a manquée, et
ajoute une personne : le troisième tient, V et le débit retrouvés. Les
briefs ont suivi les diagnostics, Mother a dit rejeté, rejeté, accepté.

**Le contrat de l'évaluateur.** Les seuils par leur nom
(`rmsePpmMax` sur la RMSE de chaque colonne comparée,
`absoluteResidualPpmMax` sur la pire minute quand l'opérateur le donne ;
`residualPpmMax` reste lu comme l'ancien nom du premier), portés par le
candidat (`thresholds`), l'état et les briefs. Un bloc `coverage`
(`{expected, predicted, missing, valid}`) ; `valid: false` rend
l'évaluation invalide. Un graphe de bibliothèque est strict : un nom hors
de son interface (`Qe_full`, `tau_scrubber`, `C_ELEVATED`) est refusé avant
tout passage, avec l'interface ; le brief demande `graph`, `persons` et
`fit`. Chaque candidat porte `parameters` : pour chaque variable sa
valeur, son unité, son nom en mots (les mots de la grammaire du graphe) et
comment elle a été fixée (`fitted`, `held`, `device`, `default`), avec ce
que le graphe déclare (`declared`, `source`). La remise est construite
par code de ces métadonnées (`TopicDefinition.claims`, dans les
`claims` de la proposition à la station : paramètres, résidus, seuils,
couverture, calibration, validation, identifiabilité `NOT_ASSESSED`) ; la
phrase du modèle reste une note à côté.

**Les unités** (`harness/lib/units.ts`, slot `physics`). Une façade
déterministe sur le système d'unités du substrat (`@spiky-panda/core`,
39 grandeurs, chaque unité portant son code UCUM comme identité et son
facteur vers la base ; les conversions du cœur) : `units_normalize` (une
unité telle qu'écrite, clé, code UCUM ou symbole, les caractères
typographiques normalisés, la grandeur sous son nom industriel ou celui
du cœur), `units_convert`, `units_compatible`,
`units_validate_connection` (la valeur d'une source dans son unité contre
sa reformulation : `1.0 m3/min` contre `60 L/min` donne
`INVALID_CONVERSION` avec la valeur attendue). Le cœur a reçu ce que la
démo écrivait sans lui : `MassFlow` (kg/s, g/min...), le mètre cube par
minute, la personne (`{person}`) ; `core` 1.0.5, `nodeeditor` 0.1.2
vendorisés. La garde de l'Observateur vérifie chaque constante connue
contre le document qu'elle cite, par le service : les nombres avec unité
que le document énonce (`quantitiesIn`), la constante doit concorder avec
l'un d'eux une fois convertie, sinon `INVALID_CONVERSION` avec ce que le
document dit (le passage 13 avait écrit le débit d'un membre d'équipage
éveillé `0.0115 kg/s` là où la fiche NASA dit `0.69 g/min`, mille fois
moins). La garde de la procédure refuse une grandeur dans une unité que le
système ne connaît pas. 136 tests.

## 15. La couche des contrats : des faits typés, une hiérarchie des sources, les conflits

La relecture du passage 14 disait le vrai défaut : les unités seules ne
protègent pas le sens. La fiche technique contient 0,30 (l'efficacité),
40 % (le plancher de vitesse) et 100 % (la pleine vitesse) ; pour un moteur
d'unités ce sont trois ratios, et le garde a poussé l'Observateur vers
`eta = 40 %`. Le graphe de référence a sauvé le résultat en prenant la
valeur de l'appareil (0,303), ce qui masquait l'erreur au lieu de la
montrer. D'où une couche à part, générique, qui ne connaît ni épurateur ni
sas (`harness/core/contracts.ts`) :

| notion | ce que c'est |
|---|---|
| `Fact` | un id (`scrubber.singlePassEfficiency`), une sémantique (`SinglePassRemovalEfficiency`, pas `Ratio`), une grandeur, une unité, une valeur, une bande quand la source en donne une, un statut, une source, un producteur |
| la hiérarchie | `measured > device > documented > library > derived > assumed` |
| `conflictsOf` | par id, chaque valeur convertie dans l'unité de la plus autoritaire (par le service des unités) ; une bande compte de quel côté qu'elle soit ; ce qui ne concorde pas est un conflit, et le producteur de plus basse autorité qui ne concorde pas est celui qui révise |
| `reviewContracts` | `CONSISTENT`, `CONFLICT` (les conflits, avec qui révise), `MISSING` (un fait requis que personne n'énonce) |
| `taskFacts` | les faits d'une tâche : les constantes connues de la demande (par id de fait quand elle en cite un), les propriétés des appareils du registre (nommées par les fiches de faits de la bibliothèque : une propriété qu'aucune fiche ne nomme n'est la revendication de personne), les faits de la bibliothèque |

**Le domaine entre par les faits, pas par le code.** Un document de la
bibliothèque énonce ses faits dans un fichier à côté de lui
(`docs/library/<id>.facts.json`) : la fiche de l'épurateur en a cinq (le
débit d'air, l'efficacité, le débit effectif, la constante de temps, le
plancher de vitesse, chacun avec la propriété du registre qui porte le
même fait), la topologie quatre (la ventilation inter-modules sas fermé,
3 m³/min de conception, les seuils, l'équipage), les charges NASA trois
(les débits éveillé et endormi avec leurs bandes). `library.facts` les
donne, `library.read` les joint au document, la liste les compte.

**Ce que le harnais en fait.**

- L'Observateur cite un fait (`known[].factId`) dès que le document énonce
  les siens ; la garde juge la constante contre ce fait seul (une
  efficacité n'est plus comparée à une vitesse parce que les deux sont des
  ratios) : la valeur, l'unité convertie, la bande. Le passage 14 aurait
  été refusé ainsi : « 40 percent is 0.4 ratio; the fact
  scrubber.singlePassEfficiency (SinglePassRemovalEfficiency) is 0.3
  ratio ». Elle refuse aussi une hypothèse de modules isolés sas fermé,
  parce que la topologie documente le contraire (le fait
  `habitat.interModuleVentilation.designFlow.hatchClosed`) ; ce que la
  ventilation livre est inconnu, pas nul. Les outils des unités
  (`physics.units_convert`, `units_validate_connection`,
  `units_normalize`) sont dans sa main, hors comptage des lectures.
- Le runner relit une fois, au départ d'une tâche, les faits de la
  demande, du registre et de la bibliothèque, et en fait le rapport
  (`invariants.contracts` de l'état). L'usine de graphes exige
  `sourcesConsistent` avant le plan : un `SOURCE_CONFLICT` (la demande dit
  `eta = 40 %`, le registre 0,303) refuse le plan en nommant le fait et
  qui révise, et demande `task.fail` avec `REQUIRE_RESOLUTION` ; le graphe
  de référence ne prend plus silencieusement la valeur de l'appareil.
- Les deux usines ont les outils des unités et `library.facts` dans
  leurs listes.

**Le superviseur des contrats, l'étape suivante.** Ce que cette couche
produit (des faits, des rapports de quelques centaines de caractères) est
ce qu'un raisonneur de supervision lirait, et rien d'autre : pas les
transcriptions. Il ne construirait rien et ne corrigerait rien lui-même ;
il dirait `CONTRACT_VIOLATION`, le producteur, le fait, la raison, et le
harnais renverrait ce producteur dans sa boucle (`REVISE`), la provenance
restant propre. Ses états seraient ceux du rapport (`CONSISTENT`,
`CONFLICT`, `MISSING`, `AMBIGUOUS`, `UNSUPPORTED`) et ses règles ne
parleraient jamais de CO2 : même fait et valeurs incompatibles, fait
requis absent, hypothèse contredite par une preuve, paramètre déclaré
connu en amont et ajusté en aval, deux symboles pour un concept. Le
déterministe (les unités, les schémas, la couverture) répond à ce qui est
objectivement faux, le superviseur à ce qui est incohérent entre sources,
le raisonneur scientifique (l'usine de graphes) à ce que la physique
explique. Pour changer de domaine on change les faits, le catalogue, les
graphes de référence et la bibliothèque, pas le harnais. Ce qui est
construit ce soir est la couche déterministe de ce superviseur ; le
raisonneur qui la lit n'est pas écrit.

**Le passage 17, avec les faits** (même modèle, même exemple ;
`docs/exemples/2026-09-25-mise-en-service-8-haiku-faits/`) :

| boucle | pas | entrée | sortie | ce qui s'est passé |
|---|---|---|---|---|
| Procedure Factory | 14 | 54 495 | 5 335 | une lecture répétée refusée par la garde, un refus de la procédure (plancher, bornes, durée), acceptée |
| Observateur | 7 | 53 804 | 4 892 | trois lectures, `library.facts`, un refus (une constante citant un document non lu), acceptée |
| Graph Factory | 3 | 9 603 | 954 | `contracts: CONSISTENT`, un candidat, tenu |

Pour la première fois la demande de l'Observateur est juste sur toutes ses
constantes, chacune citant son fait : `eta = 0.3 ratio`
(`scrubber.singlePassEfficiency`), `Qe_full = 1 m3/min`, `Q_full = 3.3
m3/min`, `tau_lag = 3.33 min`, les débits de l'équipage `0.38` et `0.24
L/min` avec leurs bandes ; le rapport des contrats de l'usine de graphes
est `CONSISTENT`, sans que le graphe de référence ait rien à masquer. Ce
qui a été trouvé et corrigé sur le chemin (passage 15) : après un refus,
la procédure refusée disparaissait de l'état dès que le modèle lisait
autre chose (`lastRefusal` ne tient que le dernier refus), et le modèle
inventait une poignée pour la relire, seize fois ; le progrès garde
maintenant le dernier refus de chaque capacité jusqu'à ce qu'elle
aboutisse (`refusals`), et l'état du sujet `procedure` montre la
procédure refusée sous `evaluation.procedure` quoi que le modèle lise
entre-temps.

**Le passage 20, la boucle scientifique sur le vrai modèle**
(`EXAMPLE_WORLD=hidden-occupant`, une troisième personne au travail dans
le Lab que le moniteur ne liste pas ;
`docs/exemples/2026-09-25-mise-en-service-9-haiku-occupant-cache/`).
L'usine de graphes, 6 pas, 23 243 jetons d'entrée : le premier candidat
(les quatre personnes observées, V, Vh, L et g ajustés) manque de 118 ppm
sur le Lab avec g en butée de sa bande (0,45), `PARAMETER_MISMATCH` ; le
brief dit que la courbe du Lab reste sous-prédite avec un débit au haut de
sa bande, donc qu'il s'y produit plus de CO2 que les personnes observées
n'en font, et nomme le levier (une personne de plus dans ce module) ; le
modèle évalue le même graphe avec un troisième occupant du Lab : 6,5 et
8,3 ppm, V 28,2 pour 30, tenu et remis. La boucle candidat, échec,
diagnostic, hypothèse, candidat révisé est donc démontrée sur Haiku, pas
seulement sur le script. Deux passages avant, sans les leviers dans le
brief, le même modèle avait relu le gabarit huit fois et épuisé ses trente
pas sans second candidat ; un passage avant, la Procedure Factory avait
relu vingt-deux fois une fiche que le brief ne reconnaissait pas comme
fiche de méthode (`nasa-scrubber-test-protocols`, listée par
`library.methods` mais sans le préfixe `method-`) : le brief nomme
maintenant les fiches listées et en accepte une des deux.

**Le journal des états.** Chaque trace rendue commence depuis par un
journal des états : une ligne par pas, ce que l'état disait avant la
décision (la phase, le budget restant, les exigences non tenues, le
rapport des contrats, l'hypothèse, le diagnostic et les résidus de la
dernière évaluation, le refus à répondre, les questions ouvertes, le poids
de l'état en caractères), puis l'appel et son issue ; l'état entier reste
sous chaque pas. Pour l'Observateur, dont l'état a une autre forme : les
documents lus et la tentative refusée. Les traces des passages 17 et 20
sont rendues avec.

## 16. Le superviseur des contrats (la même nuit)

Le raisonneur que la section 15 annonçait : `harness/supervisor/`, un rôle
de plus sur le slot `reasoner`, avec son prompt fixe
(`harness/supervisor/prompt.md`, générique : aucune physique dedans), qui
lit les faits typés d'une tâche, le rapport déterministe, les hypothèses et
les symboles de la demande, et rien d'autre (jamais une transcription ;
quelques milliers de caractères), et répond une seule capacité,
`supervisor.verdict`, typée :

| champ | ce que c'est |
|---|---|
| `status` | `CONSISTENT`, `CONFLICT`, `MISSING`, `AMBIGUOUS`, `UNSUPPORTED` |
| `findings[]` | `kind`, `fact` (un id de fait de la liste, `assumption:<n>`, `symbol:<s>`), `producer` (parmi ceux de la liste), `reason`, `required_action` (`REVISE`, `COMPLETE`, `INSPECT`, `REJECT`) |

**La garde du verdict** (`checkVerdict`, en code) : les noms parmi ceux de
l'entrée, et surtout les conflits que la couche déterministe a calculés
portés dans les constats, jamais abandonnés ; un verdict `CONSISTENT`
par-dessus un conflit calculé est refusé et revient au modèle avec la
raison, deux tentatives. Le superviseur ajoute ce que les règles sur les
nombres ne voient pas (une hypothèse contre un fait, un symbole pour la
mauvaise chose, une affirmation sans appui) ; il ne corrige rien lui-même.

**Où il agit.**

- L'Observateur : `observe({ review })`, une revue demandée seulement sur une
  demande que la garde déterministe a acceptée ; les constats qui nomment
  `observer` avec `REVISE`, `COMPLETE` ou `REJECT` refusent la demande comme
  les problèmes de la garde, et le modèle corrige dans sa boucle
  (`findingsFor`). La provenance reste propre : personne n'a réécrit sa
  demande à sa place.
- L'usine de graphes : `runTask({ supervisor })` ; le runner demande le
  verdict une fois au départ sur les faits de la tâche, l'applique au
  rapport que l'état porte (`applyVerdict` : le pire des deux statuts, un
  conflit calculé n'est jamais adouci), et `sourcesConsistent` lit les deux.
  Le slot `factory` le donne quand un modèle est prêt ; un constructeur
  scripté tourne sans.
- Le slot `supervisor` (`review`, `review_request`, `supervisor://verdicts`),
  pour l'appeler par le broker ; sans clé il dit qu'aucun modèle n'est prêt
  et le rapport déterministe tient.
- L'exemple : le superviseur relit chaque demande de l'Observateur et sa
  trace est rendue à côté (`trace/07-supervisor.md`, avec le journal des
  états) ; le journal de la boucle 7 dit ses verdicts et ses jetons.

Ce qui reste domaine-spécifique après lui : rien dans le superviseur ; la
règle par expression régulière « modules isolés sas fermé » de la garde de
l'Observateur reste en place comme filet déterministe, le superviseur
attrape les formulations qu'elle manque.

**Six passages pour le régler** (le même soir ; les traces du dernier dans
`docs/exemples/2026-09-25-mise-en-service-10-haiku-superviseur/`). Ce que
chacun a montré, et ce qui en est sorti :

| passage | ce qui s'est passé | ce qui a changé |
|---|---|---|
| 21 | le slot `reasoner` refuse le prompt du superviseur (ni un sujet ni l'Observateur) | le prompt du superviseur admis parmi les rôles |
| 22 | le superviseur rouvre un écart numérique que la couche déterministe avait pesé (0,3 contre 0,303) et nomme le fait `fact:2` ; deux refus de la garde, le rapport déterministe tient ; à l'usine de graphes le même verdict passe (l'ancienne garde), `CONFLICT`, et le modèle relit `task.json` trente fois (la garde des répétitions comparait avec l'id de tâche lié) | un constat numérique sur un fait que les règles ont trouvé cohérent est refusé ; l'état donne `factIds` ; la garde des répétitions compare sans ce que le profil lie ; un `SOURCE_CONFLICT` termine la tâche avant tout pas, `REQUIRE_RESOLUTION` et le producteur nommé |
| 23 | l'Observateur épuise ses trois tentatives sur le vocabulaire : `m3/min` refusé là où le catalogue écrit `m3ps` | la règle du vocabulaire passe par le service des unités et accepte ce qui convertit |
| 24 | l'Observateur cite le fait en volume avec la valeur en masse (0,69 g/min pour `crew.co2Rate.awake` en L/min) | la garde nomme le fait jumeau à citer (`crew.co2Rate.awake.mass`) ; quatre tentatives dans l'exemple |
| 25 | le superviseur attrape une vraie contradiction (une proportionnalité de 0 à 100 % là où la fiche dit 20 à 100 %) puis demande de « compléter » une hypothèse qu'aucun fait ne contredit (un facteur ppm vers mg/m³) ; l'Observateur épuise ses tentatives | un constat sur une hypothèse nomme le fait ou le document qui la contredit, ou n'est pas un constat |
| 26 | Procedure 11 pas, 42 k ; Observateur 8 pas, 61 k, un refus (une valeur donnée sous hypothèse) ; superviseur un appel, 3 025 jetons, `CONSISTENT` sans constat ; usine de graphes 4 pas, 12,7 k, `contracts: CONSISTENT`, un candidat tenu (7,3 et 5,2 ppm) | |

Le superviseur coûte une fraction de l'Observateur (3 k contre 61 k) parce
qu'il ne lit que des faits et un rapport. Ce que ces passages disent de sa
place : il n'est utile qu'avec une garde qui tient le déterministe hors de
sa portée (les nombres, les noms), sinon il rouvre ce qui est réglé et
coûte des boucles ; et une garde qui refuse trop littéralement (le
vocabulaire par chaîne d'unité) coûte plus cher que lui.
