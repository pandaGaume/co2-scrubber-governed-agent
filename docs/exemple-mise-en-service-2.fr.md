# Deuxième passage de l'exemple : après les corrections

*Exécuté le 24 septembre 2026 à 16:14 UTC, sur le même modèle (Claude Haiku
4.5, slot `reasoner`), avec le même script (`npm run example:commissioning`).
Le journal brut est dans `docs/exemples/2026-09-24-mise-en-service-2-journal.md`,
la télémétrie dans `docs/exemples/2026-09-24-mise-en-service-2-telemetrie.json`.
Le premier passage et la définition d'une boucle sont dans
`exemple-mise-en-service.fr.md` ; ce document ne dit que ce qui a changé.*

---

## 1. Ce qui avait été corrigé avant ce passage

Commit `0fe1821` :

| correction | où |
|---|---|
| **contrôle de vraisemblance** : la pente des cinq premières minutes, prévue contre mesurée ; un jumeau qui s'écarte dès le départ, ou part dans l'autre sens, est averti que ses taux sont sans doute dans la mauvaise unité (le rappel Qe / V est donné) ; rien n'est refusé, c'est dit avec les chiffres, dans la réponse de `graph.evaluate` et dans le brief | `harness/topics/graph/evaluate.ts` (`earlySlopeOf`, `plausibilityOf`) |
| **vocabulaire commun des grandeurs** : l'Observateur reçoit les grandeurs et les unités que parlent les signatures du catalogue (Concentration en ppm...), jamais les nœuds ; sa garde refuse une sortie nommée hors de ce vocabulaire | `harness/observer/observer.ts`, `request.ts` (règle `vocabulary`) |
| **l'Observateur lit la bibliothèque** avant d'écrire (list, search, read, six lectures au plus, qui ne comptent pas comme tentatives) ; son prompt dit qu'une hypothèse n'est jamais une exigence | `observer.ts`, `prompt.md` |
| **volume apparent** : le compte rendu et Mother disent « volume apparent », parce que la méthode suppose une seule pièce | `report.ts`, grammaires de la station |

## 2. Les boucles, comparées au premier passage

| boucle | 1er passage | 2e passage |
|---|---|---|
| 2. usine de protocoles | 13 décisions, 1 refus | 12 décisions, 1 refus (plancher à 20 %, 3800 ppm, 180 min) ; protocole corrigé : 50 % puis 100 % ; surveillance demandée d'elle-même, à nouveau |
| 5. exécution | 60 min, aucun arrêt | 60 min, 319 appels, aucun arrêt |
| 6. compte rendu | 38,6 m³ (vrai : 30) | **35,0 m³ apparent** (tau 35,0 min, 31 échantillons, résidu 7,8 ppm) |
| 7. Observateur | 1 tentative, pas de bibliothèque | 1 tentative acceptée, **1 lecture** de bibliothèque (une recherche) |
| 8. usine de graphes | 30 décisions, 7 candidats, meilleur écart **679 ppm** | 30 décisions, 10 candidats, meilleur écart **41,5 ppm** (seuil 25) |
| appels au modèle | 44 | 44 |
| jetons en entrée / sortie | 1,34 M / 14,5 k | 1,17 M / 17,0 k (≈ 1,25 $) |

L'usine de graphes échoue encore, mais seize fois plus près du seuil, et pour
une autre raison.

## 3. Ce que les corrections ont réglé

- **Le vocabulaire.** L'Observateur a nommé sa sortie « Concentration, ppm ».
  Le plan de l'usine a été accepté du premier coup (pas 12), là où le premier
  passage avait perdu cinq tours sur un nom de grandeur.
- **Hab-B comme entrée.** L'Observateur a mis le CO2 de Hab-B dans les entrées
  du jumeau et l'échange par le sas dans les relations (« may exchange air »),
  et non plus « aucun échange » comme exigence.
- **L'erreur d'unité n'est plus systématique.** Les candidats 3 à 10 ont des
  taux plausibles. Le contrôle s'est déclenché sur les candidats 1, 2, 5 et 7.
  Sur les candidats 2 et 7, le constructeur avait laissé l'estimateur pousser
  Qe à 50 : le jumeau partait à 770 et 329 ppm/min, contre 20 mesurés. Après
  chacun de ces deux avertissements, le candidat suivant est revenu à des taux plausibles.

## 4. Ce qui a échoué, cette fois : le connu et l'inconnu inversés

La chaîne, d'après le journal :

1. **Le script** donnait encore à l'Observateur « Served volume from the
   decay: 35 m3 ». C'était un oubli de ma part, car la correction du compte
   rendu ne couvrait pas le texte du script. Il est corrigé depuis :
   « Apparent volume from the decay, one room assumed ».
2. **L'Observateur** a pris ce chiffre pour un fait :
   - en contrainte : « Lab volume: 35 m³ (measured from decay test) » ;
   - en comportement : « tau = 35 min ».
   Il n'a fait qu'une recherche dans la bibliothèque et n'a pas lu la fiche
   technique. Il a donc rangé dans « ce qui manque » exactement ce que la
   fiche donne : le débit effectif, le retard de 3,33 min, le rendement.
3. **L'usine de graphes** a suivi la demande plutôt que la bibliothèque :
   - elle a tenu V = 35 fixe ;
   - elle a ajusté Qe et le retard, deux constantes documentées. Le retard
     est sorti à 41 à 45 minutes, contre 3,33 sur le banc ;
   - aux candidats 6 et 10, elle a ajouté une « émission supplémentaire »
     constante, un terme sans physique qui compense.

   Elle arrive ainsi à 41,5 ppm. C'est l'équifinalité décrite dans
   `usine-de-graphes.fr.md` (section 5) : une structure fausse se cache
   derrière des constantes fausses, et le résidu baisse pour une mauvaise
   raison. Le seuil a tenu, et aucun de ces candidats n'a été accepté.

Autre coût : quatre candidats n'ont pas été construits (pas 13 à 19), parce
que le constructeur découvrait l'usage des nœuds :
- `$series` mis comme paramètre au lieu des segments d'une timeline ;
- des segments en objet ;
- la commande de l'épurateur écrite comme paramètre au lieu d'être câblée ;
- `emissionA` écrit comme paramètre au lieu d'être câblé.

## 5. Ce que ce passage nous apprend, et ce qu'on corrige ensuite

| constat | correction proposée |
|---|---|
| un chiffre obtenu sous une hypothèse (une pièce) est devenu une contrainte | fait : le script dit « apparent, one room assumed ». En plus : une règle de garde de l'Observateur, qui interdit qu'une contrainte cite une valeur obtenue sous une hypothèse que la demande déclare elle-même non tranchée |
| l'Observateur n'a pas lu la fiche technique | lui donner d'entrée la liste des documents de la bibliothèque (titres et résumés), pour qu'il sache que la fiche existe ; aujourd'hui il ne la découvre qu'en cherchant |
| l'usine a ajusté des constantes documentées | une section `known` dans la demande : chaque constante avec sa valeur et sa source (un document de la bibliothèque que l'Observateur a lu). `graph.evaluate` refuse alors de mettre dans `fit` une variable déclarée connue, et le dit |
| un terme sans physique (« émission supplémentaire ») a fait baisser le résidu | une question pour l'automaticien (sélection de structure, questions 8 et 14 de `control-system-questions.md`) ; en attendant, le brief rappelle qu'un terme ajouté doit nommer son hypothèse physique |
| quatre candidats non construits | donner dans le brief, dès l'étape 3, la fiche des nœuds retenus au plan (ports câblés, paramètres) |
| 1 M de jetons pour l'usine de graphes seule | un second point de cache sur l'historique des messages |

Les trois premières corrections sont à faire avant le passage suivant. La
correction de l'unité et celle du vocabulaire ont marché, et restent en
place.
