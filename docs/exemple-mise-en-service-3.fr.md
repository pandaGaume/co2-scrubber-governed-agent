# Troisième passage de l'exemple : la référence de l'habitat, prise dans la bibliothèque

*Exécuté le 25 septembre 2026 à 12:41 UTC, sur le même modèle (Claude Haiku
4.5, slot `reasoner`), avec le même script (`npm run example:commissioning`,
la parole coupée par `SPEECH_PROVIDER=silent`). Le journal brut est dans
`docs/exemples/2026-09-25-mise-en-service-3-journal.md`, la télémétrie dans
`docs/exemples/2026-09-25-mise-en-service-3-telemetrie.json`. Le premier
passage et la définition d'une boucle sont dans
`exemple-mise-en-service.fr.md`, le deuxième dans
`exemple-mise-en-service-2.fr.md` ; ce document ne dit que ce qui a changé.*

---

## 1. Ce qui avait changé avant ce passage

- La référence physique de l'habitat existe (`plugin-habitat.fr.md`) : deux
  volumes en masse, les quatre personnes du roster chacune à son activité,
  l'épurateur dans les unités de sa fiche, la ventilation par son filtre,
  les capteurs. Elle est dans la bibliothèque avec son gabarit et sa
  grammaire (`library.graphs`), et `graph.evaluate` l'instancie sur le
  jumeau (`graph: "habitat"`) : les constantes connues tenues, les volumes
  et la charge du filtre ajustés, le débit des opérateurs placé dans sa
  bande, ses propres sondes comparées aux colonnes de l'enregistreur.
- Le brief de l'usine de graphes et son prompt disent de partir de ce
  graphe et d'adapter ses nombres, pas de reconstruire.
- Le monde de test n'a pas changé : la télémétrie vient toujours du monde
  à deux zones en TypeScript (Lab 30 m³, Hab-B 400, la ventilation délivre
  2 m³/min pour 3 de conception, les opérateurs à 0,42 L/min).

## 2. Les boucles, comparées au deuxième passage

| boucle | 2e passage | 3e passage |
|---|---|---|
| 2. usine de protocoles | 12 décisions, 1 refus | 16 décisions, 2 refus, 82 s ; protocole autorisé, surveillance demandée |
| 5. exécution | 60 min, 319 appels | 50 min, 319 appels, aucun arrêt |
| 7. Observateur | 1 tentative acceptée, 1 lecture | 7 décisions, 1 refus (une unité hors vocabulaire : m³/min), 15 constantes connues avec leur source, 72 s |
| 8. usine de graphes | 30 décisions, 10 candidats, meilleur écart **41,5 ppm** (seuil 25), refusé | **13 décisions, 1 candidat, écart 7,1 ppm sur le Lab et 5,3 sur Hab-B (seuil 10), accepté**, 42 s |
| 9. références | les deux graphes à la main | les deux graphes à la main, plus le graphe de bibliothèque à la main (filtre propre, puis charge ajustée), 528 appels, 16 s |
| 10. proposition | rien à proposer | le candidat proposé à la station |
| appels au modèle | 44 | 36 |
| jetons en entrée / sortie | 1,17 M / 17,0 k | 0,81 M / 15,9 k (l'usine de graphes : 408 k / 2,9 k) |

## 3. Ce que l'usine a fait avec la référence

Elle a lu la tâche, cherché le catalogue, lu le rayon (`library.graphs`),
relu la tâche, lu le graphe (`library.graph habitat`), déposé son plan (les
douze types du graphe), puis **une seule évaluation** :

    graph: "habitat"
    label: "Habitat reference graph with default parameters"
    fit: V, Vh, L, g  (dans les bornes du gabarit)
    settings: ceux du gabarit (deux personnes par module)

Le harnais a tenu `Qe`, `eta`, `lag` et `gRest` à leurs défauts (il le dit
dans la réponse : `defaulted`), cherché les quatre autres en 41 passages
du simplexe, et jugé sur les deux capteurs :

| variable | trouvé | vrai | note |
|---|---|---|---|
| V, volume du Lab | 29,9 m³ | 30 | |
| L, charge du filtre | 0,128 kg | 0,127 | soit 2,0 m³/min délivrés pour 3 de conception : le défaut de la mise en service, trouvé |
| Vh, volume de Hab-B | 439 m³ | 400 | non documenté ; Hab-B ne bouge que de 60 ppm en 50 min, la pente le contraint peu |
| g, débit des opérateurs | 0,411 L/min | 0,42 | dans la bande de la NASA |

Un seul candidat, là où le constructeur scripté en joue deux (le filtre
propre d'abord, refusé). Le modèle a mis la charge du filtre dans `fit`
dès le premier coup : le gabarit la donnait comme ajustée, avec ses bornes
et son sens. Le graphe de référence n'est pas seulement une structure de
départ ; c'est aussi la liste de ce qui se cherche, et l'usine s'en est
servie comme telle.

Les références à la main, sur la même télémétrie (boucle 9) :

| référence | écart | trouvé |
|---|---|---|
| graphe de bibliothèque, filtre propre (le débit de conception) | 15,8 ppm | V 25, Vh 599, g 0,45 (au bord de la bande : le débit de conception ne colle pas) |
| graphe de bibliothèque, charge du filtre ajustée | 4,6 ppm | V 27,1, Vh 441, L 0,084 (2,2 m³/min), g 0,419 |
| à la main, nœuds life-support, débit de conception | 18,2 ppm | V 23, g 0,43 |
| à la main, nœuds life-support, débit délivré ajusté | 4,9 ppm | V 26,3, q 2,26 m³/min, g 0,416 |

Le candidat du modèle et les références se recoupent : le volume entre 27
et 30 m³, le débit délivré entre 2,0 et 2,3 m³/min, le débit des
opérateurs entre 0,41 et 0,42. Le candidat du modèle est le plus proche
du vrai sur V et sur L ; avec 80 passages, la référence à la main ferait
sans doute aussi bien (le simplexe s'est arrêté ailleurs).

## 4. Ce qui a accroché

- **Une sortie que le graphe ne produit pas.** L'Observateur a demandé,
  parmi cinq sorties, « la vitesse de variation du CO2 dans le Lab »
  (ConcentrationRate, ppm/min). Aucun nœud du graphe ne la publie. Le plan
  a été refusé deux fois (la sortie ni produite ni déclarée manquante ;
  puis déclarée manquante sous un sujet inconnu, « DSP or Math nodes for
  differentiation »), puis accepté avec une capacité manquante. Le candidat
  tient le seuil sur les concentrations ; la dérivée reste non couverte, et
  la proposition la revendique quand même. Deux corrections possibles :
  un nœud de dérivée dans le catalogue (le substrat a des nœuds DSP), ou
  l'Observateur qui ne demande pas une dérivée quand la concentration est
  déjà demandée (c'est du calcul, pas une observable).
- **Les unités de l'Observateur.** Il écrit `Q_full = 3.3 L/min` (c'est
  3,3 m³/min) et `Qe_full = 1000 L/min` : le premier est faux d'un facteur
  mille, le second juste mais converti. La garde du vocabulaire a refusé
  m³/min une fois, et le modèle a converti de travers. Ce n'est pas encore
  ce que l'usine lit (elle prend les défauts du gabarit, qui sont ceux de
  la fiche), mais un jour ça le sera : la garde doit vérifier l'ordre de
  grandeur d'une constante connue contre le document cité, pas seulement
  qu'un document est cité.
- **Hab-B peu contraint.** Vh à 439 pour 400, et 599 avec le filtre propre :
  en 50 minutes Hab-B monte de 60 ppm ; son volume se lit dans une pente
  faible. Une mise en service qui veut Hab-B devra le mesurer autrement
  (sa propre décroissance, sas fermé).

## 5. Ce que ce passage nous apprend, et ce qu'on corrige ensuite

| constat | correction proposée |
|---|---|
| l'usine part du graphe de bibliothèque et trouve le défaut du premier coup | rien : c'est ce qu'on voulait. Reste à faire lire sa télémétrie à l'exemple dans le graphe lui-même, et à retirer le monde de test |
| une sortie demandée que rien ne produit, revendiquée quand même | un nœud de dérivée au catalogue, et le validateur qui refuse une revendication sur une capacité déclarée manquante |
| les unités converties de travers par l'Observateur | la garde de provenance compare la valeur d'une constante connue au chiffre du document cité (ordre de grandeur) |
| le modèle a fait un candidat là où le script en fait deux | rien à corriger ; le journal garde les deux références à la main pour montrer ce que vaut le débit de conception |
| 408 k jetons en entrée pour treize décisions | le second point de cache sur l'historique, toujours à faire |
