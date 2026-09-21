# Les douze étapes du harnais : ce que fait chaque nœud, à la station et à l'usine

*21 septembre 2026. Document de référence de l'étape F4 (`factory-harness.fr.md`, section 6). Il décrit la boucle telle qu'elle est écrite dans le paquet `@spiky-panda/harness` (fichier `nodes.ts`, version 0.1.1), puis ce que chaque nœud fait concrètement dans les deux usages de la démo : l'agent de l'habitat (Tier 3, appelé « la station » ici parce que c'est lui qui parle par la voix de la station) et l'usine (le constructeur). Les deux usages appellent le même graphe et le même `step` ; il n'y a pas de seconde boucle.*

## 1. Un graphe, un pas, six services

Le graphe est construit en code par `harness/lib/flow.ts` (douze nœuds du catalogue V1 du paquet, douze fils, `RuntimeGraphBuilder` du core) ; sur une page du studio c'est le graphe dessiné qui est exécuté à sa place.

```
observe > context > lookup > gate
                               policy ------------------+
                               fallback > request > reason
                                                        |
                    merge <-----------------------------+
                      > guard > execute > observe-after > evaluate > record
```

**Un pas.** `runtime.step(intention)` parcourt ce graphe une fois, de `observe` à `record`, et rend une trace (`DecisionTrace`). Un pas, c'est une décision, et une décision, c'est au plus un appel d'outil. Le paquet le garantit : un seul outil est autorisé par pas, l'outil choisi doit être dans la liste permise, et le pas s'arrête si la garde refuse. Un pas a un délai maximal (10 s par défaut ; la démo met 60 s).

**Une intention.** Ce qu'on demande à la boucle : un identifiant, une description, des paramètres. Elle ne change pas pendant le pas.

**Une capacité.** Un outil que la boucle a le droit d'appeler, avec son schéma d'entrée. Dans la démo ce sont les outils du broker (`<slot>.<outil>`) plus quelques outils en processus.

**Une recette.** Une décision déjà prise dans la même situation (même clé de contexte, section 2, nœud 2) et dont les résultats passés ont donné confiance. Le paquet l'appelle une transition apprise.

Le runtime (`AdaptivePolicyRuntime`) reçoit six services. C'est là que les deux usages diffèrent, et seulement là :

| service | ce qu'il est | à la station | à l'usine |
|---|---|---|---|
| le graphe (`driver`) | les douze nœuds | `harness/lib/flow.ts`, ou le graphe de la page | le même |
| l'observateur | ce que la boucle voit avant et après chaque décision | l'état de la carte (`scrubber.motor.state`) et le dernier résultat d'outil | l'atelier de la tâche (`workspace.list`), la phase, le plan, le dernier résultat |
| les capacités | les outils permis | les outils du broker moins les exclus de la cabine, plus `crew.report` et `crew.ask` | les outils d'atelier du sujet, liés à la tâche, plus `task.plan` et `task.done` |
| le modèle (`fallback`) | qui décide quand aucune recette ne s'applique | le slot `reasoner` (Haiku, Nemotron) ou l'agent scripté | le constructeur scripté du sujet (F4) ; le modèle avec `FACTORY_PROMPT` (F5) |
| la garde | ce que la boucle refuse elle-même avant d'agir | `measured` : rien ; `protected` : les règles de vitesse | la garde du constructeur : outil du sujet, chemins dans l'atelier, plan conforme |
| l'évaluateur | ce que vaut le pas, pour la mémoire | le CO2 a-t-il baissé | la tâche a-t-elle avancé ; à `task.done`, le contrat est-il tenu |
| la mémoire (`PolicyGraph`) | les recettes et les expériences | neuve à chaque scénario | chargée depuis les recettes du sujet, sauvée à la fin |

**Un passage.** À la station, le runner du scénario (`tier3/run.ts`) prend un événement (une intention par événement, la minute en paramètre), fait jusqu'à six pas, et s'arrête dès que l'agent parle à l'équipage (`crew.report` ou `crew.ask`). À l'usine, le runner (`harness/core/runner.ts`) prend une tâche (une intention par tâche), fait un pas par appel d'outil, et s'arrête quand `task.done` est accepté par le validateur, ou quand le budget est épuisé (itérations, minutes), ce qui termine la tâche en échec.

## 2. Les douze nœuds, un par un

Pour chaque nœud : ce que fait le paquet (le même partout), puis ce que cela devient à la station et à l'usine, puis ce qui peut arrêter le pas à cet endroit.

### 1. `observe` (rien → `state`)

Le paquet appelle `observer.observe()`, fige la réponse et vérifie sa forme : un `id` (texte) et des `features` (un objet JSON plat). Rien d'autre ne peut entrer dans la boucle que par ici.

- Station : un appel `scrubber.motor.state`. `id` = `cabin:<état du CO2>` (NOMINAL, ELEVATED, CRITICAL). `features` = ppm, vitesse, courant, puissance, protection de débit minimal, la carte joignable ou non, et le dernier résultat d'outil (`lastCapability`, `lastOutcome`, `lastOutput`), pour qu'une décision puisse s'appuyer sur la réponse de la précédente (les chiffres du jumeau, un refus).
- Usine : un appel `workspace.list` sur la tâche. `id` = `workshop:<phase>:<dernier outil>:<son issue>` (la phase : `plan`, `build`, `done`, `failed` ; puis le dernier outil appelé et son issue, `start` quand rien n'a été fait) : une recette est ainsi une chaîne d'étapes (après la recherche au catalogue vient le plan, après le plan la liste des fichiers...), pas un sac d'outils par phase. `features` = la phase, le nombre de fichiers, la liste des artefacts (modèles, contrats, documents), un résumé du plan (nœuds retenus, manques déclarés), l'itération, le dernier résultat d'outil, et le dernier refus de la garde avec sa raison (`lastRefusal`), puisqu'un refus n'est pas un résultat d'outil et n'arriverait pas autrement jusqu'au modèle.
- Règle commune : rien qui change tout seul entre deux lectures (pas d'horloge, pas de date de fichier), parce que le nœud 9 relit l'état avant d'agir et refuse s'il a changé.

### 2. `context` (`state` → `context`)

Le paquet fabrique la clé de contexte : `[state.id, intention.id, intention.parameters]`, en JSON trié. C'est la clé sous laquelle les recettes sont rangées et retrouvées.

- Station : l'intention est l'événement du scénario (`energy-request`, `load-rises`, `poisoned-procedure`, `critical`), avec la minute. La clé est donc l'état de la cabine et l'événement.
- Usine : l'intention est `build`, et ses paramètres sont la signature de la tâche (le sujet, les sorties requises par grandeur et unité, les noms des contraintes), jamais l'identifiant de la tâche ni les données. La clé est donc le genre de tâche, la phase et le dernier pas : une deuxième tâche du même genre retrouve, après le même pas, ce que la première a fait ensuite.

### 3. `lookup` (`context` → `candidates`)

Le paquet demande à la mémoire les décisions connues pour cette clé, chacune avec ses statistiques (usages, succès, moyenne des récompenses, confiance, échecs consécutifs) et un score.

- Station : la mémoire est neuve à chaque scénario ; il n'y a de candidats qu'au second événement identique dans le même passage.
- Usine : la mémoire est chargée au début de la tâche depuis les recettes du sujet (`_recipes/<sujet>.json` dans le répertoire des ateliers) et sauvée à la fin.

### 4. `gate` (`candidates` → `policy` ou `fallback`)

Le paquet prend le premier candidat qui est à la fois promu et encore disponible, et sort par `policy` (la recette est rejouée, le modèle n'est pas appelé) ; sinon il sort par `fallback`. Une décision est promue quand elle a au moins trois expériences, une confiance d'au moins 0,75 et une récompense moyenne d'au moins 0,35 ; elle est rétrogradée sous 0,55 de confiance ou après trois échecs de suite (`plasticity.ts`, valeurs par défaut).

- Station : en pratique toujours `fallback` (mémoire neuve).
- Usine : avec les récompenses du nœud 11 (+1 pour un pas qui construit, +0,5 pour une lecture), un pas qui construit rejoue à partir de la quatrième tâche du même genre (moyenne des récompenses 0,58 après trois succès, seuil 0,35) et une lecture à partir de la sixième. Mesuré le 21 septembre avec le constructeur scripté `onnx` : à la quatrième tâche, `task.plan`, `model.fit` et `task.done` sont rejoués, le constructeur n'est appelé que pour la recherche, la liste, l'inspection et la vérification du contrat (test `tests/factory.test.ts`). Le manifeste note pour chaque pas s'il vient de la mémoire (`policy`) ou du modèle (`fallback`).

### 5. `request` (`fallback` → `request`)

Le paquet assemble ce que le modèle recevra : l'état, l'intention, les capacités permises à cet instant, les candidats qu'il n'a pas jugés assez sûrs, et les échecs récents dans ce contexte.

- Station : les capacités sont les outils de la cabine ; le texte envoyé au modèle est construit par `harness/lib/llm-common.ts` (l'intention une fois, puis l'observation à chaque pas).
- Usine : les capacités sont celles du sujet. En F4 le modèle est scripté et ne lit que l'état ; en F5 le texte pour un modèle vient de `FACTORY_PROMPT` et d'une observation propre à l'atelier (le texte actuel de `llm-common.ts` parle à l'équipage ; il devient un paramètre).

### 6. `reason` (`request` → `decision`)

Le paquet appelle `fallback.resolve(request)` et vérifie la décision rendue : une action, un outil, une entrée. Si l'outil n'est pas dans la liste permise, le pas s'arrête (« Provider proposed a capability outside the allowlist »).

- Station : le slot `reasoner` (une conversation par événement, la grammaire du slot choisie par la famille du modèle) ou l'agent scripté (`compliant`, `prudent`). Une réponse en texte sans appel d'outil devient un `crew.report`.
- Usine : le constructeur scripté du sujet (`harness/scripted/<sujet>.ts`) : une ligne par phase, qui lit le dernier résultat dans l'état quand elle a besoin d'un chemin ou d'un chiffre. Avec un modèle (F5), une réponse sans outil est renvoyée au modèle comme une erreur de forme : l'usine n'a pas d'équipage à qui parler.
- Arrêt possible : un outil hors liste, un délai dépassé, le modèle injoignable. Le runner note le pas comme échoué avec la raison et continue ; si le modèle lui-même est en panne (aucune proposition faite), il abandonne la tâche, comme le runner de la station abandonne l'événement.

### 7. `merge` (`policy` ou `reasoning` → `decision`)

Le paquet accepte l'une des deux entrées (la seule qui arrive) et compte la source dans les mesures. Rien de plus ; c'est le point où les deux chemins se rejoignent.

### 8. `guard` (`decision` → `authorized`)

Le paquet fait deux vérifications : l'entrée de l'outil contre son schéma (Ajv), puis `guard.validate(decision, context)`. Un refus arrête le pas avec la raison ; rien n'est exécuté, rien n'est enregistré dans la mémoire.

- Station : profil `measured`, la garde accepte tout, tout est jugé dehors (la politique du broker, la carte) ; profil `protected`, elle refuse une vitesse hors de [0, 100], une réduction en CRITICAL, une vitesse sous le débit minimal hors NOMINAL.
- Usine, la garde du constructeur (`harness/core/builder-guard.ts`) :
  - l'outil est un outil du sujet (la liste du sujet), sinon refus ;
  - toute entrée qui ressemble à un chemin (`path`, `file`, `name`) reste dans l'atelier : pas de `..`, pas de chemin absolu ;
  - `task.plan` est conforme : chaque nœud retenu existe dans le catalogue (`registry_describe_node` sur le slot du runtime), chaque sortie requise de la tâche est produite par un nœud retenu (sa signature, même grandeur, même unité si elle est donnée) ou figure dans `missing_capabilities`, chaque manque a une raison non vide et un sujet connu, aucun champ inconnu ;
  - `task.done` n'est pas vérifié ici (c'est l'évaluateur, nœud 11).
  - Les budgets ne sont pas dans la garde : le runner compte les itérations et les minutes et arrête de faire des pas.
- Un refus compte une itération. Le runner l'écrit dans la trace et dans l'état (`lastRefusal`) pour que le modèle le lise au pas suivant.

### 9. `execute` (`authorized` → `result`)

Le paquet fait exécuter la capacité par le registre : disponible ; approbation demandée si sa politique de rejeu est `approval-required` ; relecture de l'état par l'observateur, qui doit être identique à celui du nœud 1 (sinon « Stale decision ») ; puis l'appel. Le résultat est `{ ok, output, error }`.

- Station : un appel au broker, `<slot>.<outil>` ; l'issue (`completed`, `refused` par la carte, `deny` par la politique du broker, `error`) voyage dans `output.outcome`. `crew.report` et `crew.ask` écrivent dans la console de l'équipage sans passer par le broker.
- Usine : un appel au broker aussi, mais lié à la tâche : le modèle ne voit pas `taskId`, la capacité l'ajoute (`workspace.*`, `model.*`), et les noms de documents du runtime sont préfixés par la tâche (`document_build`, `document_instantiate`, `session_run` : `name` devient `<tâche>/<name>`). `task.plan` écrit `plan.json` dans l'atelier et fait passer la phase à `build` ; `task.done` écrit `done.json` avec le résumé et les artefacts déclarés.

### 10. `observe-after` (`result` → `outcome`)

Le paquet relit l'état par l'observateur (comme au nœud 1) et l'attache au résultat.

- Station : la carte après l'action (le CO2, la vitesse).
- Usine : l'atelier après l'outil (un fichier de plus, un sha256 qui a changé), la phase mise à jour.

### 11. `evaluate` (`outcome` → `experience`)

Le paquet appelle `evaluator.evaluate({ context, decision, stateAfter, result })` et vérifie la réponse : `success` (vrai ou faux), `reward` entre -1 et 1, une raison.

- Station (`tier3/lib/evaluator.ts`) : `crew.*` neutre (0) ; un résultat non `ok` vaut -1 avec la raison ; sinon +1 si la cabine est NOMINAL après, +0,5 si elle n'a pas empiré, -0,5 si elle a empiré.
- Usine (`harness/core/task-evaluator.ts`) : un résultat non `ok` vaut -1 avec la raison ; `task.plan` accepté vaut +1 ; un outil réussi vaut +1 si l'atelier a changé (un fichier ajouté ou remplacé) et +0,5 sinon (une lecture : utile, mais pas un progrès) ; `task.done` déclenche le validateur du sujet : le contrat est tenu (pour `onnx` : un modèle et son contrat dans l'atelier, et une vérification `model.contract` réussie sur ce modèle dans cette tâche) → succès, +1, et la phase passe à `done` ; sinon échec, -1, la liste des manques dans la raison, et la phase reste `build` : le modèle la lit au pas suivant.

### 12. `record` (`experience` → rien)

Le paquet enregistre l'expérience dans la mémoire (ce qui met à jour les statistiques de la transition et donc la promotion future de la recette), compte l'issue dans les mesures, et clôt le pas avec la trace complète.

- Station : la trace va dans `outputs/tier3/<fournisseur>-<profil>/trace.jsonl` et dans le scorecard.
- Usine : la trace va dans `trace.jsonl` de l'atelier et dans le manifeste (`manifest.json`) ; à la fin de la tâche la mémoire est sauvée dans les recettes du sujet.

## 3. Ce qui entoure la boucle à l'usine

| fichier | rôle |
|---|---|
| `harness/lib/flow.ts` | le graphe des douze étapes (déplacé depuis `tier3/lib/flow.ts`, même contenu) |
| `harness/core/agent.ts` | `createAgent` général : un broker, un modèle, des capacités, un observateur, un évaluateur, une garde ; rend le runtime et `decide` |
| `harness/core/capabilities.ts` | `buildCapabilities` général : les outils du broker enregistrés comme capacités selon un profil (exclus, approbation requise, jamais, liaison d'entrées, capacités en processus) |
| `harness/core/workspace-observer.ts` | l'observateur de l'atelier (nœuds 1 et 10) |
| `harness/core/builder-guard.ts` | la garde du constructeur (nœud 8) |
| `harness/core/task-evaluator.ts` | l'évaluateur de la tâche et le validateur du sujet (nœud 11) |
| `harness/core/recipes.ts` | la signature de tâche (nœud 2), le chargement et la sauvegarde des recettes (nœuds 3 et 12) |
| `harness/core/manifest.ts` | le manifeste de la tâche (section 5 de `factory-harness.fr.md`) |
| `harness/core/runner.ts` | une tâche de bout en bout : les pas, les budgets, la trace, le manifeste, la proposition |
| `harness/scripted/onnx.ts` | le constructeur scripté du sujet `onnx` (nœud 6 sans modèle) |

**Les phases.** `plan` tant qu'aucun `task.plan` n'a été accepté ; `build` ensuite ; `done` quand `task.done` a passé le validateur ; `failed` quand le budget est épuisé, que le modèle est en panne, ou que le constructeur a renoncé (`task.fail`). La vérification du contrat n'est pas une phase visible : c'est l'évaluation du pas `task.done`.

**Les trois outils en processus.**

| outil | entrée | ce qu'il fait |
|---|---|---|
| `task.plan` | `{ selected_nodes: [type], missing_capabilities: [{ required_output, quantity, unit?, reason, topic }] }` | vérifié par la garde (nœud 8) ; écrit `plan.json` ; phase `build` |
| `task.done` | `{ summary, artifacts: [{ kind, path }] }` | écrit `done.json` ; jugé par l'évaluateur (nœud 11) |
| `task.fail` | `{ reason }` | le constructeur renonce avec la raison que l'outil lui a donnée ; écrit `failed.json` ; phase `failed`, la tâche s'arrête là au lieu de dépenser le budget sur le même échec (récompense 0, pas un succès : rien n'est appris) |

**La proposition.** Quand `task.done` est accepté, c'est le runner, pas le modèle, qui écrit le manifeste puis appelle `station.propose` avec les artefacts (chemin, sha256, contrat), les affirmations (sorties requises, résultat du bac à sable) et le sha256 du manifeste : le sha256 du manifeste n'existe qu'une fois la trace close. `station.propose` n'est donc pas une capacité du modèle. La station demande ensuite le jugement au jumeau (étape D, hors F4).

**Les budgets.** `iterations` (chaque pas compte, refus compris), `minutes` ; lus dans la tâche, valeurs par défaut 20 et 30. `twinPoints` est compté par le slot `twin` (hors F4).

**Ce qui est écrit dans l'atelier.** `plan.json`, `done.json`, `trace.jsonl` (un pas par ligne : la trace complète du harnais, l'échange avec le modèle, l'appel d'outil), `manifest.json` (avec `state`, ce que `factory.task` lit), et `manifest.proposed.json`, le manifeste tel que la station l'a reçu, octet pour octet (son sha256 est dans la proposition ; `manifest.json` est le même plus l'identifiant de la proposition et l'état final). Les recettes : `_recipes/<sujet>.json` à côté des ateliers.

## 4. Ce qui a bougé dans `tier3/` et ce qui y reste

Déplacé : `tier3/lib/flow.ts` vers `harness/lib/flow.ts` (importé par `tier3/agent.ts`, `scripts/build-agent-graph.ts`, les tests). Généralisé : `createAgent` (dans `harness/core/agent.ts` ; `tier3/agent.ts` l'appelle avec l'observateur, l'évaluateur et la garde de la cabine) et `buildCapabilities` (dans `harness/core/capabilities.ts` ; `tier3/lib/capabilities.ts` garde le profil de la cabine, les listes `EXCLUDED`, `APPROVAL_REQUIRED`, `PROTECTED_NEVER`, et les deux capacités `crew.*`). Rien n'est copié.

Reste à la station : son observateur, son évaluateur, ses profils de garde, le runner de scénario, le scorecard, la page du studio, la voix.

## 5. Hors F4

Le prompt de l'usine et les adaptateurs de modèles pour l'usine (F5 : les mots de `llm-common.ts` deviennent un paramètre, un jeu pour la cabine, un jeu pour l'atelier) ; le sujet `graph` et son validateur (F5) ; `factory.request` qui lance le runner (F6) ; le conteneur (F7) ; `twin.evaluate` et le verdict dans le manifeste (étape D).
