# Le plugin `habitat` : la référence physique de la base, dans le catalogue

*Écrit le 24 septembre 2026, repris le 25 après la correction de Guillaume
(le plugin dupliquait des nœuds du substrat ; il n'en reste que quatre, et
le substrat a été corrigé pour porter le reste). Ce document dit ce qu'est
le plugin, ce que le graphe de référence calcule, comment on s'en sert, et
ce qu'il change pour l'usine. Le pas à pas de son écriture, la correction
et les trois bugs du substrat sont dans `journal-noeuds-habitat.fr.md`.*

---

## 1. Ce que c'est

Un plugin de nœuds écrit dans ce dépôt (`plugins/habitat/`), enregistré
par-dessus le registre du substrat dans tout ce que la démo construit et
fait tourner (`lib/registry.ts`) : le slot `twin` et son catalogue, les
scripts de construction de documents, les tests.

Le plugin n'apporte que ce que le catalogue du substrat n'avait pas.
Quatre types, tous sous `Physics.Habitat` :

| type | ce qu'il fait | état intégré |
|---|---|---|
| `crew` | des personnes comme source de CO2 en kg/s, depuis un débit par personne en L/min selon l'activité (bandes de la NASA) | |
| `scrubber` | l'épurateur dans les unités de sa fiche technique : débit d'air en m³/s avec retard, rendement, retrait en kg/s depuis la concentration aspirée, puissance | le débit |
| `fan` | un ventilateur : de la commande au débit délivré, au point où sa courbe rencontre la résistance du conduit et du filtre | la vitesse |
| `filter` | un filtre et son encrassement : une résistance qui croît avec la poussière captée (le descripteur de poussière du substrat, `Physics.Particulate:lunar_dust`, se branche sur `particulate_in`) | la charge |

Le reste est au substrat, et le graphe s'en sert tel quel :

| nœud du substrat | rôle dans la référence |
|---|---|
| `Physics.Scene:moon` | la scène : gravité lunaire, le repère ambiant |
| `Physics.Scene:atmosphere` | chaque volume d'air, une masse par espèce (gaz parfait) ; ses entrées `delta_<espèce>_<k>` en kg/s (une source positive, un puits négatif, sommés) et ses sorties `ppm_CO2`, `mass_CO2`, `partial_pressure_CO2` sont déclarées depuis `plugin-physics` 0.1.2 ; le volume est semé au ppm lu par le capteur depuis la composition d'air terrestre du core (`_initialMassKg`, calculé par `initialMassesKg` dans `lib/habitat.ts`) |
| `Physics.Scene:atmosphere-gate` | deux fois : la ventilation inter-modules, en mode `exchange` au débit que le ventilateur lui câble (`flow`), l'air de chaque module va chez l'autre et revient ; et le sas, fermé pendant l'essai |
| `Physics.Particulate:lunar_dust` | la poussière que le filtre capte |
| `DSP.Sensor:transducer` | les deux capteurs de CO2, la résolution de la station comme pas de quantification |

Le 24 septembre, le plugin portait sept types : il redéclarait l'atmosphère
du substrat pour lui donner des ports, et refaisait le conduit et le sas
parce que la porte du substrat ne tournait pas hors de l'éditeur. C'était
un doublon ; Guillaume l'a relevé le 25, et la réponse a été de corriger
le substrat (trois bugs, section 4 du journal) plutôt que de le contourner.

Chaque type porte une signature pour le planificateur (grandeurs et unités
partagées : Concentration en ppm, VolumetricFlow en m³/s, MassFlow en
kg/s) et une fiche (`plugins/habitat/docs/`).
Chaque type porte une signature pour le planificateur (grandeurs et unités
partagées : Concentration en ppm, VolumetricFlow en m³/s, MassFlow en
kg/s) et une fiche (`plugins/habitat/docs/`).

**Pourquoi en masse.** Les nœuds `Physics.LifeSupport` du substrat
travaillent en ppm par minute sur un volume replié dans leurs taux : c'est
le piège d'unités qui a fait échouer les premiers passages de l'usine
(`exemple-mise-en-service.fr.md`). Ici un débit est un débit, un volume est
un volume, et l'atmosphère fait la conversion.

## 2. Le graphe de référence

`graphs/habitat.spikypanda` : 16 nœuds, 18 liens, construit par
`npm run habitat:build` depuis `specs/habitat-parameters.json`, où chaque
constante a sa valeur, son unité, sa source et son statut. Le manifeste à
côté donne les sha256 et ce que la ventilation délivre.

```
scène Lune (moon) ── solveur RK4 (pas 6 s) ; lab.atmosphere_out ──► scene

crew-lab (2, light_work) ──► lab.delta_CO2_0
scrubber ◄── speed (30 % puis 100 %)      lab.ppm_CO2 ──► scrubber.ppm
scrubber.co2Delta ──► lab.delta_CO2_1
lab.ppm_CO2 ──► co2-1 (transducer) ; habb.ppm_CO2 ──► co2-2

fan-command (1) ──► fan ──flow──► filter ──resistance──► fan
dust (lunar_dust) ──► filter.particulate_in
fan.flow ──► hvac.flow ; hvac (gate, exchange) lié à lab et habb
hatch (gate, closed) lié à lab et habb

crew-habb (2, rest) ──► habb.delta_CO2_0
```

Les deux portes ne câblent pas de CO2 : elles sont liées aux deux
atmosphères (liens de configuration `atmosphere_out` vers
`atmosphere_A_in` et `atmosphere_B_in`) et déplacent les masses
elles-mêmes, espèce par espèce, à chaque pas.

Les vérités que le jumeau ne lit jamais sont dans le fichier, marquées
comme telles : le volume du Lab (30 m³), celui de Hab-B (400), le débit de
l'équipage (0,42 L/min par opérateur, dans la bande de la NASA), et le
défaut : `ventilation.filter.initialLoadingKg = 0.127`, un filtre déjà
encrassé qui fait délivrer **2,0 m³/min** au ventilateur là où la
conception dit 3.

Vérifié (`tests/habitat.test.ts`, 9 tests) : le graphe s'accorde avec le
monde de test en TypeScript à moins de 6 ppm sur les 60 minutes de l'essai
à deux pas ; la porte échange ce que le ventilateur délivre ; le CO2 des
deux volumes réunis ne change que par l'équipage et l'épurateur ; filtre
propre, 3,0 m³/min ; un volume semé à 1 480 ppm relit 1 480 ppm à la
pression gardée.

## 3. S'en servir

```bash
npm run build
npm run habitat:build      # graphs/habitat.spikypanda et son manifeste
node --test dist/tests/habitat.test.js
```

En code : `buildHabitatDocument(options)` donne le document pour d'autres
pas de commande, un filtre propre (`filterLoadingKg: 0`), le sas ouvert ;
`runHabitat(json, minutes)` donne une ligne par minute comme un
enregistreur (CO2 des deux modules, vitesse, débit du ventilateur,
encrassement, débit et retrait de l'épurateur, masses).

Dans le catalogue du slot `twin` (`registry_list_nodes`,
`registry_search`), les quatre types apparaissent avec leur signature ; une
recherche « Concentration en ppm » rend l'atmosphère du substrat (qui
déclare désormais `ppm_CO2` dans sa signature) et son cabin-air (demander
la capacité `cabin` pour le second).

Le substrat qu'il faut : `@spiky-panda/core` 1.0.2, `plugin-physics` 0.1.2,
`factory` 0.1.2 (archives dans `vendor/`, commit `4c85f08` de spikypanda).
Avec les versions d'avant, la construction du graphe **bloque** (un lien
vers un port non déclaré de l'atmosphère fait tourner l'ordonnanceur sans
fin) : c'est le premier des trois bugs du journal.

Dans le studio (le serveur lancé par `npm run server`), pour ouvrir et
inspecter le graphe avec ses nœuds dessinés :

```
http://localhost:3001/studio/node-editor-v2/index.html?mcp=0&ext=/agent/habitat.js
```

L'extension `habitat.js` charge le plugin bundlé pour le navigateur
(`dashboard/agent/SpkPluginHabitat.js`, construit par `npm run build` sur
le core du studio, les fiches à côté sous `habitat-docs/`), puis le
document ; aucune page ne tourne dessus. `&graph=<url>` ouvre un autre
document dessiné avec le même plugin. Le studio est servi depuis le dépôt
spikypanda voisin (`.mcp-broker/config.json`), dont les bundles doivent
être ceux du substrat corrigé (`node scripts/deploy-bundles.mjs` là-bas
après `npm run bundle`).

Limites connues :
- le conteneur de l'usine (`spikypanda-job`) construit son propre registre ;
  le plugin local n'y est pas.

## 4. Ce que ça change pour l'usine

L'usine n'a plus à inventer la structure : la référence existe. Ce qui
s'ajuste sur elle, décidé le 24 septembre au soir :

| ce qui s'ajuste | dans le graphe | ce qui le fixe |
|---|---|---|
| l'épurateur | `scrubber.flowAtFullM3ps`, `efficiency`, `lagTimeConstantMinutes` | la fiche technique, puis la mise en service qui vérifie |
| l'installation | `lab.volume`, `habb.volume`, le débit délivré par la ventilation (par `filter.initialLoadingKg` ou `fan.capacityFactor`) | la mise en service |
| l'équipage | `crew.*LitresPerMinute` dans la bande de la NASA | la télémétrie |
| les défauts | l'encrassement du filtre (`initialLoadingKg`), un ventilateur dégradé (`capacityFactor`), plus tard un moteur | la surveillance |

Prochain pas côté usine : donner ce document comme référence à l'usine de
graphes (`harness/topics/graph/reference.ts` lit encore
`graphs/cabin.spikypanda`), et faire de `graph.evaluate` l'ajustement de ces
paramètres sur la structure donnée, avec les mêmes gardes (constantes
documentées tenues, bandes respectées). L'exemple de bout en bout lira
alors sa télémétrie dans ce graphe, et le monde de test en TypeScript
pourra être retiré.
