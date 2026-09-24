# L'usine de graphes : identifier un jumeau, en langage d'automaticien

*Écrit le 24 septembre 2026. Ce document décrit l'usine de graphes
(`harness/topics/graph/`) comme un problème d'**identification de système**,
pour qu'un automaticien puisse la relire, la critiquer et la corriger. La
section 9 rassemble les questions que nous aimerions soumettre au Dr
Grigoriadis. L'exemple complet, chiffres réels à l'appui, est dans
`exemple-mise-en-service.fr.md`.*

---

## 1. Le problème : une identification « boîte grise »

On veut un modèle du CO2 du Lab qui serve à évaluer des stratégies de vitesse
de l'épurateur (des questions « et si »). C'est de l'identification de
système au sens classique (Ljung), dans sa variante **boîte grise** : la
physique est connue dans sa forme, certains paramètres ne le sont pas.

| notion | ici |
|---|---|
| entrée commandée u(t) | la commande de l'épurateur, 0 à 1 (colonne `speed_percent` / 100) |
| perturbation mesurée d(t) | le CO2 de Hab-B (colonne `co2_habb_ppm`), quand la structure en a besoin |
| sortie mesurée y(t) | le CO2 du Lab (colonne `co2_lab_ppm`), un échantillon par minute |
| état x(t) | la concentration du Lab ; plus l'état du retard de l'épurateur, r(t) |
| paramètres connus θk | ceux de la fiche technique et de la station : débit effectif Qe = 1,0 m³/min, constante de retard τs = 3,33 min, production par personne g, effectif N |
| paramètres inconnus θ | le volume servi V ; le débit d'échange q par le sas fermé, si la structure le contient |
| structure M | le graphe : quels nœuds, quelles liaisons, quelles formules |

Le modèle à deux termes que l'usine finit par construire s'écrit :

```
dr/dt = (Qe · u(t) − r) / τs                          retard du premier ordre de l'épurateur
dx/dt = N·g·1e3 / V  −  (r / V) · x  −  (q / V) · (x − d(t))
y     = x
```

Trois remarques d'automaticien :

- le système est **bilinéaire** : la commande (à travers r) multiplie l'état.
  Ce n'est pas un modèle linéaire invariant autour d'un point ; c'est un
  modèle linéaire à paramètres variant avec la commande ;
- les paramètres entrent **non linéairement** (1/V, q/V) : pas de moindres
  carrés linéaires directs ;
- d(t) est une **entrée mesurée**, pas un état simulé : on n'a pas besoin du
  volume de Hab-B pour expliquer le Lab. C'est un choix de modélisation
  (section 6).

## 2. Le partage des rôles

| qui | fait quoi | au sens de l'identification |
|---|---|---|
| **le modèle de langage** (le constructeur) | choisit les nœuds, les liaisons et les formules ; décide ce qu'il faut changer quand un candidat échoue | **choix de la structure M**, et sa révision |
| **le code** (le harnais) | estime θ dans ses bornes, fait tourner chaque essai dans le bac à sable, mesure l'écart | **estimation des paramètres**, **critère** |
| **le code** (le validateur) | n'accepte qu'un candidat dont l'écart calculé est sous le seuil | **validation** |
| **l'opérateur** | fixe le seuil d'acceptation | le **critère d'acceptation**, une décision humaine |

Le modèle ne règle jamais un nombre à la main, et ne se note jamais
lui-même. Il décide ce qu'un automaticien déciderait en regardant les
résidus : « il manque un terme ».

## 3. Le critère : l'erreur de simulation

Pour un jeu de paramètres, le harnais simule le graphe sur toute la durée de
la télémétrie (pas de 6 s, un échantillon par minute), à partir de l'état
initial mesuré, avec les entrées mesurées, et calcule par colonne comparée :

```
RMSE = sqrt( (1/N) · Σk ( ŷ(k) − y(k) )² )        et le pire écart, avec sa minute
```

C'est un critère d'**erreur de sortie** (output error, simulation libre sur
tout l'horizon), et non d'**erreur de prédiction** à un pas (PEM, ARX). Le
choix est volontaire : on veut un modèle qui simule bien sur trente minutes,
puisqu'on lui posera des questions sur trente minutes. Le prix : un critère
non convexe en θ, et plus sensible aux erreurs de structure qu'aux bruits.

## 4. Les estimateurs, interchangeables

L'estimateur se choisit par candidat (`estimator` dans `graph.evaluate`).
Tous répondent à la même question : des bornes pour les inconnues, une
fonction de coût, un budget de simulations. Tous rendent la même chose : le
meilleur point, son coût, et tous les points essayés. Code :
`harness/topics/graph/fit.ts`.

| estimateur | principe | coût | forces | limites |
|---|---|---|---|---|
| `grid` | toutes les combinaisons de niveaux régulièrement espacés dans les bornes (5 par défaut) | niveaux ^ paramètres simulations : 25 pour 2 paramètres, 125 pour 3 (refusé au-delà du budget, 80) | exhaustif sur ses niveaux ; montre la forme du coût (une vallée étroite, une crête : un paramètre mal fixé par les données) | aveugle entre ses niveaux ; explose avec le nombre de paramètres ; la précision est celle du pas |
| `nelder-mead` (par défaut) | recherche du simplexe sans dérivée dans la boîte des bornes, partie du meilleur point d'un échantillon grossier (9 points pour 2 paramètres) | 10 à 20 simulations par paramètre ; 40 par défaut, 80 au plus | peu coûteux ; précis quand le coût est régulier ; insensible au bruit de calcul | **local** : peut s'arrêter dans une vallée qui n'est pas la plus profonde (l'échantillon de départ ne fait que rendre ce cas moins probable) ; ne dit rien de la précision de chaque paramètre ; lent quand les paramètres ont des échelles très différentes (les bornes normalisent, en partie) |

Limites communes, à dire avant qu'on nous les objecte :

- **aucun modèle de bruit** : le coût est une somme de carrés brute, pas une
  vraisemblance ; pas de pondération par la précision du capteur ;
- **aucun intervalle de confiance** : on rend un point, pas une incertitude.
  Deux paramètres corrélés (V et q, V et τs) peuvent donner le même coût
  (section 5) sans que l'estimateur le signale ;
- **aucun test d'identifiabilité** : rien ne vérifie, avant l'estimation,
  que les données peuvent séparer les paramètres ;
- **bornes dures** : un optimum au bord des bornes est rendu tel quel ; le
  constructeur est prévenu (la fiche de méthode le dit) mais le code ne
  l'interdit pas.

Estimateurs qu'on pourrait ajouter derrière la même interface :
Levenberg-Marquardt (dérivées par différences finies, et la jacobienne donne
au passage l'information de Fisher, donc une incertitude locale) ; multistart
(plusieurs Nelder-Mead depuis des points différents) ; CMA-ES pour des coûts
plus accidentés ; une estimation bayésienne (MCMC) quand on voudra une
distribution des paramètres plutôt qu'un point.

## 5. Identifiabilité : ce que l'essai à deux pas permet de séparer

L'essai de mise en service fait deux échelons de commande : 30 % puis 100 %,
sas fermé. Sur chaque palier, avec d(t) à peu près constant, le Lab tend vers
un équilibre avec une constante de temps :

```
palier à 30 %  :  τ1 = V / (0,3·Qe + q)        x∞1 = (N·g·1e3 + q·d) / (0,3·Qe + q)
palier à 100 % :  τ2 = V / (Qe + q)            x∞2 = (N·g·1e3 + q·d) / (Qe + q)
```

**Avec Qe connu** (la fiche), deux paliers donnent deux constantes de temps,
donc deux équations pour deux inconnues (V, q) : elles sont séparables. C'est
la raison physique du refus du premier candidat. Sans le terme q, le rapport
τ1/τ2 vaut forcément 1/0,3 ≈ 3,3 ; les données donnent un autre rapport,
(Qe + q)/(0,3·Qe + q), plus petit, et aucun volume ne peut réconcilier la
montée et la descente.

**Si Qe ou τs sont laissés libres**, la séparation disparaît : un Qe ou un
retard ajustés absorbent l'effet de q, et une structure fausse passe sous le
seuil. C'est exactement ce que nous avons observé lors d'un essai réel du 24
septembre : le constructeur a laissé le retard libre, et le Lab seul est
passé à 21,7 ppm sous un seuil de 25, avec un volume faux (35 m³ au lieu de
30). D'où la règle, écrite dans la fiche de méthode et dans le prompt : **ce
que la documentation donne est connu et n'est pas ajusté**. C'est une règle
d'identifiabilité déguisée en règle de méthode, et nous aimerions qu'elle
devienne un contrôle (section 9).

Ce qu'un seul palier ne permet pas : avec une seule constante de temps, V et
q ne se séparent pas (seul V/(Qe·u + q) est vu). L'essai à deux pas est donc
le minimum ; c'est aussi la décision prise le 23 septembre pour d'autres
raisons (le temps, l'enveloppe de sécurité), et il se trouve qu'elle est
juste du point de vue de l'excitation.

## 6. Validation de la structure

**Ce qui est fait.** Un candidat est accepté quand son RMSE sur le Lab est
sous le seuil de l'opérateur (25 ppm dans l'exemple). Chaque candidat est
gardé avec ses résidus, rejetés compris ; le graphe d'un candidat rejeté
reste une preuve. Mother dit chaque verdict.

**Ce qui manque, et que nous savons manquer :**

- **le seuil n'est pas relié au capteur.** La précision annoncée des capteurs
  est d'environ 30 ppm + 3 % ; un seuil de 25 ppm sur le RMSE est un choix de
  l'opérateur, pas une conséquence de la mesure ;
- **pas d'analyse des résidus.** Un modèle peut passer le seuil avec des
  résidus structurés : corrélés dans le temps, ou corrélés avec l'entrée.
  Les tests classiques (blancheur des résidus, intercorrélation
  résidus-entrée) détecteraient une dynamique manquante même sous le seuil,
  et auraient refusé le candidat « retard libre » de la section 5 ;
- **pas de principe de parcimonie.** Le second candidat a un paramètre de
  plus que le premier ; comparer des structures demanderait un critère qui
  pénalise la complexité (AIC, BIC) ;
- **pas de validation croisée.** Le modèle est estimé et jugé sur le même
  essai. Un second essai (autre séquence de commande, autre occupation)
  devrait servir de jeu de validation ;
- **le domaine de validité n'est pas encore écrit dans le graphe.** Le
  jumeau a été identifié à 30 % et 100 %, sas fermé, deux occupants ; en
  dehors, il extrapole. La spécification demande qu'il refuse de répondre
  hors de ce domaine (section 12 de `mise-en-service.fr.md`).

**d(t) mesuré, un choix à discuter.** Le CO2 de Hab-B entre comme une entrée
mesurée. C'est simple et suffisant pour expliquer le Lab pendant l'essai.
Pour que le jumeau réponde à des questions sur l'avenir, il faudra prévoir
d(t), donc modéliser Hab-B (son volume, ses occupants) ou supposer son
évolution. Le choix entre « entrée mesurée » et « état simulé » change ce que
le jumeau peut dire.

## 7. À quoi sert le jumeau, en commande

Le jumeau sert à évaluer des stratégies de vitesse (« si je ralentis à 40 %
pendant deux heures, où va le CO2 ? »), c'est-à-dire comme modèle de
prédiction pour une couche de supervision. Ce n'est pas lui qui commande :

| couche | rôle | au sens de la commande |
|---|---|---|
| la carte (firmware) | refuse les commandes hors enveloppe, force la pleine vitesse en CRITICAL | **couche de sécurité**, sans modèle, prioritaire |
| l'agent | choisit une vitesse, en interrogeant le jumeau | **couche de supervision**, à horizon glissant (proche de la commande prédictive, sans optimiseur formel) |
| le jumeau | prédit | **modèle de prédiction**, identifié |
| l'usine | fabrique et révise le jumeau | **identification**, hors ligne |

La propriété d'inversion du projet (plus une chose raisonne, moins elle a le
droit d'agir) se lit ici comme une hiérarchie classique : la couche la plus
simple a le dernier mot. Une erreur du modèle identifié dégrade la
performance de la supervision ; elle ne peut pas violer l'enveloppe, que la
carte tient sans modèle.

## 8. Ce qui est construit, ce qui ne l'est pas

| pièce | état |
|---|---|
| structure écrite par le modèle, formules sur des variables, entrées mesurées (`$expr`, `$series`, `$first`) | construit (`params.ts`) |
| critère d'erreur de simulation, par colonne, avec le pire écart | construit (`evaluate.ts`) |
| estimateurs interchangeables : `grid`, `nelder-mead` | construits (`fit.ts`), testés sur la même fonction |
| constantes connues depuis la fiche technique et la topologie de la station | construit (bibliothèque) ; règle écrite, pas encore un contrôle |
| boucle sur l'écart : candidat, verdict, révision de structure | construit ; essais réels sur Claude Haiku 4.5 |
| incertitude des paramètres, identifiabilité, analyse des résidus, parcimonie, validation croisée, domaine de validité | **non construit** (sections 4 à 6) |
| monde à deux volumes dans le substrat (le CO2 en masse) | non construit ; un monde de remplacement en code produit la télémétrie (`harness/stand-in/`) |

## 9. Questions pour le Dr Grigoriadis

1. **Erreur de sortie ou erreur de prédiction.** Pour un modèle destiné à
   simuler trente minutes en boucle ouverte, le critère d'erreur de sortie
   est-il le bon choix, ou faut-il estimer en erreur de prédiction puis
   valider en simulation ?
2. **Plan d'expérience.** Deux échelons (30 %, 100 %) suffisent en théorie à
   séparer V et q quand Qe est connu. Quelle séquence de commande, dans
   l'enveloppe de sécurité (jamais sous 30 %, CO2 sous 3200 ppm), maximise
   l'information sur (V, q) ? Une séquence binaire pseudo-aléatoire entre
   30 % et 100 % ferait-elle mieux, à durée égale ?
3. **Identifiabilité comme garde.** Peut-on transformer la règle « ce qui est
   documenté n'est pas ajusté » en un contrôle calculé avant l'estimation
   (rang de la matrice de sensibilité, conditionnement de l'information de
   Fisher sur la trajectoire nominale), qui refuse une structure dont les
   paramètres ne sont pas séparables par l'essai ?
4. **Le seuil d'acceptation.** Comment relier le seuil au bruit et à la
   précision des capteurs (30 ppm + 3 %) plutôt qu'à un choix de l'opérateur ?
   Faut-il un test statistique sur les résidus plutôt qu'un seuil sur le RMSE ?
5. **Choisir entre structures.** Quand le modèle de langage propose plusieurs
   structures, quel critère de sélection vous paraît le plus sûr (AIC, BIC,
   validation croisée sur un second essai) ?
6. **Bilinéarité.** Le système est bilinéaire (la commande multiplie l'état).
   Cela change-t-il le plan d'expérience ou le choix de l'estimateur ?
7. **Incertitude et commande robuste.** Si l'estimation rendait un ensemble
   d'incertitude sur (V, q) plutôt qu'un point, comment l'exploiter pour une
   supervision robuste (une loi de vitesse garantie sur tout l'ensemble, par
   exemple par une formulation à inégalités matricielles linéaires) ?
8. **Identification en boucle fermée.** Plus tard, le jumeau sera réidentifié
   pendant l'exploitation, alors que l'agent commande l'épurateur d'après ce
   même jumeau et que la carte force parfois la pleine vitesse. Quelles
   précautions pour une identification en boucle fermée dans ces conditions ?
