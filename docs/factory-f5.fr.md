# Spécification F5 : l'audit des données, le planificateur, le modèle à la place du script, le sujet `graph`

*Spécification du 21 septembre 2026, soir, à valider avant le code. Elle exécute l'étape F5 de `factory-harness-plan.fr.md` (« le planificateur, les prompts, les validateurs des deux sujets ») sur ce qui est construit depuis : la boucle et ses services (`harness-stages.fr.md`), le sujet `onnx` avec son constructeur scripté, la page de l'usine, les phrases dans les grammaires des slots (mcp-core 1.2). Elle ajoute un pas que F1 n'avait pas : l'audit des données avant toute construction, demandé par Guillaume le 21 septembre après une tâche échouée sur une télémétrie à une seule vitesse (« le Control Board peut le dire s'il y a une analyse honnête et systématique préalable, pas pour remplir ce cas d'usage »).*

## 0. Ce qui est fixé

1. Le constructeur ne construit rien sur des données qu'il n'a pas examinées : l'audit est un pas de la boucle, systématique (le même outil pour tout jeu de données et toute famille de modèle), et la garde refuse un ajustement sans audit réussi du même fichier dans la même tâche.
2. Le modèle remplace le constructeur scripté sans changer la boucle : mêmes outils, même garde, même évaluateur, même manifeste, même page. Le scripté reste pour les tests et le conteneur.
3. Les mots du modèle (le prompt de l'usine, le texte de l'observation) sont des phrases de grammaire, par famille et par langue, comme tout ce qui est dit dans la démo ; rien dans le code.
4. Le sujet `graph` : composer un document du studio à partir du plan, le faire tourner dans le bac à sable, et le valider par ce qu'il produit.
5. Une tâche peut enchaîner deux sujets (`onnx` puis `graph`) : le modèle ajusté d'abord, le graphe qui l'utilise ensuite, une seule proposition à la fin.

## 1. L'audit des données

### 1.1 Le nom

« Audit » : un examen systématique d'un objet face à une référence énoncée, qui rend une liste de constats, sans autre jugement que « tient » ou « ne tient pas ». C'est exactement ce pas : le jeu de données face à ce que la famille de modèle demandée exige. « Analyse » dirait moins (analyser quoi, pour quoi), « profil » ne dirait que la description sans la référence.

### 1.2 L'outil `model.audit`

Sur le slot `model`, à côté de `fit`, `inspect`, `contract`.

| entrée | sortie |
|---|---|
| `{ dataset: { file, duty?: { column }, current?: { column } }, family: "affine-residual", domain?: { dutyMin, dutyMax }, fullScale?: { duty, current } }` (les mêmes champs que la spécification d'ajustement, `spec.dataset`, `spec.model`, `spec.domain`, `spec.fullScale` ; les colonnes non nommées sont devinées comme le fait le constructeur, sur leur nom) | `{ file, sha256, rows, columns: [{ name, kind: "number" \| "text" \| "boolean" \| "mixed", missing, distinct, min, max, mean }], requirements: [{ id, holds, detail }], ok }` |

Les colonnes sont décrites toutes, telles qu'elles sont, sans en choisir : nombre de lignes, valeurs manquantes, valeurs distinctes, étendue et moyenne pour les nombres. Les exigences sont celles de la famille, énoncées par la famille elle-même dans le paquet factory du substrat, pas par l'outil :

| exigence (`affine-residual`) | `id` | ce qui est vérifié | `detail` (exemple) |
|---|---|---|---|
| la colonne d'entrée est numérique | `input.numeric` | `kind === "number"`, pas de valeur manquante | `duty_percent: 40 numbers, 0 missing` |
| la colonne de sortie est numérique | `output.numeric` | idem | `current_amps: 40 numbers, 0 missing` |
| assez de lignes dans le domaine | `domain.rows` | au moins 2 lignes dont l'entrée normalisée est dans `[dutyMin, dutyMax]` | `40 rows inside [0.1875, 0.8] of 40` |
| l'entrée varie dans le domaine | `input.spread` | au moins 2 valeurs distinctes de l'entrée dans le domaine (sinon la pente n'est pas définie) | `1 distinct command inside the domain, 2 required` |

Une source, pas deux : le paquet `@spiky-panda/factory` expose `auditFit(spec, rows)` qui rend cette liste, et `runFit` l'appelle avant d'ajuster (le refus « every point shares the same duty » d'aujourd'hui devient l'exigence `input.spread` qui ne tient pas, avec le même texte dans `detail`). Le slot `model.audit` appelle la même fonction sans ajuster. Une famille nouvelle déclare ses exigences au même endroit ; l'outil n'a rien à savoir d'elle.

### 1.3 Dans la boucle

- **La garde** (nœud 8) : `model.fit` sur un fichier est permis seulement si un `model.audit` du même fichier (même sha256) a été fait dans cette tâche et que son `ok` est vrai. Sinon le refus dit lequel manque : « no audit of telemetry.json in this task » ou « the audit of telemetry.json did not hold: input.spread: 1 distinct command inside the domain, 2 required ». L'évaluateur garde les audits réussis dans `progress.audits` (fichier, sha256, exigences), comme il garde les contrats vérifiés.
- **Le constructeur scripté `onnx`** : après `workspace.list`, `model.audit` ; si `ok`, `model.fit` ; sinon `task.fail` avec, pour raison, les exigences qui ne tiennent pas (leur `detail`, pas le message d'un autre outil). La tâche de la nuit à une seule vitesse finit donc en cinq pas : recherche, plan, liste, audit, renoncement, et la station dit : « Audit of telemetry.json: 40 rows; 3 of 4 requirements hold; input.spread: 1 distinct command inside the domain, 2 required. » puis « The factory gives up. »
- **Le manifeste** : chaque audit est un pas comme un autre ; la proposition à la station reprend le dernier audit réussi dans ses affirmations (`claims.audit`), pour que le jumeau et l'opérateur sachent sur quelles données le modèle a été fait.
- **Le Control Board** ne fait rien de plus : il dit le pas d'audit comme les autres, depuis le manifeste, avec les phrases du slot `factory`.

### 1.4 Les phrases (slot `factory`, `phrases`)

| clé | anglais |
|---|---|
| `step.model.audit` | `Audit of {file}: {rows} rows; {holds} of {total} requirements hold{problems}.` |
| `step.model.audit.problems` | `; {problems}` (la liste des `detail` qui ne tiennent pas, séparés par « ; ») |
| `stage.guard.noAudit` | (dans la raison d'un refus, c'est la garde qui parle : `step.refused` suffit) |

## 2. Le modèle à la place du script

### 2.1 Qui décide

Le runner reçoit un fournisseur (`Provider`) comme aujourd'hui ; ce qui change, c'est qui le construit :

| où | fournisseur | choix |
|---|---|---|
| local, slot `factory` | le slot `reasoner` par `reasoner.decide` avec `role: "factory"` (le client `ReasonerProvider` existant, la conversation par tâche) ; le scripté quand le raisonneur n'est pas prêt (pas de clé) ou que `FACTORY_BUILDER=scripted` | le profil actif, section `factory`: `{ "builder": "reasoner" \| "scripted" }` |
| conteneur (F7) | l'adaptateur `openai-compatible` vers Token Factory (Nemotron), clé dans l'environnement du job, sans slot | le profil du job |
| tests | le scripté | |

`reasoner.decide` gagne un paramètre `role` (`tier3` par défaut, `factory`) : il choisit le prompt et le texte d'observation (2.2), et la conversation est par `conversationId` comme aujourd'hui (une par tâche).

### 2.2 Les mots du modèle : des phrases, par famille

Le prompt de l'usine et ce que le modèle lit à chaque pas ne sont pas dans le code : ce sont des phrases de la grammaire du slot `reasoner`, qui n'en a pas encore (`slots/reasoner/grammars/default/en.json`, et `nemotron/en.json`, `claude/en.json` pour ce qui change d'une famille à l'autre, composé sur la base comme pour les outils).

| clé | rôle |
|---|---|
| `prompt.factory.system` | le prompt du constructeur : tu construis, tu ne juges pas ; un plan d'abord (`task.plan`), un outil par pas, l'audit avant l'ajustement, `task.done` quand le contrat est tenu avec les chiffres lus dans les réponses des outils, `task.fail` avec la raison de l'outil quand ce n'est pas possible ; jamais un chiffre inventé |
| `prompt.factory.intention` | la première ligne de la conversation : `Task {taskId} on topic {topic}: {description}. Budget: {iterations} steps.` |
| `prompt.factory.observation` | le texte de chaque pas : `Workshop at step {iteration}, phase {phase}: {files} files, artifacts {artifacts}; plan: {plan}; last call {lastCapability}: {lastOutcome}; refused: {lastRefusal}. Answer: {lastOutput}` puis la consigne `Choose exactly one tool call now.` |
| `prompt.factory.noTool` | ce que le fournisseur répond une fois quand le modèle écrit sans appeler d'outil : `Answer with exactly one tool call.` ; à la seconde fois, `task.fail` avec la raison `the builder answered in text: {text}` |
| `prompt.tier3.*` | plus tard : le prompt de l'agent (`tier3/prompts/system.md`) et les textes de `llm-common.ts` (qui parlent à l'équipage) rejoignent le même mécanisme ; pas dans F5 |

Les adaptateurs (`anthropic.ts`, `openai-compatible.ts`) reçoivent ces textes en option (`wording`), au lieu de les importer de `llm-common.ts` : un jeu pour la cabine (l'actuel), un jeu pour l'atelier. Le manifeste enregistre le sha256 du prompt utilisé (le texte de la phrase), comme il enregistre celui de la tâche.

### 2.3 Ce que le modèle voit, ce qu'il ne voit pas

Il voit : les outils du sujet avec leurs descriptions (les grammaires des slots, dans sa famille), `task.plan`, `task.done`, `task.fail`, l'état de l'atelier à chaque pas, la réponse du dernier outil, la raison du dernier refus. Il ne voit pas `taskId` (lié par l'hôte), ni `station.propose` (le runner propose), ni rien de la carte. Un outil hors liste, un chemin hors atelier, un plan non conforme, un ajustement sans audit : la garde refuse et il lit pourquoi au pas suivant. Ce sont les règles de F4, inchangées.

## 3. Le planificateur et les deux sujets

### 3.1 Le plan avec `topics: "auto"`

Le plan (`task.plan`) reste ce qu'il est. Ce qui change : quand la tâche dit `topics: "auto"`, les sujets de la tâche sont déduits du plan accepté : `graph` s'il y a des nœuds retenus, plus le sujet de chaque manque (`missing_capabilities[].topic`, aujourd'hui `onnx`). Ordre fixe : les manques d'abord (le modèle qu'il faut fabriquer), la composition ensuite (le graphe qui l'utilise). Une tâche qui nomme ses sujets les prend dans cet ordre-là aussi.

### 3.2 Les sujets enchaînés dans une tâche

La phase gagne le sujet en cours : `build:onnx`, `build:graph`. La garde n'autorise que les outils du sujet en cours ; `task.done` est jugé par le validateur du sujet en cours ; s'il tient et qu'un sujet reste, la phase passe au suivant (le modèle le lit dans l'observation : « topic onnx done, now graph ») ; s'il tient et qu'aucun ne reste, la tâche est `done` et le runner propose. Un seul manifeste, une seule liste de pas, une seule proposition avec tous les artefacts (le modèle et son contrat, le document). Les recettes sont par sujet, comme aujourd'hui : la clé d'un pas porte la phase, donc le sujet.

### 3.3 Le sujet `graph`

| pièce | contenu |
|---|---|
| outils | `workspace.*`, `twin.registry_*`, `twin.document_validate`, `twin.document_build`, `twin.document_instantiate`, `twin.session_run`, `task.*` ; pas `model.*` |
| validateur | un artefact `graph` (`.spikypanda`) est un fichier de l'atelier ; il a été construit dans cette tâche par `document_build` (sha256 égal) ; il s'instancie sans type manquant (`document_instantiate` dans cette tâche : `missingTypeIds` vide) ; un `session_run` de cette tâche sur ce document a fourni, pour chaque sortie requise du plan couverte par un nœud, une sonde dont la dernière valeur est un nombre fini ; quand la tâche a des contraintes chiffrées (`residualPpmMax`), la sonde correspondante les respecte sur la fenêtre (`windowMinutes`) ; sinon les problèmes sont listés et le modèle les lit |
| constructeur scripté | les lignes de la cabine du test de l'atelier : `document_validate` puis `document_build` d'un document avec les nœuds retenus (crew, timeline de commande, scrubber, cabin-air ; le nœud `spk.onnx:model` sur le modèle ajusté quand le sujet `onnx` a précédé), `document_instantiate`, `session_run` avec une sonde sur `cabin.co2Ppm`, `task.done` |
| phrases (`factory`) | `step.twin.document_validate` (`Document checked: {problems} problem(s).`), `step.twin.document_build` (`Graph built: {nodes} nodes, {connections} connections, {bytes} bytes.`), `step.twin.document_instantiate` (`Graph opened: {nodes} nodes, {missing} type(s) missing.`), `step.twin.session_run` (`Sandbox run: {ticks} ticks in {wallMs} ms; {probes}.` avec, par sonde, `{name} from {first} to {last}`) |

Le bac à sable reste `session_run` (borné par `maxTicks`, `maxSamples`) ; le jugement (`twin.evaluate`) reste à la station, hors F5.

## 4. Ce qui se voit

Rien de nouveau sur les pages : les pas d'audit et du sujet `graph` sont des pas comme les autres, avec leurs phrases. Ce qui change à l'oreille : « Audit of telemetry.json: 40 rows; 4 of 4 requirements hold. » avant « Model fitted on 40 rows... », et pour le sujet `graph` : « Graph built: 4 nodes, 3 connections. » « Sandbox run: 60 ticks in 8 ms; cabin.co2Ppm from 1500 to 1102. » Le badge de la page de l'usine dit le constructeur (`scripted:onnx`, `reasoner:claude-haiku-4-5`) et le sujet en cours.

## 5. Ce qui est écrit, ce qui est vérifié

Dans le substrat : `auditFit` dans `@spiky-panda/factory` (une source pour l'audit et l'ajustement), repack (`vendor/`, version 0.1.2). Dans la démo : `model.audit` (slot `model`, grammaires en/fr), `progress.audits` et la règle de la garde, le scripté `onnx` révisé, `harness/topics/graph/` (outils, validateur) et `harness/scripted/graph.ts`, la phase par sujet dans le runner et l'observateur, le fournisseur choisi par le profil, `reasoner.decide` avec `role`, les grammaires du slot `reasoner` (prompt et textes de l'usine, base et familles), `wording` en option des adaptateurs, les phrases nouvelles du slot `factory` en anglais et en français.

Tests, à travers le broker :

1. l'audit : une télémétrie à une seule vitesse : `model.audit` rend `ok: false` avec `input.spread` ; le scripté renonce en cinq pas avec ce `detail` pour raison ; une télémétrie à trois vitesses : `ok: true`, quatre exigences tenues, puis l'ajustement passe ; `model.fit` sans audit préalable est refusé par la garde avec le nom du fichier ;
2. le sujet `graph` seul : le scripté construit la cabine, la fait tourner, `task.done` tient ; un document sans `session_run` est refusé par le validateur avec la raison ;
3. les deux sujets : `topics: "auto"` sur la tâche de la démo : plan, `onnx` (audit, ajustement, contrat), `graph` (document avec le nœud du modèle), une proposition avec trois artefacts ;
4. le modèle (Haiku d'abord) : la même tâche avec `role: "factory"` sur le slot `reasoner` ; le plan produit est conforme ; l'audit précède l'ajustement (sinon la garde l'aurait refusé, et le manifeste le montrerait) ; le manifeste nomme le sha256 du prompt ; un pas en texte sans outil est repris une fois puis termine en `task.fail` ; mesuré et écrit dans `STATUS.md` : pas, jetons, temps, refus ;
5. les mots : les grammaires du slot `reasoner` portent les mêmes clés en base et dans chaque famille (`referenceLocale`), rien de statique dans les adaptateurs.

## 6. Ordre et estimation

| pas | contenu | jours |
|---|---|---|
| F5.1 | `auditFit` dans le substrat, `model.audit`, la garde, le scripté `onnx`, les phrases, le test 1 | 0,5 |
| F5.2 | le sujet `graph` : outils, validateur, scripté, phrases, la phase par sujet, `topics: "auto"`, les tests 2 et 3 | 1 |
| F5.3 | le modèle : `reasoner.decide` avec `role`, les grammaires du slot `reasoner`, `wording` des adaptateurs, le choix par le profil, le test 4 et le test 5 | 1 |

Deux jours et demi, contre le jour prévu au plan du 21 septembre : l'audit et l'enchaînement des sujets sont en plus.

## 7. Hors F5

Le jugement du jumeau et le verdict dans le manifeste (étape D) ; le conteneur (F7) ; le prompt de l'agent Tier 3 dans les grammaires ; le sujet `code` et la 3D ; la série de la tuile du moniteur sur la page de l'usine (celle de la cabine aujourd'hui).
