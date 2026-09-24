# Journal : les nœuds de l'habitat, écrits à la main, pas à pas

*Commencé le 24 septembre 2026 au soir. Guillaume demande un graphe de
l'habitat de référence (atmosphères, ventilation avec ventilateur et filtre,
épurateur, équipage, scène Lune), pour que l'usine adapte ensuite les
paramètres de l'épurateur et de l'installation au lieu de tout reconstruire.
Le substrat n'a pas les nœuds qu'il faut ; il faut les écrire. Ce journal
tient la trace de chaque action et du raisonnement qui la précède, dans le
format du journal de l'usine (but, outils, sortie), pour comparer ce
travail à celui qu'une usine de code aurait à faire
(`observateur-et-usines.fr.md`, section 6).*

**Conventions.** Une étape est une décision suivie d'une action. `lecture`
est l'équivalent de `workspace.read` ou `library.read` ; `catalogue`
l'équivalent de `twin.registry_describe_node` ; `écriture` n'a pas
d'équivalent aujourd'hui (c'est ce qu'une usine de code apporterait) ;
`essai` est l'équivalent de `graph.evaluate` ou d'un test.

---

## 0. La demande, et les décisions prises avant de commencer

Demande (Guillaume, 24 septembre, 18 h) : « lets generate a new graph for
that, with HVAC and filter and gate with the atmosphere node, gravity and
fans (later with motor) -> speed, debit... then we will use this model as
physical habitat reference where we gonna adapt the scrubber parameters
instead of building it from scratch ».

Trois questions posées avant d'agir, trois réponses :

| question | réponse |
|---|---|
| où écrire les nœuds manquants | un plugin local à ce dépôt, `Physics.Habitat`, enregistré par-dessus le registre du substrat ; spikypanda n'est pas touché |
| ce que l'usine ajuste sur l'habitat de référence | l'épurateur, l'installation (volume, débit délivré), l'équipage, et les **défauts** (encrassement des filtres, problème de moteur) |
| la gravité | la scène Lune, dite sans effet sur le CO2 brassé en V1 (elle servira au filtre à poussière plus tard) |

## 1. Les étapes

| n | but | action | ce qui en sort |
|---|---|---|---|
| 1 | savoir ce que le substrat offre déjà pour une atmosphère en masse | `catalogue` : liste des types enregistrés par les plugins (grep des identifiants dans `node_modules/@spiky-panda/plugin-*/dist`) | 74 types ; ceux qui comptent : `Physics.Scene:atmosphere` (masses par espèce N2, O2, CO2, H2O, Ar, volume, température ; sorties `ppm_CO2`, `mass_CO2`, `pressure`), `Physics.Scene:atmosphere-gate` (couple deux atmosphères ; modes `closed`, `open_passive`, `hvac_forced` à débit fixe), `Physics.Scene:moon` (gravité 1,625 m/s²), `Physics.Particulate:particulate` (descripteur seulement, V1). Rien pour un ventilateur, un filtre, un épurateur ou un équipage **en masse** : `Physics.LifeSupport:*` travaillent en ppm sur un volume replié |
| 2 | comprendre comment la porte lit et écrit une atmosphère, pour faire pareil | `lecture` : `plugin-physics/src/scene/atmosphere-gate.node.ts` (420 lignes) | la porte ne câble pas de données : elle se **lie** aux deux atmosphères par des liens de configuration (`atmosphere_A_in`, `atmosphere_B_in`, type `atmosphere`) et, à chaque `fire()`, applique des deltas de masse par espèce (`applyMassDelta`), en Euler explicite sur `session.dt`, signe opposé des deux côtés (conservation native). Le débit volumique transporte `flux_i = V̇ · P · x_i · M_i / (R T)` |
| 3 | savoir comment le constructeur de session reconnaît une porte, pour que mes nœuds soient reconnus sans toucher au substrat | `lecture` : `nodeeditor/dist/graph-session-builder.js` (lignes 455 à 650) | reconnaissance par **forme** (duck-typing) : un nœud qui a `bindAtmosphereA`, `bindAtmosphereB` et `clearBindings` est traité comme une porte ; un lien de configuration de type `atmosphere` vers le slot `atmosphere_A_in` ou `atmosphere_B_in` lui passe la poignée de l'atmosphère (`getMassKg`, `getMoleFraction`, `applyMassDelta`, `pressurePa`, `temperatureK`, `volume`). Tout autre couple type/slot est ignoré en silence. **Décision** : mes nœuds qui agissent sur une atmosphère prendront cette forme exacte |
| 4 | vérifier ce que l'atmosphère expose comme état et comme réglages | `lecture` : `atmosphere-layer.node.ts` (lignes 130 à 300) | éditables `volume` (m3), `temperature_k`, `initial_atmosphere_preset` (`issCabinECLSS` : CO2 à 0,3 %, soit 3 000 ppm, préréglage du substrat) ; masses par espèce ; 100 Hz demandés mais le pas de session reste celui du document |
| 5 | savoir comment un document construit sans éditeur relie ses nœuds, avant de choisir la forme des miens | `lecture` : `core/dist/document/document.builder.js`, `document.instantiate.js` (ce que l'usine, le slot `twin` et les scripts appellent) | deux règles qui tranchent : (a) le constructeur de document ne relie que des **ports déclarés** dans les métadonnées d'enregistrement (`node "x" has no input port "y"` sinon) ; les slots dynamiques de l'atmosphère (`delta_CO2_k`, `ppm_CO2`) ne sont donc pas câblables tels quels ; (b) `instantiateDocument` crée les canaux et attache le solveur, mais **ne fait aucune liaison de configuration** : personne n'appelle `bindAtmosphereA` hors de l'éditeur. Une porte liée par configuration tourne dans le studio, pas dans le bac à sable. **Décision, qui annule l'étape 3** : le couplage passe par des **signaux** (un conduit lit `ppmA`, `ppmB` et publie deux deltas de masse en kg/s), et l'atmosphère est une sous-classe qui déclare ses quatre entrées `delta_CO2_0..3` et ses sorties `ppm_CO2`, `mass_CO2` |
| 6 | savoir ce que coûte une boucle de signaux (atmosphère → épurateur → atmosphère) | `lecture` : `core/dist/sim/rk4-adaptive.solver.js`, `_snapshotInputs` | les entrées d'intégration sont prises une fois par macro-pas, par nom de slot de destination, sur les liens de type signal (les flux sont ignorés) : la boucle coûte un retard d'un pas (6 s) sur le terme de retrait, contre des constantes de temps de 30 min ; le cabin-air du substrat l'évitait en calculant le retrait chez lui, ici l'épurateur doit connaître la concentration. Accepté, et mesuré à l'étape 11 |
| 7 | savoir comment s'enregistre un type et ce qu'une signature doit tenir | `lecture` : `graph.registry.d.ts` (`INodeMeta`), `graph.signatures.js` (`validateSignature`, `searchSignatures`) | `register(type, factory, { label, category, docPath, inputPorts, outputPorts, signature })` ; une signature nomme des ports qui existent, avec une grandeur ; les unités ne sont pas vérifiées contre une table ; la recherche classe par sorties produites, puis capacités, puis coût, puis **ordre alphabétique** du type |
| 8 | savoir avec quelle copie du core mes nœuds tournent | `lecture` : `factory/bundle/spikypanda-factory.js` (1,8 Mo, webpack) | le bundle **embarque** sa copie du core et des plugins ; le plugin local importe `@spiky-panda/core` et `@spiky-panda/plugin-physics` de `node_modules`. Deux copies des mêmes classes coexistent ; le runtime reconnaît un nœud à sa forme (`fire`, `rhs`, `stateSize`), pas par `instanceof`. Vérifié à l'étape 11 ; un `instanceof` quelque part casserait tout |
| 9 | compiler des nœuds écrits comme ceux du substrat | `décision` : `tsconfig.json` gagne `experimentalDecorators` (les `@editable`, `@cloneable` du core sont des décorateurs legacy) et `plugins/**` ; rien d'autre du dépôt n'en utilisait | compile |
| 10 | écrire les nœuds | `écriture` : `plugins/habitat/signals.ts` (lecture des entrées, publication, densité du CO2), `atmosphere.node.ts` (sous-classe : ports déclarés, 1/6 Hz au lieu de 100, `initialCo2Ppm` posé après la graine du préréglage), `crew.node.ts` (L/min par activité × densité → kg/s), `scrubber.node.ts` (débit m3/s avec retard, rendement, retrait = η·Q·ρCO2(ppm), puissance), `fan.node.ts` (point de fonctionnement courbe/réseau, montée en vitesse), `filter.node.ts` (résistance = propre × (1 + charge/charge de doublement), charge intégrée), `duct.node.ts` (flux = Q·(ρA − ρB), deltas opposés ; `hatch` = même chose avec `open`), `index.ts` (enregistrement, signatures, fiches `docs/*.md`), `lib/registry.ts` (`buildRegistry` : le registre du substrat plus le plugin, branché dans le slot `twin` et les trois scripts) | 7 types, 8 fichiers, 1 100 lignes |
| 11 | vérifier que ça tourne avant d'écrire le graphe de référence | `essai` : un script jetable construit un document de 13 nœuds et 18 liens avec `buildDocumentJson`, l'instancie, le fait tourner 60 min à 6 s | tous les types résolus, aucun lien sauté (sauf solveur → scène, qui est une liaison de configuration, comme dans le graphe de la cabine) ; 600 pas en 31 ms ; le ventilateur délivre **2,001 m³/min** avec 0,127 kg de charge (3,0 propre) ; Hab-B à 3 ppm du monde de test ; le Lab jusqu'à 30 ppm au-dessous pendant la montée. Diagnostic : le monde de test démarre son épurateur de zéro ; avec `initialFlow = 0` les deux courbes sont à moins de 6 ppm sur 60 min. Le retard d'un pas (étape 6) vaut ce qui reste |
| 12 | faire du graphe une référence revue, pas un script | `écriture` : `specs/habitat-parameters.json` (chaque constante, sa source, son statut ; les vérités que le jumeau ne lit jamais y sont marquées), `lib/habitat.ts` (le spec du document depuis le fichier, la boucle de pas puisque le bundle n'exporte pas `runDocument`), `scripts/build-habitat-graph.ts` (`graphs/habitat.spikypanda` + manifeste : sha256 des deux fichiers, débit délivré et débit filtre propre), `tests/habitat.test.ts` (le registre, chaque nœud sur ses chiffres, le document contre le monde de test, la conservation du CO2 des deux volumes), `npm run habitat:build` | le document, son manifeste |
| 13 | juger | `essai` : `npm test` | 1 échec à moi (l'arithmétique du ventilateur dégradé : −15 % de débit, pas −20 %) ; 2 échecs de suites existantes : le catalogue classe désormais `Physics.Habitat:atmosphere` avant `cabin-air` pour « Concentration en ppm » (égalité, tranchée par l'ordre alphabétique, étape 7) ; le constructeur scripté ONNX demande depuis la capacité `cabin`, et le test de l'atelier accepte les deux types. **114 tests passent** |
| 14 | tenir la décision de nommage prise dans ce journal | `écriture` : les types renommés `Physics.Habitat:*` (une seule famille, comme décidé à la section 0, au lieu de `Habitat.Air` / `Habitat.HVAC`) | idem, 114 tests |

## 2. Ce qui est sorti

- `plugins/habitat/` : sept nœuds, leurs fiches (`docs/*.md`), l'enregistrement avec signatures ; `lib/registry.ts` les ajoute au registre du slot `twin` (le catalogue `twin.registry_list_nodes` les liste), des scripts et des tests. Le conteneur de l'usine (`spikypanda-job`) construit son propre registre et ne les a pas encore.
- `graphs/habitat.spikypanda` (13 nœuds, 18 liens), construit depuis `specs/habitat-parameters.json` par `npm run habitat:build` ; `graphs/habitat.manifest.json`.
- Le défaut de la mise en service est un nombre du fichier : `ventilation.filter.initialLoadingKg = 0.127` ; le ventilateur délivre 2,0 m³/min pour 3 de conception.
- Le monde de test en TypeScript (`harness/stand-in/two-zone-world.ts`) et le graphe s'accordent à 6 ppm près : le monde peut être retiré quand l'exemple lira la référence.

## 3. Ce qu'une usine de code aurait à faire, comparé à ce travail

| ce que j'ai fait | avec quel outil | ce que l'usine a | ce qu'il lui faudrait |
|---|---|---|---|
| lire le code source de trois nœuds du substrat, du constructeur de session, du constructeur de document, du solveur (étapes 2 à 8 : environ 25 lectures) | l'accès au dépôt | `twin.registry_describe_node` (ports, unités, signature, chemin de la doc) ; pas le code | soit un outil `substrate.read` (les sources des plugins, le core), soit une fiche « comment écrire un nœud » dans la bibliothèque : la classe de base, les décorateurs, `setField`, la lecture des signaux, `rhs`, ce que le constructeur de document exige. La deuxième est moins chère et suffit aux nœuds simples |
| découvrir trois pièges par la lecture (ports déclarés seulement, pas de liaison hors éditeur, deux copies du core) | | rien ne le lui dit | les mêmes trois règles dans cette fiche, avec le message d'erreur qu'on obtient sinon |
| écrire huit fichiers, les enregistrer, les compiler | l'éditeur, `tsc` | rien : le sujet `code` n'existe pas (`factory-harness-plan.fr.md` : `code.write`, `code.test`, plus tard) | `code.write` dans `plugins/generated/`, `code.build` (tsc sur le plugin seul), l'enregistrement rechargé dans le registre du slot `twin` sans redémarrer |
| un essai de fumée qui a révélé un écart de 30 ppm et son diagnostic (l'état initial) | un script jetable, le monde de test | `graph.evaluate` (un résidu contre une télémétrie) | `code.test` : la même boucle de pas sur un document minimal, avec des sondes ; le résidu ne suffit pas, il faut lire les courbes et les termes (ce que `graph.evaluate` donne déjà : pente initiale, termes entrants) |
| des tests unitaires par nœud (le point de fonctionnement, le doublement de résistance, la conservation) | `node --test` | rien | l'usine écrit ses tests avec le nœud ; un nœud sans test ne rejoint pas le catalogue (`observateur-et-usines.fr.md`, section 6) |
| des fiches et des signatures avec les grandeurs partagées | | le vocabulaire des signatures | la même règle de garde que l'Observateur : une sortie nommée hors du vocabulaire est refusée |
| environ 25 lectures, 12 écritures, 6 essais, 2 heures | | un budget de 30 décisions par tâche | un budget par nœud (une sous-tâche par capacité manquante), pas un budget par graphe |

Le cas est gardé : ces sept nœuds sont ce qu'une usine de code devra savoir produire, et ce journal est la trace à laquelle comparer son passage.
