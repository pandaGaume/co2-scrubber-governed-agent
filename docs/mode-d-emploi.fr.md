# Mode d'emploi : ce qui fonctionne, et comment s'en servir

*Écrit le 24 septembre 2026, branche `commissioning-core`. Ce document ne
décrit que ce qui tourne aujourd'hui, avec la commande qui le fait tourner
et la preuve (un test, un passage réel). Ce qui n'existe pas est dit à la
fin.*

---

## 1. Installer, construire, tester

```bash
npm install
npm run build          # tsc, puis la page de l'agent
npm test               # 114 tests, sans clé et sans réseau
```

Les clés vont dans `.env` (copie de `.env.example`, jamais dans le dépôt) :
`ANTHROPIC_API_KEY` pour le profil par défaut ; `NEBIUS_API_KEY` pour
`profiles/nvidia-nebius.json` (l'identifiant du modèle Nemotron est encore
à remplir dans ce profil) ; `ELEVENLABS_API_KEY` pour la voix. Le modèle du
raisonneur se choisit par `REASONER_PROFILE=profiles/<nom>.json`.

## 2. Les slots, le broker, les pages

```bash
npm run server         # le broker et tous les slots, http://localhost:3001/
npm run slots          # les slots seuls, contre un broker déjà lancé
```

Les slots publiés : `scrubber` (la carte, ou son simulateur), `twin` (le
jumeau de la cabine et le runtime : catalogue, documents, bacs à sable),
`station` (Mother : registre, mises en service, journal), `factory`,
`reasoner`, `agent`, `scenario`, `qr`, `speech`, `biomed`, `workspace`,
`model`, `library`, `observer`, `screens`. Sans clé, `reasoner` et
`observer` répondent qu'aucun modèle n'est prêt au lieu de répondre à sa
place.

## 3. La bibliothèque

`docs/library/*.md` : ce que le modèle lit avec `library.list`,
`library.search`, `library.read`, `library.methods` (les fiches de méthode
portent une ligne `**Measures:**`). Ajouter un document = déposer un `.md`
avec un titre, un premier paragraphe de résumé, et ses sources.

Les graphes de référence y sont aussi (`library.graphs`, `library.graph`),
depuis `graphs/` : un document `.spikypanda`, son gabarit
`.template.json` (le graphe en formules sur des variables, ses réglages,
ses sondes) et sa grammaire `<id>.grammars/<famille>/<langue>.json` dans
la forme mcp-core (le graphe décrit comme un serveur, son instanciation
comme un outil dont les propriétés sont les variables, ses sondes comme
des ressources). Un graphe sans grammaire est signalé au démarrage. Le
harnais en instancie un sur le jumeau avec `graph.evaluate {graph, persons ou
settings, variables, fit}` (`plugin-habitat.fr.md`, section 5) ; les nombres
de l'épurateur viennent de l'appareil enregistré quand la tâche porte le
registre (`observations.devices`), qui est à bord de `observations.persons`.
Le slot `twin` fait tourner le même graphe sur une question : `twin.habitat_run
{persons, devices, variables, flowPercent ou stopMinutes, horizonMinutes}`,
pour ajouter ou changer la présence et l'activité de l'équipage après coup. Y sont
aujourd'hui : la physique du CO2 et des épurateurs, la méthode de
décroissance (ASTM E741), la méthode du graphe de jumeau, la fiche
technique de l'épurateur, la topologie et les métriques de la station, les
valeurs, limites et protocoles d'essai de la NASA.

## 4. La mise en service, de bout en bout

```bash
npm run example:commissioning
```

Neuf boucles sur le vrai modèle, un journal par passage dans
`outputs/examples/<horodatage>/journal.md` (et `journal.json`,
`telemetry.json`). Environ 10 minutes et 1,3 dollar avec Claude Haiku 4.5.
Ce qui s'y passe, et ce que chaque pièce fait :

| boucle | pièce | ce qui tourne | preuve |
|---|---|---|---|
| 1 | le registre de Mother | cinq appareils inscrits ; la règle écrite : un appareil qui agit sans simulateur qualifié ouvre une mise en service | `tests/commissioning.test.ts` |
| 2 | l'usine de protocoles (sujet `procedure`) | le modèle lit l'inventaire, la bibliothèque, la présence, et écrit le protocole ; la garde vérifie bornes, durée, arrêts, prédictions, plancher, diligence d'occupation, surveillance | accepté à chaque passage réel, 12 à 21 décisions, 1 refus en général |
| 3, 4 | le relais et l'autorisation | Mother recontrôle, demande au commandant ; la surveillance médicale s'ouvre | tests |
| 5 | l'exécution (`tier3/procedure.ts`) | une commande par pas, les conditions d'arrêt relues chaque minute | tests |
| 6 | le compte rendu | le volume apparent par la décroissance, dit apparent | tests |
| 7 | l'Observateur | de la description et d'un résumé de télémétrie, la demande de jumeau ; garde : forme, séparation du catalogue, faits, vocabulaire, provenance des constantes connues (avec leur bande) | `tests/observer.test.ts` |
| 8 | l'usine de graphes (sujet `graph`) | le modèle écrit la structure, le code ajuste les inconnues dans leurs bornes (Nelder-Mead ou grille), mesure le résidu, contrôle la pente initiale, refuse ce que le runtime avalerait de travers, compare au jumeau existant | `tests/graph.test.ts` ; 9e passage réel : premier candidat accepté à 12,6 ppm |
| 9 | la proposition | le candidat accepté part vers la station | tests |

Les passages réels sont documentés dans `exemple-mise-en-service.fr.md`,
`exemple-mise-en-service-2.fr.md`, `nasa-protocoles-et-conclusions.fr.md`
(passages 3 à 7) et `graphe-de-reference.fr.md` (8 et 9).

## 5. Une tâche d'usine à la main

Par le broker, outil `factory.request` :

- `objective.required_outputs` (nom, grandeur, unité) et
  `objective.constraints` ; `data` (fichiers, lignes de télémétrie) ;
  `budget` (`iterations`, `minutes`, `twinPoints`) ;
- `topics` : `["procedure"]`, `["graph"]`, `["onnx"]`, ou `"auto"` (une
  tâche qui porte des `requirements` d'Observateur va à `graph`, sinon
  `onnx`) ;
- `builder` : `"reasoner"` (le modèle, par défaut quand le sujet a un
  prompt) ou `"scripted"` (les scripts des tests, sans clé).

`factory.inventory` lit le registre de Mother à travers le broker.
L'atelier d'une tâche est dans `outputs/factory/<taskId>/` : `task.json`,
`plan.json`, `trace.jsonl` (chaque décision, avec ce que le modèle a vu),
`candidates.json` pour un graphe, `manifest.json`.

## 6. Le jumeau de la cabine, et la référence de l'habitat

```bash
npm run twin:build      # graphs/cabin.spikypanda depuis specs/cabin-parameters.json
npm run twin:parity     # le document contre les équations du sample
npm run habitat:build   # graphs/habitat.spikypanda depuis specs/habitat-parameters.json
```

Le premier est le jumeau qu'interroge l'agent de la nuit 9. Le second est
la référence physique de la base construite le 24 septembre et reprise le
25 (`plugin-habitat.fr.md`) : les atmosphères, les deux portes (la
ventilation en mode `exchange`, le sas fermé), la poussière et les capteurs
sont les nœuds du substrat ; le plugin `plugins/habitat` ajoute les
personnes par leur nom (le roster de `biomed`, chacune à son activité,
branchées sur l'équipage de leur module, dont la réserve d'entrées grandit
à mesure), l'équipage, l'épurateur en masse, le ventilateur et le filtre
encrassé ; 12 tests sur lui. Le script écrit aussi le gabarit du graphe
pour la bibliothèque et vérifie sa grammaire. Il faut le substrat corrigé
le 25 septembre (`core` 1.0.3, `plugin-physics` 0.1.2, `factory` 0.1.3,
dans `vendor/`) : avec les versions d'avant, `npm run habitat:build` ne
rend pas la main, ou le jumeau refuse `person_1`.

## 7. Lire un journal, diagnostiquer un échec

- `journal.md` d'un passage : par boucle, qui agit, le but, les outils et
  leur nombre, les décisions avec leur issue, les refus, ce que Mother a dit,
  la sortie.
- Un candidat de l'usine de graphes : `candidates.json` donne ses variables
  ajustées, son résidu, la pente initiale, ce qui entre dans le nœud comparé,
  sa structure comparée au jumeau existant.
- `trace.jsonl` : la décision complète, l'état que le modèle a vu (le brief
  en premier), le prompt envoyé (le prompt système, toute la conversation,
  les outils et leurs descriptions) et la réponse brute du modèle.
- `npm run trace -- outputs/factory/<tâche>` en fait un `trace.md` lisible :
  une section par pas (le nœud du harnais, l'appel avec son entrée et sa
  sortie, ce qui a été ajouté à la conversation du modèle depuis l'appel
  précédent, sa réponse brute) ; l'exemple l'écrit lui-même sous
  `outputs/examples/<horodatage>/trace/`, l'Observateur compris.

## 8. Ce qui n'existe pas

- **Le sujet `code`** : aucune usine n'écrit de nœud. Quand un plan déclare
  une capacité manquante, seuls `graph`, `onnx` et `procedure` sont des
  sujets valides, et rien ne consomme la déclaration. Les nœuds de
  l'habitat ont été écrits à la main ; `journal-noeuds-habitat.fr.md` dit
  ce qu'une usine de code aurait à faire.
- L'exemple tire encore sa télémétrie du monde de test en TypeScript
  (la référence de l'habitat est celle de l'usine de graphes depuis le 25
  septembre, par la bibliothèque).
- Nemotron sur Nebius n'a pas été essayé ; la recherche sur le web n'est
  pas branchée ; le conteneur de l'usine n'a pas le plugin local.
- La page du jumeau (l'agent de la nuit 9 dans le studio) tourne sur le
  graphe de la cabine, pas sur l'habitat ; l'habitat s'ouvre à part, pour
  l'inspecter : `?mcp=0&ext=/agent/habitat.js` (`plugin-habitat.fr.md`,
  section 3).
