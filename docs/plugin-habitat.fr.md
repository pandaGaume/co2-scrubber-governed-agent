# Le plugin `habitat` : la référence physique de la base, dans le catalogue

*Écrit le 24 septembre 2026. Ce document dit ce qu'est le plugin, ce que le
graphe de référence calcule, comment on s'en sert, et ce qu'il change pour
l'usine. Le pas à pas de son écriture, et la comparaison avec ce qu'une
usine de code aurait à faire, sont dans `journal-noeuds-habitat.fr.md`.*

---

## 1. Ce que c'est

Un plugin de nœuds écrit dans ce dépôt (`plugins/habitat/`), enregistré
par-dessus le registre du substrat dans tout ce que la démo construit et
fait tourner (`lib/registry.ts`) : le slot `twin` et son catalogue, les
scripts de construction de documents, les tests. Spikypanda n'est pas
touché.

Sept types, tous sous `Physics.Habitat` :

| type | ce qu'il fait | état intégré |
|---|---|---|
| `atmosphere` | l'atmosphère du substrat (une masse par espèce, gaz parfait) avec quatre entrées de CO2 en kg/s et ses sorties `ppm_CO2`, `mass_CO2`, `pressure` déclarées comme ports | les masses |
| `crew` | des personnes comme source de CO2 en kg/s, depuis un débit par personne en L/min selon l'activité (bandes de la NASA) | |
| `scrubber` | l'épurateur dans les unités de sa fiche technique : débit d'air en m³/s avec retard, rendement, retrait en kg/s depuis la concentration aspirée, puissance | le débit |
| `fan` | un ventilateur : de la commande au débit délivré, au point où sa courbe rencontre la résistance du conduit et du filtre | la vitesse |
| `filter` | un filtre et son encrassement : une résistance qui croît avec la poussière captée | la charge |
| `duct` | le CO2 que la ventilation échange entre deux volumes au débit du ventilateur (deux deltas opposés) | |
| `hatch` | le même échange par une ouverture, ouverte ou fermée | |

Chaque type porte une signature pour le planificateur (grandeurs et unités
partagées : Concentration en ppm, VolumetricFlow en m³/s, MassFlow en
kg/s) et une fiche (`plugins/habitat/docs/`).

**Pourquoi en masse.** Les nœuds `Physics.LifeSupport` du substrat
travaillent en ppm par minute sur un volume replié dans leurs taux : c'est
le piège d'unités qui a fait échouer les premiers passages de l'usine
(`exemple-mise-en-service.fr.md`). Ici un débit est un débit, un volume est
un volume, et l'atmosphère fait la conversion.

## 2. Le graphe de référence

`graphs/habitat.spikypanda` : 13 nœuds, 18 liens, construit par
`npm run habitat:build` depuis `specs/habitat-parameters.json`, où chaque
constante a sa valeur, son unité, sa source et son statut. Le manifeste à
côté donne les sha256 et ce que la ventilation délivre.

```
scène Lune ── solveur RK4 (pas 6 s)

crew-lab (2, light_work) ──► lab.delta_CO2_0
scrubber ◄── speed (30 % puis 100 %)      lab.ppm_CO2 ──► scrubber.ppm
scrubber.co2Delta ──► lab.delta_CO2_3

fan-command (1) ──► fan ──flow──► filter ──resistance──► fan
fan.flow ──► hvac.flow ; lab.ppm_CO2 ──► hvac.ppmA ; habb.ppm_CO2 ──► hvac.ppmB
hvac.co2DeltaA ──► lab.delta_CO2_1 ; hvac.co2DeltaB ──► habb.delta_CO2_1
hatch (fermé) : mêmes branchements sur delta_CO2_2

crew-habb (2, rest) ──► habb.delta_CO2_0
```

Les vérités que le jumeau ne lit jamais sont dans le fichier, marquées
comme telles : le volume du Lab (30 m³), celui de Hab-B (400), le débit de
l'équipage (0,42 L/min par opérateur, dans la bande de la NASA), et le
défaut : `ventilation.filter.initialLoadingKg = 0.127`, un filtre déjà
encrassé qui fait délivrer **2,0 m³/min** au ventilateur là où la
conception dit 3.

Vérifié (`tests/habitat.test.ts`, 8 tests) : le graphe s'accorde avec le
monde de test en TypeScript à moins de 6 ppm sur les 60 minutes de l'essai
à deux pas ; le CO2 des deux volumes réunis ne change que par l'équipage et
l'épurateur ; filtre propre, 3,0 m³/min.

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
`registry_search`), les sept types apparaissent avec leur signature ; une
recherche « Concentration en ppm » rend l'atmosphère et le cabin-air du
substrat (demander la capacité `cabin` pour le second).

Limites connues :
- la page du jumeau (le studio dans le navigateur) ne connaît pas le
  plugin : elle affiche le graphe de la cabine, pas celui-ci, tant que le
  plugin n'a pas de bundle pour le navigateur ;
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
