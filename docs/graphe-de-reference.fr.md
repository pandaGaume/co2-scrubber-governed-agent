# Le graphe fait à la main, et pourquoi l'usine peinait à le refaire

*Écrit le 24 septembre 2026, après la question de Guillaume : « lorsqu'il a
fallu faire un graphe pour le twin, tu l'as réalisé directement ; comment se
fait-il que refaire la même chose soit aussi compliqué ? Ne peux-tu pas
inférer de ce que tu as fait, le reproduire, et surtout comparer ce graphe
avec ceux qui sont générés ? »*

---

## 1. Ce que j'ai réellement fait, et ce que l'usine devait faire

Il y a deux graphes écrits à la main dans le dépôt, et aucun n'avait été
fait dans les conditions de l'usine.

| | le jumeau du slot (`graphs/cabin.spikypanda`) | le graphe de la mise en service (`labCandidate`, `harness/scripted/graph.ts`) | ce que l'usine devait faire |
|---|---|---|---|
| d'où vient la physique | traduite des équations déjà écrites de l'exemple co2-mpc de spikypanda | écrite par moi, qui connais le monde de test | à trouver dans la bibliothèque |
| comment j'ai appris le câblage | en lisant le code source des nœuds et en corrigeant à la compilation, sans limite de tours | idem | 30 tours, le catalogue et ses fiches, sans le code |
| les paramètres | ceux de l'exemple, repliés sur un volume que personne n'a mesuré, jamais ajustés à une télémétrie (`specs/cabin-parameters.json` : « draft, not yet reviewed ») | le débit de l'équipage tenu à la valeur **exacte du monde** (0,42) : je l'avais écrit | les trouver, ou les ajuster dans la bande documentée |
| le modèle | moi (Opus) | moi | Claude Haiku 4.5 |

L'écart n'était donc pas seulement celui du modèle. **L'usine ne voyait pas
le jumeau qui existait déjà.** Elle redécouvrait à chaque passage comment une
timeline alimente un port, ce que j'avais appris en lisant le code. Et mon
graphe de test « réussissait » en partie parce qu'il connaissait une valeur
que le modèle ne pouvait pas connaître.

## 2. Ce qu'on a fait (commits `7db5714` et `8d2da89`)

1. **Le jumeau existant devient la référence**, lu par du code
   (`harness/topics/graph/reference.ts`) :
   - ses branchements, exprimés en types de nœuds et en ports, sont donnés
     au constructeur dès l'étape 3 : « pars de sa structure, étends-la » ;
   - chaque candidat lui est comparé : les branchements communs, ceux qui
     manquent, ceux qui s'ajoutent. La comparaison revient au constructeur
     et au brief.
2. **Mes graphes tournent sur la même télémétrie**, avec seulement ce que le
   modèle avait : le débit, le retard, le nombre d'occupants, et le débit
   de l'équipage donné **par la bande de la NASA** (0,26 à 0,45 L/min), non
   par la valeur du monde. C'est une boucle du journal, « references ».
3. **Chaque candidat est comparé à mon graphe**, dans le journal seulement,
   jamais montré au modèle (ce serait lui donner la réponse) :
   - la structure : les types et les branchements ;
   - **les nombres** : les deux graphes résolus à leurs variables ajustées,
     paramètre par paramètre, ceux qui diffèrent de plus de 25 %.
4. **Ce que la comparaison a révélé, et qu'on refuse maintenant avant tout
   essai.** Au 8e passage, le candidat 8 avait exactement mes branchements
   et restait à 147 ppm. Les nombres montraient pourquoi :
   - la vitesse de l'épurateur écrite comme le **texte**
     `"speed_percent * 0.01"` dans une timeline, au lieu de la série
     mesurée ;
   - des segments qui s'arrêtent à `60`, en **secondes** : après une minute,
     la commande ne suivait plus rien ;
   - le rendement compté deux fois (`Qe_full * eta`, alors que Qe est déjà
     le débit effectif).

   Le runtime acceptait les deux premiers sans rien dire. `specProblems` les
   refuse maintenant, avec la façon correcte de l'écrire.

## 3. Les deux passages qui ont suivi

| | 8e passage (référence donnée) | 9e passage (+ refus des segments mal écrits) |
|---|---|---|
| mon graphe, le Lab seul | 23,5 ppm, V = 32,1, g = 0,38 | 10,1 ppm, V = 28,0, g = 0,37 |
| mon graphe, avec l'échange | **5,1 ppm**, V = 27,7, g = 0,42, q = 0,82 | **4,1 ppm**, V = 27,5, g = 0,42, q = 1,09 |
| l'usine (le modèle) | 8 candidats, meilleur 147 ppm, abandon argumenté | **1 candidat, 12,6 ppm, accepté**, V = 29,6, g = 0,38 tenu, 16 décisions |
| structure du candidat retenu, contre mon graphe | | 75 % de mes branchements : tout sauf l'échange avec Hab-B |
| nombres du candidat retenu, contre mon graphe | | identiques à 25 % près, sauf la fuite (0 contre 0,04 /min) |
| jetons en entrée de l'usine | 1,32 M | 0,37 M |
| vrai monde | V = 30, g = 0,42, q = 0,6 | idem |

Le modèle a donc reproduit mon graphe « Lab seul », au premier essai, avec
le bon volume. C'est ce que tu demandais.

## 4. Ce que la comparaison dit encore, et qui n'est pas un problème du modèle

- **L'essai ne permet pas de trancher l'échange.** Sur la télémétrie du 9e
  passage, mon graphe sans échange tient le seuil (10,1 ppm), comme celui du
  modèle (12,6 ppm). Avec l'échange, on descend à 4,1 ppm, mais q sort à
  1,09 pour un vrai 0,6. Avec 30 minutes au total et une décroissance de 16
  échantillons, le volume est bien déterminé, pas l'échange. C'est la
  conclusion de la NASA et de SAM (`nasa-protocoles-et-conclusions.fr.md`) :
  il faut une étape qui isole l'échange.
- **Le seuil de 25 ppm ne sépare pas les deux structures.** Il est plus large
  que l'écart qui les distingue. C'est la question 12 de
  `control-system-questions.md` : un seuil tiré du bruit des capteurs, et un
  critère de choix entre structures (question 14).
- **Mon graphe de test tient encore g = 0,42 exact dans les tests unitaires.**
  C'est la valeur du monde. Les références de l'exemple l'ajustent dans la
  bande de la NASA ; les tests devraient faire de même.
