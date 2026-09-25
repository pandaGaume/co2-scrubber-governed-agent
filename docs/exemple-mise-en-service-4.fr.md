# Quatrième passage de l'exemple : l'épurateur enregistré et l'équipage nommé, Haiku 4.5 contre Opus 5.5

*Deux exécutions le 25 septembre 2026, à 13:25 UTC avec Claude Haiku 4.5 et
à 13:28 UTC avec Claude Opus 5.5 (`REASONER_PROFILE=profiles/anthropic-opus.json`),
le même script (`npm run example:commissioning`, la parole coupée). Les
journaux et les traces complètes sont dans `docs/exemples/2026-09-25-mise-en-service-4-haiku/`
et `docs/exemples/2026-09-25-mise-en-service-4-opus/`. Les passages précédents
sont dans `exemple-mise-en-service.fr.md`, `-2` et `-3` ; ce document ne dit
que ce qui a changé et ce qui sépare les deux modèles.*

---

## 1. Ce qui avait changé avant ce passage

- L'usine reçoit le registre (`observations.devices`) : les variables `Qe`,
  `eta` et `lag` du graphe de bibliothèque sont liées à l'épurateur
  enregistré, et le jumeau prend ses nombres (`fromDevice`), tenus.
- L'usine reçoit qui est à bord (`observations.persons`, lu chez
  `biomed.presence`) : quatre personnes nommées, chacune à son activité,
  un nœud chacune.
- Le slot `twin` sait faire tourner ce graphe sur une question
  (`habitat_run`), pour changer la présence et l'activité après coup.
- La trace : chaque tâche d'usine garde `trace.jsonl` (par pas : la
  décision, l'appel et son résultat, les messages envoyés au modèle et sa
  réponse brute) ; `npm run trace <tâche>` en fait un `trace.md` lisible, et
  l'exemple écrit désormais `trace/` à côté du journal, l'Observateur
  compris. Ces deux passages ont été rendus après coup : leur trace porte
  les tâches d'usine, pas encore l'Observateur (les échanges n'étaient pas
  écrits), et le prompt système y vient du fichier de rôle.

## 2. Les boucles, les deux modèles côte à côte

| boucle | Haiku 4.5 | Opus 5.5 |
|---|---|---|
| 2. usine de protocoles | 14 décisions, 1 refus (plancher à 10 %, un pas à 20 %, une borne), 60 s | 13 décisions, 1 refus (abandon CO2 à 3400 ppm au-dessus du plafond de 3200 ; 120 min au-dessus de 60), 94 s |
| 5. exécution | 50 min, 319 appels | 50 min, 319 appels |
| 7. Observateur | 7 décisions, 1 refus (une bande sans bornes), 5 lectures, 56 s | 6 décisions, 1 refus (la première réponse était du texte, pas un appel), 4 lectures, 77 s |
| 8. usine de graphes | **7 décisions, 1 candidat, 41 passages, 5,8 ppm sur le Lab et 4,3 sur Hab-B**, accepté, 27 s | **5 décisions, 1 candidat, 81 passages, 4,3 ppm sur le Lab et 3,7 sur Hab-B**, accepté, 24 s |
| appels au modèle | 28 | 24 |
| jetons des tâches d'usine, entrée / cache écrit / cache lu / sortie | 349 500 / 4 500 / 27 000 / 6 244 | 231 010 / 10 678 / 80 152 / 9 154 |
| jetons de l'Observateur, entrée / sortie (hors cache) | 103 839 / 6 275 | 78 812 / 7 481 |
| coût estimé | **≈ 0,52 $** (1 $ / 5 $ le million) | **≈ 1,64 $** (4 $ / 20 $ le million, cache lu à 0,20) |

Les coûts sont calculés sur l'usage brut des réponses pour les deux tâches
d'usine (cache compris) et sur les compteurs du journal pour
l'Observateur (hors cache, donc un peu sous-estimés). Opus lit moins de
jetons (il fait moins de pas) et en écrit davantage (il raisonne), et
coûte trois fois plus.

## 3. Ce que l'usine de graphes a trouvé

| variable | vrai | Haiku 4.5 | Opus 5.5 |
|---|---|---|---|
| V, volume du Lab | 30 m³ | 25,8 | 27,9 |
| L, charge du filtre, et le débit qu'elle laisse | 0,127 kg, 2,0 m³/min | 0,066 kg, 2,3 m³/min | 0,097 kg, 2,15 m³/min |
| Vh, volume de Hab-B | 400 m³ | 442 | 436 |
| g, débit des opérateurs | 0,42 L/min | 0,415 | 0,416 |
| Qe, eta, lag | la fiche | de l'appareil enregistré (`fromDevice`) | de l'appareil enregistré (`fromDevice`) |
| les personnes | 4 | FE-1, FE-2 au Lab en travail léger ; CDR, FE-3 dans Hab-B au repos | les mêmes |

Les deux ont pris le graphe de bibliothèque avec les personnes observées
et ajusté V, Vh, L et g dans les bornes du gabarit. Opus a demandé 80
passages du simplexe (`maxRuns`), Haiku les 40 par défaut : la moitié de
l'écart sur V et L tient à ça, le reste à la surface plate du résidu (V et
L se compensent : un Lab plus petit avec une ventilation qui délivre plus
donne presque la même courbe, 4 à 6 ppm dans les deux cas). Le passage
précédent, sans registre ni personnes, avait trouvé V 29,9 et L 0,128 avec
41 passages : la précision d'un passage à l'autre varie plus que celle
d'un modèle à l'autre. Une mise en service qui veut V à 5 % près doit
contraindre L autrement (mesurer le débit de la ventilation) ou allonger
l'essai.

## 4. L'Observateur, ce qui sépare les deux

C'est ici que la différence se voit, et c'est ce que l'usine reçoit ensuite.

| | Haiku 4.5 | Opus 5.5 |
|---|---|---|
| sorties demandées | 2 : le CO2 du Lab, celui de Hab-B | 3 : les deux CO2, et le débit efficace de l'épurateur (VolumetricFlow, L/min) |
| constantes connues | 6, unités justes (`Qe_max` 1 m³/min, `eta`, `tau_scrubber`, `q_design` 3 m³/min, les deux débits de la NASA) | 9, unités justes et cohérentes entre elles (`Qfull` 0,055 m³/s, `Qe` 1000 L/min, `eta`, `tau_s`, `c_min` 40 %, les deux seuils, les deux débits de la NASA) |
| ce qui manque, dit comme tel | 8 lignes, dont trois qui ne manquent pas vraiment (la précision des capteurs, le résidu de la décroissance, l'épurateur sous 20 %) | 5 lignes, courtes, et une que personne n'avait vue : « speed_percent commence à 33 alors que l'essai est décrit à 40 % » |
| le refus | une bande donnée sans bornes | la première réponse est du texte, pas un appel à `observer.request` |
| lectures | 5 (dont `co2-mass-balance`) | 4 |

Opus lit moins et écrit une demande plus serrée : rien d'inutile dans les
sorties, les constantes avec leurs deux unités (m³/s et L/min) cohérentes,
et une incohérence de la description relevée (la vitesse initiale). Haiku
demande deux sorties justes et laisse dans « ce qui manque » des choses
que la bibliothèque documente. Aucun des deux n'a redemandé la dérivée du
CO2 (le troisième passage l'avait fait) : la description n'a pas changé,
c'est le modèle qui l'invente ou non.

Le refus d'Opus dit quelque chose du prompt de l'Observateur : un modèle
qui raisonne d'abord répond en texte à la première question, malgré la
consigne « Answer with a tool call, not with text ». La garde l'a renvoyé,
et le second tour était un appel. Un coût de 78 k jetons pour rien ; à
regarder si le prompt doit dire autrement qu'on n'attend qu'un appel.

## 5. La trace, et comment la lire

`docs/exemples/2026-09-25-mise-en-service-4-<modèle>/trace/` :
`02-procedure-factory.md` et `08-graph-factory.md`, une section par pas :

- le nœud où le harnais était (la phase avant et après), la dernière
  capacité, la décision et son évaluation ;
- l'entrée de l'appel et sa sortie, en entier (un bloc long est replié,
  jamais coupé) ;
- l'appel au modèle : le modèle, les jetons, la latence ; **ce qui a été
  ajouté à sa conversation depuis l'appel précédent** (le brief du harnais,
  le résultat de l'outil), et **sa réponse brute** (son texte, l'outil
  appelé avec ses arguments, l'arrêt).

Le prompt système et la liste des outils sont donnés une fois en tête. Le
`.jsonl` à côté est la source. À partir du prochain passage, l'échange
lui-même porte le prompt système et la description des outils, et
`07-observer.md` s'ajoute.

## 6. Ce que ce passage nous apprend, et ce qu'on corrige ensuite

| constat | correction proposée |
|---|---|
| les deux modèles trouvent le défaut (le débit délivré sous la conception) avec l'épurateur enregistré et les personnes nommées | rien : c'est ce qu'on voulait |
| V et L se compensent, la précision varie d'un passage à l'autre | une mesure du débit de la ventilation dans la procédure (une contrainte de plus), ou un essai plus long ; à poser à l'automaticien |
| l'Observateur d'Opus relève une incohérence de la description (33 % contre 40 %) | corriger la description de l'exemple, et garder cette ligne comme exemple de ce qu'un Observateur doit faire |
| Opus répond en texte au premier tour de l'Observateur | revoir la consigne du prompt de l'Observateur pour un modèle qui raisonne d'abord ; un tour de 78 k jetons perdu |
| trois fois le coût pour un résidu un peu meilleur et une demande plus serrée | Haiku pour l'usine de graphes (la structure vient de la bibliothèque, il reste peu à décider), Opus pour l'Observateur si sa demande vaut le prix : à mesurer sur plus d'un passage |
