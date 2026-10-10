# Enquête : la fabrique de graphes du run 20 (Nemotron Super)

_10 octobre 2026. Run `commissioning-example-20261010-162247-er63`, tâche `t-2026-10-10-0053`, modèle `nvidia/nemotron-3-super-120b-a12b` (température 0,4, top_p 0,95). Traces : `outputs/examples/2026-10-10T16-22-47/trace/08-graph-factory.jsonl` et `.md`._

La tâche a échoué après ses 30 pas, budget épuisé : 3 évaluations exécutées, 14 refusées, aucune sous le seuil de 10 ppm. Pour chaque pas, ce document dit ce que le modèle a reçu, ce qu'il a envoyé, ce que la garde a répondu, et d'où vient l'erreur.

## En une phrase

L'échec ne vient pas d'abord du modèle. Trois défauts du harnais se sont enchaînés : (1) les sources des constantes que l'Observer a mises dans la requête ne sont pas citables dans la tâche suivante ; (2) la garde oblige à ajouter un nœud que le plan n'avait pas besoin de produire, puis (3) propose de le câbler sur une entrée d'une autre grandeur, ce qui donne un jumeau absurde (985 000 ppm d'écart). Le modèle a ensuite cherché à expliquer cet écart en inventant un cinquième occupant. Le cache n'y est pour rien (voir la fin).

## Les 30 pas

| pas | appel | issue | ce qui s'est passé | origine |
|---|---|---|---|---|
| 1 | `task.plan` | refusé | sorties mappées sur `Physics.Scene:atmosphere`, port `co2`, qui n'existe pas | modèle |
| 2 | `twin.registry_list_nodes` | lu | le catalogue entier (166 types) | |
| 3 | `twin.registry_search` | lu | cherche ce qui produit une concentration en ppm : `Physics.LifeSupport:cabin-air` arrive en tête | |
| 4 | `twin.registry_describe_node` | lu | décrit `cabin-air` | |
| 5 | `twin.registry_search` | lu | la même recherche qu'au pas 3 | modèle (répétition) |
| 6 | `task.plan` | accepté | plan : `cabin-air` + nœuds du graphe ; les deux sorties mappées sur `cabin-air.co2Ppm` | voir cause B |
| 7 | `graph.evaluate` | refusé | 10 nombres sans justification (`variables.Q_vent`, `G_person`, `eta_scrub`…) | modèle |
| 8 | `graph.evaluate` | refusé | il justifie par les faits de la requête (`habitat.interModuleVentilation.designFlow.hatchClosed`, `crew.co2Rate.awake`…) : « not a library document or fact read in this task (none read) » | **harnais, cause A** |
| 9 | `library.search` | lu, vide | cherche l'id du fait comme du texte (`library.search` cherche dans les documents, pas les faits) | conséquence de A |
| 10 | `library.search` | refusé | la même recherche, refusée comme répétée | modèle |
| 11 | `twin.registry_describe_node` | lu | redécrit `cabin-air` | |
| 12 | `graph.evaluate` | refusé | « le plan dit que `cabin-air` produit une sortie et le graphe `habitat` n'en a pas : évalue-le avec `add` », avec le `add` à copier | **harnais, cause B** |
| 13 | `graph.evaluate` | exécuté | candidat 1 avec le `add` proposé : écart **985 741 ppm** (Lab), pire 998 484 | **harnais, cause C** |
| 14 | `graph.evaluate` | refusé | candidat sans le `add` (il ajoute une 5e personne « FE-extra ») : refusé, cause B | B, puis modèle |
| 15 | `graph.evaluate` | refusé | justifie les plages d'ajustement par `habitat.interModuleVentilation…` et `station-topology` : « not read in this task » | **cause A** |
| 16, 17 | `library.search` | lu vide, puis refusé | cherche encore l'id du fait comme du texte | conséquence de A |
| 18, 19 | `graph.evaluate` | refusés | sans le `add`, cause B | B |
| 20 | `graph.evaluate` | refusé | plages d'ajustement (`fit.V = [10, 200]`…) sans justification | modèle |
| 21 | `graph.evaluate` | refusé | `add.connections` écrites en tableaux `[[de], [vers]]` au lieu d'objets `{from, to}` | **forme, cause D** |
| 22 | `library.graph` | lu | relit le graphe `habitat` | |
| 23 | `graph.evaluate` | exécuté | candidat 2, avec `add` corrigé : même écart, 985 741 ppm | cause C |
| 24 | `graph.evaluate` | refusé | sans le `add`, cause B | B |
| 25 | `graph.evaluate` | exécuté | candidat 3, 5 personnes : écart **986 149 ppm** ; le harnais note « le jumeau monte 10 736 fois plus vite que la mesure dès la première minute » | cause C |
| 26 | `graph.evaluate` | refusé | sans le `add`, cause B | B |
| 27 | `graph.evaluate` | refusé | `settings.labOccupants = 4`, `habOccupants = 2` sans justification ; 4 au Lab, alors que la présence lue en compte 2 | modèle, conséquence de C |
| 28 | `library.search` | lu | « Lab volume » | |
| 29 | `graph.evaluate` | refusé | les connexions de nouveau en tableaux | cause D |
| 30 | `graph.evaluate` | refusé | justifie `fit.L` par `scrubber-1-datasheet` : « not read in this task » | **cause A** |

## Cause A, harnais : les sources de la requête ne sont pas citables dans la tâche

**Ce que le modèle avait sous les yeux.** La requête de l'Observer arrive dans la tâche avec ses constantes connues, chacune avec son fait et son document : `Q_vent = 3 m³/min` (fait `habitat.interModuleVentilation.designFlow.hatchClosed`, document `station-topology`), `G_person = 0,38 L/min` (`crew.co2Rate.awake`), `eta_scrub = 0,3` (`scrubber.singlePassEfficiency`, `scrubber-1-datasheet`)… Elles sont dans les invariants de l'état, à chaque pas.

**Ce qu'il a fait.** Il les a citées comme justification (pas 8, 15, 30), ce qui est exactement ce que la politique demande.

**Ce que la garde a répondu.** « not a library document or fact read in this task (none read) : read it, or cite another source ». La garde ne compte comme citable que ce que **cette** tâche a lu. Ce que l'Observer a lu, et que la requête porte, ne compte pas.

**La suite.** Le modèle a obéi à « read it » : il a cherché l'id du fait avec `library.search` (pas 9, 10, 16, 17), qui cherche dans le texte des documents et ne trouve rien. Quatre pas perdus, et le message ne disait pas comment lire un fait (`library.facts`).

**Le contexte est donc perdu entre deux tâches**, pas dans la requête : l'information est dans l'état, mais la règle qui juge les justifications l'ignore.

## Cause B, harnais : la garde oblige à ajouter un nœud inutile

**Le plan (pas 6).** Le modèle mappe les deux sorties sur `Physics.LifeSupport:cabin-air.co2Ppm`, un nœud qui existe bien dans le catalogue, mais pas dans le graphe de référence `habitat` qu'il évalue ensuite. Le plan est accepté.

**Pourquoi ce mapping n'était pas nécessaire.** Les deux sorties sont comparées à la télémétrie (`validation.compare` de la requête : sortie Lab contre `co2_lab_ppm`, sortie Hab-B contre `co2_habb_ppm`). Le graphe `habitat` les produit déjà par ses propres volumes et capteurs. Le brief dit de ne mapper dans `produced` que les sorties qu'aucune colonne ne juge. La garde du plan ne refuse pas un mapping superflu.

**Ce que fait ensuite la garde d'évaluation (pas 12, 14, 18, 19, 24, 26).** Elle lit dans le plan que `cabin-air` produit une sortie, constate que `habitat` n'en a pas, et refuse toute évaluation sans `add` qui ajoute ce nœud. Six évaluations refusées pour ce seul motif.

## Cause C, harnais : le câblage proposé mélange deux grandeurs

**Le `add` que la garde propose (pas 12).** `{"from": ["generated-1", "co2Ppm"], "to": ["lab", "delta_CO2_2"]}` : la sortie concentration de `cabin-air` (en ppm, de l'ordre de 1 000) branchée sur une entrée `delta_CO2_` du volume du Lab. Ces entrées du volume (`Physics.Scene:atmosphere`, le « puits » du format) additionnent les apports de gaz ; une concentration n'en est pas un. La fonction qui fabrique la proposition (`addNeededFor`, `harness/topics/graph/index.ts`) prend la prochaine entrée libre du puits sans vérifier la grandeur des deux ports. _À confirmer sur la signature du nœud, mais les résultats le montrent._

**Le résultat (pas 13, 23, 25).** Trois candidats exécutés, tous à environ **985 000 ppm** d'écart. Le harnais l'a vu (pas 25) : « le jumeau monte de 199 690 ppm/min là où la mesure monte de 18,6 ppm/min, 10 736 fois plus vite ».

**La conséquence sur le modèle (pas 14 à 27).** Face à un écart pareil, Super a cherché une source de CO2 manquante et a ajouté une personne au Lab (« FE-extra », puis « FE-4 », puis 4 occupants au pas 27). Ces personnes n'existent pas : la présence lue en compte 2 au Lab. L'erreur du modèle est réelle, mais elle répond à un écart que le harnais avait lui-même fabriqué.

## Cause D, forme : les connexions en tableaux

Aux pas 21 et 29, le modèle écrit `"connections": [[["generated-1", "co2Ppm"], ["lab", "delta_CO2_2"]], …]` au lieu de `[{"from": [...], "to": [...]}, …]`. La lecture est sans ambiguïté (le premier tableau est la source, le second la destination). Selon votre règle, c'est à l'interpréteur de le lire, pas à la garde de le refuser.

## Les erreurs propres au modèle

- Pas 1 : un port (`co2`) qui n'existe pas sur le nœud choisi.
- Pas 7, 20, 27 : des nombres envoyés sans justification (les variables, les plages d'ajustement, les occupants).
- Pas 5, 10, 17 : la même lecture deux fois de suite.
- Pas 14 à 27 : des occupants inventés (voir cause C).

## Le cache

**Le cache n'est pas la cause de ces échecs.** En mode « état », chaque appel porte tout ce dont le modèle a besoin : l'état est reconstruit à chaque pas, rien ne dépend d'une mémoire du serveur. Le cache ne change que le coût et la latence, pas ce que le modèle sait.

**Pourquoi il est à 0 pour Super.** Nebius ne sert pas de cache pour ce modèle. Vérifié le 10 octobre par deux requêtes identiques (5 500 jetons de préfixe commun) : `cached_tokens: 0`, `created_cache_tokens: 0`, avec ou sans clé de cache (`prompt_cache_key`). Pour Ultra, le même serveur sert du cache : 26 000 jetons au run 19, 91 000 au run 21.

**Ce qui empêcherait le cache même quand il existe.** Un serveur met en cache le début identique des requêtes. Chez nous, le début est le prompt système (fixe) puis les outils (fixes à l'intérieur d'une étape, changeants d'une étape à l'autre). L'état, qui change à chaque pas, vient après. La structure est donc compatible ; elle ne peut rien contre un serveur qui ne met pas en cache.

## Corrections proposées

1. **Cause A** : les faits et documents que la requête cite (ses constantes connues, avec leur `factId` et leur source) sont citables dans la tâche, dès le premier pas ; et le refus d'une source non lue dit comment la lire (`library.read` pour un document, `library.facts` pour un fait).
2. **Cause B** : la garde du plan refuse de mapper dans `produced` une sortie que la télémétrie juge déjà ; ou la garde d'évaluation n'exige le nœud que pour les sorties qu'aucune colonne ne juge.
3. **Cause C** : la proposition d'ajout ne câble un port que sur une entrée de la même grandeur (vérifiée par le service des unités) ; à défaut, elle ne propose pas de câblage et le dit.
4. **Cause D** : l'interpréteur lit une connexion écrite `[[de], [vers]]` comme `{from, to}`.
