# Spécification F1 : l'usine, un harnais générique augmenté par ses outils

*Spécification du 21 septembre 2026, à valider avant le code. Elle exécute l'étape F1 de `factory-harness-plan.fr.md` (les cinq décisions validées par Guillaume le 21 septembre) et précise une sixième : l'usine tourne aussi à distance, dans un conteneur, avec son propre broker. Elle complète `auto-adaptation.fr.md` (la chaîne de confiance, section 1 ; le jumeau juge, section 2) et `ui-brief.fr.md` (section 12, le Control Board).*

## 0. Ce qui est fixé

1. Un seul harnais (la boucle des douze étapes de `@spiky-panda/harness`) ; ses capacités sont les outils d'atelier publiés sur un broker ; un sujet (`graph`, `onnx` ; `code`, `3d` plus tard) est un jeu d'outils, un prompt, un validateur.
2. Deux modes de déploiement, le même code : **local**, sur le broker de l'habitat, sous le rôle `factory` ; **à distance**, dans le conteneur de l'usine (`docker/Dockerfile`, image `ghcr.io/pandagaume/co2-scrubber-factory`), avec **son propre broker** dans le conteneur, lancé par la ligne de commande `spikypanda-job` (le runner de `@spiky-panda/factory`) sur une tâche, pour Nebius Serverless Jobs.
3. Le dossier `harness/` à la racine de la démo ; extraction vers `Gaume/spikypanda-harness` quand c'est stable.
4. Périmètre du 30 octobre : composer et ajuster (`graph`, `onnx`).
5. Le modèle de l'usine : le slot `reasoner`, avec un rôle `factory` qui choisit `FACTORY_PROMPT` ; à distance, le même adaptateur vers Token Factory (Nemotron), sans passer par un slot.
6. Les signatures au niveau du type de nœud, déclarées par les plugins, unités des ports, coût mesuré par le banc.

Et une règle qui ne bouge pas : l'usine ne juge pas et n'enregistre pas. Son validateur (étape 11) est un bac à sable ; la proposition à la station (`station.propose`) est sa dernière action ; la station demande le jugement au jumeau (`twin.evaluate`), enregistre sur rapport positif, et l'opérateur approuve. Un rejet revient à la tâche comme un échec avec le rapport, et la tâche se rouvre.

## 1. Les deux modes

| | local | à distance (conteneur) |
|---|---|---|
| broker | celui de l'habitat (port 3001), rôle `factory` | le sien, dans le conteneur (`127.0.0.1`), rôle `factory` seul ; aucun accès au broker de l'habitat |
| slots d'atelier | publiés par `run-all.ts` avec les autres | publiés par le runner au démarrage du conteneur |
| jumeau (bac à sable) | `session_run` du runtime, publié par le slot `twin` de l'habitat | `session_run` du runtime, publié dans le conteneur sur le jumeau embarqué |
| modèle | le slot `reasoner` (rôle `factory`) | l'adaptateur `openai-compatible` vers Token Factory, clé dans l'environnement du job |
| la tâche entre | `factory.request` (l'agent, par le broker) crée la tâche et lance le runner en processus | `spikypanda-job /specs/tasks/<task>.json` : la tâche est le fichier de spécification du job |
| la tâche sort | `factory://tasks/<id>` (manifeste, trace, artefacts) ; `station.propose` par le broker | l'atelier et le manifeste écrits sous `NEBIUS_OUTPUT_DIR` (le bucket) ; **la proposition est un fichier** (`proposal.json`) que le slot `factory` de l'habitat relit à la fin du job et transmet à `station.propose` |
| qui lance | l'agent (Tier 3), par `factory.request` | le slot `factory` de l'habitat (`nebius ai job create`, image, tâche, bucket), qui suit `job_status` |

Le code est le même : `harness/core` reçoit un broker (URL, identité) et une tâche, et ne sait pas où il tourne. La différence tient dans deux fonctions : d'où vient le modèle, et où va la proposition.

## 2. Le rôle `factory` (politique du broker)

Capacités nouvelles dans `broker/policy.example.json` :

| capacité | outils | `factory` | `tier3` | `operator` |
|---|---|---|---|---|
| `mcp.tools.workshop` | `workspace.*`, `spikypanda.registry_*`, `spikypanda.document_validate` | oui | non | oui |
| `mcp.tools.build` | `spikypanda.document_build`, `spikypanda.document_instantiate`, `spikypanda.session_run`, `model.fit`, `onnx.inspect`, `onnx.contract` | oui | non | oui |
| `mcp.tools.propose` | `station.propose` | oui | non | oui |
| `mcp.tools.read` | `twin.describe`, `factory.task`, `factory.tasks` | oui | oui | oui |
| refusés à `factory` | `mcp.tools.actuate`, `power`, `protect`, `register`, `admin`, `grammar`, `speak`, `reason` (l'usine ne parle pas à la carte, n'enregistre pas, ne parle pas à voix haute : la station raconte) | | | |

Chemins : les slots d'atelier sous `/workshop/<slot>` ; le rôle `factory` a `/workshop/**` et `/habitat/cabin-1/twin` (lecture et `session_run`) et `/habitat/cabin-1/station` (`propose` seulement). Budgets du rôle : `twinPoints` par tâche (le bac à sable est borné comme les questions du Tier 3), `iterations` (20), `minutes` (30).

Dépendance : l'autorisation hiérarchique du broker doit être activée (`docs/STATUS.md` : « policy deny waits for the broker's authorization »). Tant qu'elle ne l'est pas, la séparation `factory` / `tier3` n'est que déclarée ; le test de F3 échoue tant qu'un appel de `tier3` à `document_build` n'est pas refusé par le broker.

## 3. Les outils d'atelier, avec leur contrat et leur signature

Chaque outil est un outil MCP d'un slot (`slots/lib/slot-server.ts`), avec ce que le serveur ajoute (grammaires, ressource `<slot>://grammars`) et une **signature** exposée dans une ressource `<slot>://signatures` et reprise par le catalogue. Les coûts sont **à mesurer** (le banc les écrit, avec la machine et la date) ; ils sont vides ici, jamais tapés.

### 3.1 `workspace` (l'atelier de la tâche)

Un répertoire par tâche (`outputs/factory/<taskId>/`, ou `WORKSHOP_DIR/<taskId>/` quand l'hôte le dit : les outils ne connaissent aucune plateforme ; c'est le runner du conteneur qui fait pointer `WORKSHOP_DIR` sur le répertoire de sortie de la plateforme, `NEBIUS_OUTPUT_DIR` chez Nebius). Tout chemin est relatif à l'atelier ; `..` et les chemins absolus sont refusés.

| outil | entrée | sortie | note |
|---|---|---|---|
| `workspace.list { path? }` | `path` relatif | `[{ path, bytes, sha256, modified }]` | |
| `workspace.read { path, maxBytes? }` | | `{ path, text \| base64, bytes, sha256 }` | 256 Ko au plus par lecture, dit dans le refus |
| `workspace.write { path, text \| base64 }` | | `{ path, bytes, sha256 }` | crée les répertoires ; un fichier existant est remplacé et l'ancien sha256 est journalisé |

Signature : `purpose: "the task's own files"`, `capabilities: ["workspace"]`, pas d'unités.

### 3.2 Le catalogue des types de nœuds : le serveur MCP du studio, pas un slot de plus

Corrigé le 21 septembre après la remarque de Guillaume : le broker tient déjà le registre des services (`providers_list`, puis `tools/list` de chaque slot ; c'est ce que le harnais lit pour ses capacités), et le catalogue des types de nœuds a déjà son serveur dans le substrat, `@spiky-panda/mcp` (le slot `spikypanda` que le studio publie sur le broker). Il n'y a donc **pas** de slot `registry` dans la démo ; le planificateur appelle les outils du slot `spikypanda` :

| outil | entrée | sortie |
|---|---|---|
| `spikypanda.registry_search { requiredOutputs: [{ quantity, unit? }], capabilities?: [string], text?, limit? }` | ce que le plan doit produire | `{ signed, total, matches: [{ type, label, signature, score, produces }] }`, dix au plus, classés : sortie exacte d'abord (grandeur et unité), puis capacités communes, puis coût mesuré croissant (`searchSignatures` du core) |
| `spikypanda.registry_describe_node { type }` | | la signature, les ports avec leurs unités déclarées, la documentation |

En local, le studio le publie (`?mcp=1` sur la page de la boucle, `Studio.publishMcp`). Dans le conteneur, sans studio, le même comportement est publié depuis Node avec le registre des plugins (`buildJobRegistry`) : `@spiky-panda/mcp` doit accepter un registre seul, sans visionneuse, pour ses outils `registry_*` (petite scission dans le substrat, étape F3). Une seule implémentation, celle du substrat ; le broker la liste comme n'importe quel slot.

### 3.3 et 3.4 Le graphe et le bac à sable : le serveur MCP du runtime (fait le 21 septembre)

Décision de Guillaume le 21 septembre, sur-validée : ces outils ne sont pas du code de la démo, ce sont ceux du **runtime**, exposés par `@spiky-panda/mcp` sans aucune dépendance au studio (`RuntimeBehavior`, sur un `NodeRegistry` et un magasin de documents ; la bibliothèque des documents, `instantiateDocument`, `buildDocumentJson`, `validateDocumentSpec`, `runDocument`, est passée du paquet factory au core). Le studio les sert aussi, sur le registre de la page ; un processus Node (le conteneur de l'usine, le slot `twin` de l'habitat) publie le même comportement tel quel. Mêmes noms, mêmes réponses.

| outil (namespace `spk`, slot `spikypanda` ou `twin`) | entrée | sortie |
|---|---|---|
| `document_validate { spec }` | `spec = { nodes: [{ id, typeId, params?, label?, x?, y? }], connections: [{ from: [id, port], to: [id, port] }] }` (les positions sont disposées si absentes) | `{ ok, problems: [{ where, what }] }` : un identifiant en double, un type inconnu, un port inconnu, deux fils sur une entrée, deux ports reliés dont les unités déclarées ne s'accordent pas (`validateDocumentSpec` du core) |
| `document_build { spec, name? }` | la même `spec` ; un nom pour garder le document dans le magasin | `{ ok, name, sha256, bytes, nodes, connections }` (le texte JSON en plus quand il n'y a pas de nom) ; construit par le builder de documents, jamais du JSON écrit à la main ; validé d'abord, refusé sinon |
| `document_instantiate { name \| document }` | un document du magasin ou son texte | `{ ok, sha256, nodes: [{ id, typeId, instantiated }], missingTypeIds, skippedConnections, sceneBound }` : le document s'ouvre dans le registre, sans tourner |
| `session_run { name \| document, dt, duration, probes: [{ node, property }], sampleEvery?, settings? }` | un document, le pas et la durée en secondes de session, les propriétés à lire à chaque pas, des réglages appliqués avant | `{ documentSha256, ticks, samples, sampleEvery, wallMs, summary: { "<node>.<property>": { first, last, min, max } }, series }` : la boucle de pas de l'éditeur sans l'écran ; bornée (`maxTicks`, `maxSamples`) |

Le magasin de documents est celui de l'hôte : en mémoire par défaut, l'atelier de la tâche dans l'usine (`workspace`), un seau à distance. La signature de `document_build` : `inputs: { spec }`, `outputs: { document: "spikypanda" }`, `capabilities: ["compose", "graph"]`.

`session_run` est le bac à sable, borné par le budget `twinPoints` du rôle. Ce n'est pas `twin.evaluate` : `twin.evaluate` (section 2 de `auto-adaptation.fr.md`) est appelé par la station, sur proposition, et son rapport est le seul qui compte. Ce que le slot `twin` de l'habitat ajoute par-dessus (`time_to_critical`, `sweep`, `evaluate`, `report`) reste à lui : ce sont des questions de cabine, pas du runtime.

### 3.5 `model` (le sujet `onnx`)

| outil | entrée | sortie |
|---|---|---|
| `model.fit { dataset: { file, columns: { input: [..], output } }, family, domain?, name }` | la télémétrie de l'atelier (JSON ou CSV), la famille (`affine-residual` aujourd'hui), le domaine d'ajustement | le rapport du job `fit` existant : `{ onnx: { path, sha256 }, contract: { path, sha256 }, quality: { rows, kept, rmse, worstCaseError }, parity: { maxAbsError, ok }, wallMs }` |
| `onnx.inspect { path }` | un fichier ONNX de l'atelier | `{ inputs: [{ name, shape, type }], outputs, ops: { name: count }, bytes, sha256 }` |
| `onnx.contract { path, contract }` | le modèle et son contrat | `{ ok, problems }` : `sha256`, `expectInputShape`, `expectOutputCount`, `expectOutputShape`, seuils : le vocabulaire de `loadModelValidated` sur la carte et de `spk.onnx:model` dans le jumeau ; refus sinon |

Signature de `model.fit` : `inputs` = les colonnes avec leurs unités (lues dans le contrat de la tâche), `outputs: { model: "onnx", contract: "json" }`, `capabilities: ["identification", "onnx"]`.

### 3.6 `station.propose`

| entrée | sortie |
|---|---|
| `{ taskId, artifacts: [{ kind: "graph" \| "model" \| "twin", path, sha256, contractSha256? }], manifestSha256, claims: { requiredOutputs, sandbox: { residual, wallMs } } }` | `{ proposalId, status: "received" }` ; puis la station demande `twin.evaluate`, écrit le journal, et la tâche lit son statut (`accepted`, `rejected` + `reportId`) |

À distance, la même charge est écrite dans `proposal.json` ; le slot `factory` de l'habitat la transmet telle quelle.

### 3.7 `factory` (la façade)

| outil ou ressource | rôle |
|---|---|
| `factory.request { objective, observations, data, constraints?, topics?: ["graph", "onnx"] \| "auto", budget? }` | crée la tâche (le fichier de tâche de la section 5), ouvre l'atelier, lance le runner (local : en processus ; à distance : `nebius ai job create`) ; rend `{ taskId }` |
| `factory.task { taskId }` | `{ state, iteration, lastCall, artifacts, proposalId?, verdict? }` |
| `factory://tasks`, `factory://tasks/{id}` | la liste ; le manifeste, la trace, les artefacts (sha256) d'une tâche |

Les outils actuels du stub (`run_sweep`, `run_fit`, `run_evaluate`, `job_status`, `get_artifact`) disparaissent : `run_fit` devient `model.fit`, `run_evaluate` n'appartient plus à l'usine, `run_sweep` reste un job de T0 en ligne de commande.

## 4. Le format des signatures

```ts
/** What a node type (or a tool) can do, for a planner: declared by the plugin, cost written by the bench. */
export interface Signature {
    purpose: string;                                   // one sentence, in English, for the model
    inputs: Record<string, SignaturePort>;             // by port name
    outputs: Record<string, SignaturePort>;
    capabilities: string[];                            // tags: "prediction", "air_quality", "identification", ...
    cost?: { latencyUs?: number; memoryKb?: number; measuredBy: string; at: string; sha256: string };  // never typed by hand
}
export interface SignaturePort {
    quantity: string;   // IUnitExpectation.quantity of the port
    unit?: string;      // IUnitExpectation.unit, UCUM key
    description?: string;
}
```

Où : un champ `signature` sur le descripteur de type de nœud (core, `IDeclaresPorts` étendu), rempli par les plugins pour les types que le scénario utilise (`Physics.Scene:atmosphere`, `atmosphere-gate`, les nœuds de life-support, `spk.onnx:model`, les nœuds de contrat de `plugin-ml`, `Logic.Time:replay`) ; les unités sont recopiées des ports, jamais retapées (un test échoue si une signature contredit un port). Le coût vient du banc (la certification du solveur, les runs de `session_run`) qui écrit `measuredBy`, `at`, et le sha256 du run. Un outil d'atelier porte la même structure.

## 5. La tâche et le plan

**La tâche** (`factory.request` la crée ; à distance c'est le fichier de spécification que `spikypanda-job` reçoit, `job: "build"`) :

```json
{
    "version": 1,
    "job": "build",
    "task": {
        "id": "t-2026-09-21-0001",
        "topics": "auto",
        "objective": {
            "required_outputs": [{ "name": "predicted_co2", "quantity": "Concentration", "unit": "ppm", "horizonMinutes": 20 }],
            "constraints": { "residualPpmMax": 150, "windowMinutes": 20 }
        },
        "observations": { "volumes": 2, "door": "open", "occupancy": { "lab": 6, "habitatB": 0 }, "scrubbers": [{ "id": 1, "speedPercent": 60 }, { "id": 2, "speedPercent": 60, "currentAmps": 1.9 }] },
        "data": [{ "file": "telemetry.jsonl", "columns": ["t", "co2_lab", "co2_b", "door", "scrubber2_current", "scrubber2_speed"], "sha256": "..." }],
        "budget": { "iterations": 20, "minutes": 30, "twinPoints": 40 }
    },
    "profile": "profiles/nvidia-nebius.json"
}
```

**Le plan** (la première production du modèle, vérifiée par la garde avant toute construction) :

```json
{
    "selected_nodes": ["Physics.Scene:atmosphere", "Physics.Scene:atmosphere-gate", "Physics.Lifesupport:scrubber", "Physics.Lifesupport:crew"],
    "missing_capabilities": [
        { "required_output": "scrubber_2_efficiency", "quantity": "Ratio", "unit": "1", "reason": "no node produces the real efficiency of a degraded scrubber; the nominal one is a constant", "topic": "onnx" }
    ]
}
```

Règles de la garde sur le plan : chaque `selected_nodes` existe dans le registre (`registry.describe`) ; chaque sortie requise est produite par un nœud sélectionné (signature) ou figure dans `missing_capabilities` ; chaque manque a une raison non vide et un sujet connu ; aucun champ inconnu. Un plan refusé revient au modèle avec les problèmes, et compte une itération.

**Le manifeste** (`manifest.json` dans l'atelier, écrit à la fin, sha256 dans la proposition) : la tâche (sha256), le profil (sha256), le prompt (sha256), les outils avec leurs signatures (sha256 de la liste), la recette rejouée ou non, chaque itération (proposition, appel, résultat résumé, jetons, ms), les artefacts (chemin, sha256, contrat), le résultat du bac à sable, la proposition (id), puis le verdict quand il revient.

## 6. Le harnais générique : `harness/core`

Ce qu'il réutilise tel quel : `@spiky-panda/harness` (la boucle, `PolicyGraph`, `CapabilityRegistry`, la plasticité, les recettes comme décisions apprises), le builder de graphe pour le document du studio, `slots/lib/slot-server.ts` pour les slots d'atelier, `slots/lib/local-broker.ts` pour le broker du conteneur.

Ce qui est propre à l'usine (nouveau) :

| pièce | rôle |
|---|---|
| `harness/core/workspace-observer.ts` | l'état observé : les fichiers de l'atelier (liste, sha256), le dernier résultat d'outil, l'itération ; `State.id` = signature de tâche + phase (`plan`, `build`, `validate`, `done`) |
| `harness/core/builder-guard.ts` | la garde de la section 1 du plan : chemins sous l'atelier, outils du sujet, budgets, plan conforme |
| `harness/core/task-evaluator.ts` | l'étape 11 : à DONE, le validateur du sujet ; sinon, l'itération a-t-elle avancé (un artefact de plus, un problème de moins) |
| `harness/core/recipes.ts` | la signature de tâche (sujet, sorties requises, contraintes) et le rejeu |
| `harness/core/manifest.ts` | le manifeste de la section 5 |
| `harness/core/runner.ts` | une tâche de bout en bout, local ou conteneur, jusqu'à la proposition |
| `harness/topics/<sujet>/{tools.ts, prompt.md, validator.ts, signatures.json}` | ce qui spécialise |
| `harness/scripted/<sujet>.ts` | un constructeur scripté par sujet : la tâche de la démo tourne sans modèle |
| `harness/prompts/FACTORY_PROMPT.md` | le prompt commun : constructeur, plan d'abord, un outil par étape, DONE quand le contrat est tenu, jamais de chiffre inventé |

**Duplication temporaire avec `tier3/`, à noter et à résorber.** Le Tier 3 a déjà, sous `tier3/`, ce dont l'usine a besoin : le client du broker (`lib/broker.ts`, `lib/mcp-http.ts`), l'enregistrement des outils du broker comme capacités (`lib/capabilities.ts`), la construction de l'agent (`agent.ts`), les adaptateurs de modèles (`providers/anthropic.ts`, `openai-compatible.ts`, `llm-common.ts`, `reasoner.ts`, `compose.ts`) et le constructeur scripté (`providers/scripted.ts`). Règle pour F3 et F4 :

- `harness/core` **importe** de `tier3/lib` et `tier3/providers` tout ce qui est déjà générique : `broker.ts`, `mcp-http.ts`, les adaptateurs de modèles, `llm-common.ts`, `compose.ts` ; aucune copie ;
- ce qui est lié à la cabine dans `tier3` est **dupliqué puis généralisé**, avec en tête de fichier la mention `// duplicated from tier3/<file> on <date>; to merge into harness/core when harness/ is extracted` : `capabilities.ts` (les listes `EXCLUDED`, `APPROVAL_REQUIRED`, `PROTECTED_NEVER` sont celles de la cabine ; l'usine a les siennes : une seule fonction paramétrée par un profil de capacités), `agent.ts` (`createAgent` prend un observateur, un évaluateur, une garde : les trois de l'usine), `providers/scripted.ts` (un script par sujet, même mécanique), et la partie de `browser/agent-page.ts` qui pilote le document du studio (la file de repères, les cartes) ;
- à l'extraction vers le dépôt harness, `tier3/` importera à son tour le noyau commun (`agent-kit`) et les copies disparaissent. La liste des fichiers dupliqués et leur date sont tenues dans `harness/README.md`, section « Duplication », et un test grep vérifie que chaque copie porte sa mention.

## 7. Le conteneur et la ligne de commande

`spikypanda-job` apprend un job : `build`. Sur ce job, le runner :

1. lit la tâche et le profil (`tier3.wire`, `tier3.model`, `apiKey.env` : la clé est dans l'environnement du job, jamais dans le fichier) ;
2. démarre le broker du conteneur (`startBroker`, `127.0.0.1`, port libre), publie les slots d'atelier (`workspace`, `model`) et le runtime (`RuntimeBehavior` de `@spiky-panda/mcp` sur le registre des plugins et l'atelier comme magasin de documents : le catalogue, les documents, les sessions ; le jumeau embarqué est un document du magasin), sous le rôle `factory` ;
3. lance `harness/core/runner` sur la tâche ;
4. écrit l'atelier, `manifest.json` et `proposal.json` sous `WORKSHOP_DIR/<taskId>/` (le runner a fait pointer `WORKSHOP_DIR` sur le répertoire de sortie de la plateforme ; c'est le seul endroit où le nom de la plateforme apparaît) ;
5. sort avec les codes du runner (0 terminé, 1 échoué, 2 spécification invalide).

L'image (`docker/Dockerfile`) ajoute le bundle du harnais, les plugins du substrat (le registre), le document du jumeau et les prompts ; elle n'ajoute aucune clé. Le slot `factory` de l'habitat, en mode distant, crée le job, suit `job_status`, relit `proposal.json` à la fin et appelle `station.propose` avec.

Un test de F7 : le job `build` tourne dans le conteneur avec le constructeur scripté du sujet `onnx` (sans modèle, sans réseau) et produit `proposal.json` avec un modèle et son contrat ; c'est ce que l'intégration continue vérifie.

## 8. Ce qui se voit

Le document `graphs/factory-agent.spikypanda` : les mêmes douze étapes, les outils d'atelier comme capacités, une tuile `Run monitor`. Le Control Board le montre au centre pendant qu'une tâche tourne (l'agent en vignette) ; la station dit, en une phrase par étape lue dans la trace : « The factory plans on 14 node types. », « Missing: the real efficiency of scrubber 2. », « Model fitted on 72 hours of telemetry, worst error 3 percent. », « Graph v2 built: 9 nodes. », « Sandbox run: residual 40 ppm over 20 minutes. », « Proposed to the station. », puis, de la station : « Judged by the twin: accepted, report a1b2c3. » Chaque chiffre vient du manifeste.

## 9. Tests et critères d'acceptation

1. Chaque outil d'atelier : un test de contrat (entrée valide, entrée refusée avec le texte du refus, sortie conforme, sha256 présents), à travers le broker.
2. La garde : un chemin hors atelier refusé ; un outil hors sujet refusé ; un plan non conforme renvoyé avec ses problèmes ; le budget d'itérations atteint termine la tâche en échec, dit tel quel.
3. Les signatures : chaque type du scénario en a une ; ses unités sont celles des ports (test de cohérence) ; `registry.search` rend `atmosphere-gate` pour une sortie « Concentration, ppm » avec la capacité `exchange`.
4. Le constructeur scripté `onnx` puis `graph` : la tâche de la démo de bout en bout sans modèle, jusqu'à `station.propose`, en local et dans le conteneur.
5. Avec le modèle (Haiku d'abord, Nemotron ensuite) : la même tâche ; le plan produit est conforme ; le manifeste nomme tous les sha256 ; le scorecard de l'usine (itérations, jetons, temps, artefacts, verdict) est lu dans le manifeste.
6. La séparation des rôles : un appel de `tier3` à `document_build` est refusé par le broker (dépend de l'autorisation activée).
7. La duplication : chaque fichier copié de `tier3` porte sa mention ; la liste de `harness/README.md` est à jour.

## 10. Hors périmètre de F1 à F7

Le sujet `code` (écrire un nœud) et la 3D ; le service Python ; la propagation (étape G de `auto-adaptation.fr.md`) ; l'extraction vers le dépôt harness.
