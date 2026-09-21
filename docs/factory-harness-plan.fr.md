# Plan : l'usine comme harnais générique, augmenté par ses outils, spécialisé par sujet

*Plan du 21 septembre 2026, à valider avant la spécification, qui vient avant le code. Il détaille et remplace l'étape E (« l'usine comme harnais ») de `auto-adaptation.fr.md`, section 9, et s'appuie sur la définition de l'usine donnée par Guillaume le 20 septembre : un agent constructeur, pas un générateur ; ce qui manque à un autre tier déclenche sa fabrication ; rien de ce qu'elle produit n'est de confiance avant le jugement du jumeau.*

## 0. L'idée en une phrase

Un seul harnais, celui de la démo (la boucle des douze étapes de `@spiky-panda/harness`), dont les capacités sont les outils de construction publiés sur le broker ; ce qui le spécialise (ONNX, graphe, code, 3D) n'est pas une autre boucle mais un autre jeu d'outils, un autre prompt, un autre validateur et un autre vocabulaire de signatures. Le vrai travail n'est pas la boucle, ce sont les outils, et ce qu'ils disent d'eux-mêmes.

## 1. La boucle du constructeur, sur les douze étapes existantes

Le schéma de Guillaume (TASK, CONTEXT BUILDER, LLM REASON, TOOL DISPATCH, READ / WRITE / EXEC, TOOL RESULT, DONE, VALIDATE, PUBLISH) se pose sur la boucle du harnais V1 sans en changer une étape :

| étape du harnais | dans l'usine |
|---|---|
| 1 observe | l'état de l'atelier de la tâche : les fichiers présents, les artefacts déjà produits, le dernier résultat d'outil |
| 2 context | la tâche (le contrat fonctionnel reçu : objectif, observations, données disponibles, contraintes) et l'état de l'atelier |
| 3 lookup | une **recette apprise** : la suite d'appels qui a réussi pour la même signature de tâche (sujet, sorties requises, contraintes) ; une demande identique se rejoue sans le modèle, comme au Tier 3 |
| 4 gate | recette de confiance ou pas |
| 5 request | la tâche, l'atelier, les outils du sujet avec leurs signatures |
| 6 reason | le modèle (Nemotron dans la démo) propose **un** appel d'outil, ou dit DONE (une réponse sans appel) |
| 7 merge | une proposition |
| 8 guard | la garde du constructeur : écrire seulement sous l'atelier de la tâche ; exécuter seulement les outils du sujet ; budget d'itérations (20), de jetons, de temps ; un plan JSON conforme au schéma avant toute construction |
| 9 execute | l'appel, par le broker, sous la politique (rôle `factory`) : READ, WRITE, EXEC sont des outils des slots d'atelier |
| 10 observe-after | le résultat de l'outil, remis au contexte |
| 11 evaluate | à DONE : le **validateur du sujet** (le contrat est-il tenu ? pour un modèle : le rapport de `twin.evaluate` est-il positif ?) ; un échec renvoie le rapport au modèle (retour à 6), jusqu'au budget |
| 12 record | la recette, si la validation a réussi ; le manifeste de la tâche |

PUBLISH n'est pas un enregistrement : l'usine propose à la station (`station.propose`), avec l'identifiant du rapport du jumeau ; la station vérifie, enregistre, et l'opérateur approuve (chaîne de confiance de `auto-adaptation.fr.md`, section 1). L'usine n'a jamais le droit d'enregistrer ni de parler à la carte.

Le manifeste d'une tâche : sha256 de la tâche, du prompt, de la liste des outils (chacun avec sa signature), chaque appel avec son résultat, les artefacts produits avec leur sha256, l'identifiant du rapport de jugement, les jetons et le temps. Tout chiffre montré vient de là.

## 2. Les outils : chacun avec une signature, pas seulement une description

Un outil de l'usine est un outil d'un slot du broker, avec ce qu'un outil MCP a déjà (nom, description, schéma d'entrée) et ce que le planificateur a besoin en plus : une **signature sémantique** :

```json
{
    "purpose": "estimate the scrubber's real removal efficiency from its telemetry",
    "inputs":  { "current_amps": "A", "speed_percent": "%", "hours_run": "h" },
    "outputs": { "efficiency": "1" },
    "capabilities": ["identification", "scrubber", "onnx"],
    "cost": { "latency_ms": 480, "memory_kb": 24 },
    "rights": "factory"
}
```

Les unités sont celles du substrat : les ports des nœuds déclarent déjà leur grandeur et leur unité (`IUnitExpectation`, `docs/architecture/unit-tag-convention.md` dans spikypanda) ; la signature les reprend, elle ne les invente pas. Le coût n'est pas tapé : il est mesuré par le banc (la certification du solveur, les runs du jumeau) et écrit par lui, avec sa source (règle des paramètres auditables).

**Les outils communs à tous les sujets** (`harness/tools/`) :

| outil | rôle |
|---|---|
| `workspace.list / read / write` | l'atelier de la tâche, et rien au-dessus |
| `spikypanda.registry_search { requiredOutputs, capabilities }` (le serveur MCP du studio, dans le substrat ; pas un slot de plus : le broker a déjà son registre des services) | les types de nœuds dont la signature produit ce qui est demandé, avec leur signature complète : c'est l'espace sur lequel le modèle planifie |
| `graph.validate` | les types existent, les ports se raccordent, les unités s'accordent |
| `station.propose` | la proposition, avec l'identifiant du rapport ; jamais `register` |

**Les outils par sujet** (`harness/topics/<sujet>/`) :

| sujet | outils | validateur | pour le 30 octobre |
|---|---|---|---|
| `graph` | `graph.build` (une spécification déclarative de nœuds et de connexions, construite par le builder de documents, jamais du JSON écrit à la main), `twin.instantiate`, `twin.run` (le bac à sable : une journée en 8 ms) | `graph.validate` puis un run sans erreur | oui |
| `onnx` | `model.fit` (le job existant : télémétrie, famille de modèle, sortie ONNX + contrat + erreur mesurée), `onnx.inspect` (opérations, formes), `onnx.contract` (le vocabulaire du contrat, le même que `loadModelValidated` sur la carte) | le jugement par le jumeau (`twin.evaluate`, un run à part, rapport identifié) | oui |
| `code` | `code.write`, `code.test` dans un bac à sable | les tests passent, le contrat est tenu | non (Datacraft) |
| `3d` | à définir | | non |

Le service Python du schéma est un slot de plus, plus tard, pour entraîner de plus gros modèles sur Nebius ; le `fit` d'aujourd'hui est en TypeScript et suffit au scénario.

## 3. Le planificateur : du choix de texte au choix de capacités

Avant de construire, le modèle planifie sur l'espace des signatures. Sa première action obligée est `spikypanda.registry_search` avec les sorties que le contrat exige ; sa sortie est un plan JSON, validé par la garde contre un schéma avant que quoi que ce soit soit construit :

```json
{
    "selected_nodes": ["Physics.Scene:atmosphere", "Physics.Scene:atmosphere-gate", "Physics.Lifesupport:scrubber", "Physics.Lifesupport:crew"],
    "missing_capabilities": [
        { "required_output": "scrubber_2_efficiency", "unit": "1", "reason": "no node produces the real efficiency of a degraded scrubber; the nominal one is a constant" }
    ]
}
```

Chaque capacité manquante devient une sous-tâche du sujet qui sait la produire (`onnx` pour un modèle, `code` pour un nœud), avec le même harnais. Quand la sous-tâche a produit et fait juger son artefact, le registre le connaît, et le planificateur repasse : s'il ne manque plus rien, `graph.build`, le bac à sable, le jugement, la proposition. C'est la boucle : objectif, planificateur, sélection, validation du graphe, capacité manquante, usine, nouvel artefact, registre, replanification.

Dans la démo, le planificateur trouve que la porte existe (`atmosphere-gate`) : ce qui manquait à v1 était une topologie, pas un type de nœud ; et il déclare une seule capacité manquante, le rendement réel du scrubber 2, produite par `model.fit`. La démo exerce donc « composer et ajuster » ; « écrire un nœud nouveau » est le sujet `code`, hors périmètre du 30 octobre, et on le dit.

## 4. Où ça se range

À la racine du dépôt de la démo, un dossier `harness/` :

```
harness/
  README.md              le rôle, la boucle, les droits, le manifeste
  core/                  le constructeur générique : la boucle (celle de @spiky-panda/harness), la garde, les recettes, le manifeste, le runner local
  tools/                 les outils communs, publiés comme slots du broker (workspace, graph.validate, propose ; le catalogue est le serveur MCP du studio)
  topics/
    graph/               outils, prompt, validateur, vocabulaire des signatures
    onnx/
    code/                plus tard
    3d/                  plus tard
  prompts/               FACTORY_PROMPT et un prompt par sujet
  scripted/              un constructeur scripté par sujet : la boucle tourne sans modèle, pour les tests et les répétitions
```

Le slot `factory` devient la façade : `factory.request` (le contrat fonctionnel de l'agent) choisit le ou les sujets d'après l'objectif, ouvre un atelier, lance le harnais (runner local d'abord, Nebius Serverless Job ensuite, derrière le profil), et expose la tâche (`factory://tasks/<id>` : le manifeste, la trace, les artefacts). Un second document du studio, `graphs/factory-agent.spikypanda` (les mêmes douze étapes, les capacités de l'usine), s'affiche au centre du Control Board pendant que l'usine travaille ; la voix de la station dit ses étapes en phrases courtes (« ce qui manque : le rendement du scrubber 2 », « modèle ajusté, erreur 3 pour cent », « jugé par le jumeau : accepté »).

Quand ce dossier est stable, il part dans `Gaume/spikypanda-harness` comme paquet (`@spiky-panda/harness-factory`), comme mcp-core a été extrait de la démo ; il est construit ici parce que c'est ici qu'il est éprouvé.

## 5. Les signatures dans le substrat

Ce que le substrat a : les ports déclarent grandeur et unité ; chaque nœud a sa documentation avec sa thèse physique. Ce qui manque, au niveau du **type** de nœud (ce qu'un nœud sait faire, avant qu'on l'instancie) : `purpose`, `capabilities`, `cost` mesuré, et un outil pour chercher là-dedans. Le plan :

- un champ `signature` sur le descripteur de type de nœud (core), rempli par les plugins pour les nœuds que le scénario utilise (les deux atmosphères, la porte, le scrubber, l'équipage, le nœud ONNX, les nœuds de contrat) ; les unités viennent des ports ;
- le coût écrit par le banc, pas par l'auteur du nœud ;
- `registry_search` sur le serveur MCP du studio (`@spiky-panda/mcp`), publiable aussi depuis Node pour le conteneur ;
- le coût par instance (latence mesurée dans les runs du jumeau) ajouté au manifeste des runs, pas à la signature du type.

## 6. Ordre de construction et estimation

| étape | contenu | jours |
|---|---|---|
| F1 | la spécification (ce plan validé, puis : le contrat de chaque outil avec sa signature, le schéma du plan, le format des signatures, les droits du rôle `factory`) | 0,5 |
| F2 | les signatures dans le substrat et `registry_search` sur le serveur MCP du studio | 1,5 |
| F3 | les outils communs et les outils des sujets `graph` et `onnx`, publiés comme slots, sous le rôle `factory` (refusés à `tier3`) | 2 |
| F4 | `harness/core` : la boucle réutilisée, la garde du constructeur, les recettes, le manifeste, le runner local, le constructeur scripté | 1,5 |
| F5 | le planificateur, les prompts, les validateurs des deux sujets | 1 |
| F6 | la tâche de la démo de bout en bout : demande, plan, ajustement, graphe v2, bac à sable, jugement, proposition ; le document du studio ; le centre du Control Board ; les phrases de la station | 1,5 |
| F7 | le runner Nebius (le même harnais dans un job, le broker joignable ou l'atelier rapporté à la station) | 1 |

Neuf jours, contre les deux de l'étape E telle qu'estimée le 20 septembre : cette estimation-là était celle d'une usine mince (l'enchaînement ajustement, graphe, jugement câblé en dur). Le choix est à faire, et c'est le tien : l'usine mince pour le 30 octobre et le harnais générique pour Datacraft, ou le harnais générique dès maintenant en cédant ailleurs (les seize jours de `ui-brief.fr.md`, section 12, n'ont pas de marge). Mon avis : le harnais générique avec les seuls sujets `graph` et `onnx`, parce que c'est lui que le jury doit voir (une boucle, des outils, un plan lisible), et céder F7 (Nebius) si le temps manque, en le disant.

## 7. Décisions à prendre

1. **Un seul broker avec des rôles** (`factory` voit les outils d'atelier, `tier3` non) en local ; **à distance, un broker propre à l'usine dans son conteneur** (image `co2-scrubber-factory`, lancée par `spikypanda-job` sur une tâche, pour Nebius), sans accès au broker de l'habitat, et la station comme seul point de contact (validé le 21 septembre ; détail dans `factory-harness.fr.md`, section 1). Dépendance : l'autorisation du broker doit être réellement activée (aujourd'hui, `docs/STATUS.md` : « policy deny waits for the broker's authorization »).
2. **Le dossier `harness/` dans le dépôt de la démo**, extraction vers le dépôt harness quand c'est stable.
3. **Le périmètre du 30 octobre** : composer et ajuster (`graph`, `onnx`) ; écrire un nœud (`code`) et la 3D après.
4. **Le modèle de l'usine** : le même slot `reasoner`, avec un rôle `factory` qui choisit `FACTORY_PROMPT` (une conversation par tâche, comme une conversation par événement au Tier 3).
5. **Les signatures** : au niveau du type, déclarées par les plugins, unités des ports, coût mesuré ; le coût d'instance dans les manifestes des runs.

## 8. Risques

Le coût d'une tâche (vingt itérations de modèle) : borné par la garde, écrit dans le manifeste. Une recette rejouée qui ne convient plus : l'évaluation l'invalide et le modèle est rappelé, comme au Tier 3. Le modèle qui construit n'importe quoi : le jumeau juge, la station refuse sans rapport, et le plan JSON est vérifié avant toute construction. Le temps : neuf jours qui ne sont pas dans les seize.
