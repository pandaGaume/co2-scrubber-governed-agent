# Ce que disent la NASA et les habitats analogues, et ce qu'on en reprend

*Écrit le 24 septembre 2026. Les sources sont publiques ; leurs valeurs sont
entrées dans la bibliothèque du modèle (`docs/library/nasa-*.md`), avec leur
référence, pour que l'Observateur et les usines les trouvent et les citent.*

---

## 1. Les sources

| source | ce qu'on en tire | fiche |
|---|---|---|
| NASA/TP-2015-218570/REV2, *Life Support Baseline Values and Assumptions Document* (BVAD, 2022), tableaux 3-21, 3-26, 3-27 | le CO2 produit par personne, par activité et par gabarit, avec sa bande | `nasa-crew-metabolic-loads` |
| NASA-STD-3001 Technical Brief OCHMO-TB-004 Rev B, *Carbon Dioxide* (2022) | la limite [V2 6004], ce qu'on a observé en vol, le bilan d'une journée de mission (HIDH 2014) | `nasa-co2-limits`, `nasa-crew-metabolic-loads` |
| OCHMO-TB-002 Rev A, *ECLSS: Human-Centered Approach* (2023) | ventilation contre les poches de CO2 [V2 6107], enregistrement et alertes [V2 6020 à 6022] | `nasa-co2-limits` |
| Lin et al., essais en chambre fermée à JSC, 2006-2007 (ICES) | l'équipage simulé par un **simulateur métabolique** : CO2 injecté à débit régulé | `nasa-scrubber-test-protocols` |
| Knox, Cmarik, Peters, ICES-2021-71 (MSFC, épurateur à 4 lits) | entrée contrôlée, trois cycles par cas, répétabilité mesurée, rendement qui dépend du CO2 d'entrée | `nasa-scrubber-test-protocols` |
| Pütz et al., ICES-2016-170 (ISS dans V-HAB) | l'ISS en dix volumes reliés par des ventilations de 140 cfm, et ce que ce modèle néglige | `nasa-scrubber-test-protocols` |
| SAM, *First run of the 4-bed CO2 scrubber at SAM* (mars 2026) | un protocole en quatre parties de 30 minutes qui sépare les inconnues une à une | `nasa-scrubber-test-protocols` |

Liens : [BVAD Rev2](https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf),
[OCHMO-TB-004](https://nasa.gov/wp-content/uploads/2023/03/co2-technical-brief-ochmo.pdf),
[OCHMO-TB-002](https://www.nasa.gov/wp-content/uploads/2023/07/eclss-technical-brief-ochmo.pdf),
[essais JSC](https://ntrs.nasa.gov/api/citations/20080012541/downloads/20080012541.pdf),
[ICES-2021-71](https://ntrs.nasa.gov/api/citations/20210015255/downloads/ICES-2021-71.pdf),
[ICES-2016-170](https://ntrs.nasa.gov/api/citations/20160003492/downloads/20160003492.pdf),
[SAM](https://moonandmars.space/2026/03/04/first-run-of-the-4-bed-co2-scrubber-at-sam/).

## 2. Les conclusions qui nous concernent

1. **Le CO2 d'une personne est une bande, pas une constante.** Éveillé en
   cabine : 0,48 à 0,81 g/min du 5e au 95e centile, soit environ 0,26 à
   0,45 L/min ; 0,69 g/min pour le membre d'équipage de référence. Le BVAD
   dit lui-même que ces valeurs viennent d'une analyse, avec environ 25 %
   d'écart. Le « 1 kg par jour » est une moyenne de mission, pas le débit
   d'une heure.
2. **On n'essaie pas un épurateur avec des gens dedans quand on peut
   l'éviter.** À JSC, l'équipage est un simulateur métabolique : du CO2
   injecté à débit régulé, de la vapeur d'eau dosée. La source est alors
   connue à la précision du régulateur, et personne ne respire l'essai.
3. **On sépare les inconnues une à une.** SAM, en 2026 :
   - la fuite de la pièce, vide et épurateur arrêté ;
   - puis la production d'un occupant, épurateur arrêté ;
   - puis l'adsorption, puis la désorption.

   Chaque partie isole un terme du bilan avant d'en ajouter un.
4. **Le rendement d'un épurateur dépend de son point de fonctionnement.** À
   MSFC, le débit retiré dépend du CO2 d'entrée et de la régénération (13 %
   de puissance de chauffe en plus, jusqu'à 12 % de retrait en plus). Un
   rendement « constant » est une valeur à une condition.
5. **On mesure la répétabilité avant de conclure.** À MSFC, chaque cas est
   tourné trois cycles complets, avec un écart type d'environ 0,5 % sur six
   cas identiques. Une corrélation apparue en fin de campagne s'est révélée
   fortuite.
6. **La limite est une pression partielle.** [V2 6004] : 3 mmHg en moyenne
   sur une heure ; en dessous de 2,5 mmHg sur 7 jours pour que le risque de
   mal de tête reste sous 1 %. En ppm, cela dépend de la pression totale de
   la cabine : 3 mmHg font environ 3 950 ppm à 101,3 kPa, mais 7 080 ppm à
   56,5 kPa.
7. **Un capteur fixe ne voit pas une poche.** La NASA attribue une part de la
   sensibilité au CO2 en vol à des fluctuations locales que les capteurs
   fixes ne mesurent pas. D'où l'exigence de ventilation [V2 6107] et les
   débits réglables aux postes de couchage.
8. **Entre modules, c'est la ventilation qui mélange.** L'ISS est modélisée
   en dix volumes reliés par 140 cfm (environ 4 m³/min) chacun, sas ouverts.
   L'ISS en dépend : son épuration est centralisée, et c'est cette
   ventilation qui amène l'air de chaque module à l'épurateur. Sas fermé, ce
   que la ventilation passe encore dépend des conduits, et se mesure.

## 3. Ce qu'on a repris (commit `201e837`)

| conclusion | reprise |
|---|---|
| 1 | Fiche `nasa-crew-metabolic-loads`. Une constante connue peut porter sa **bande** (min, max) dans la demande de l'Observateur. `graph.evaluate` n'autorise l'ajustement d'une constante connue que dans sa bande, et refuse une recherche qui en sort, en le disant. Une constante sans bande n'est jamais ajustée. La fiche `co2-mass-balance` renvoie aux valeurs de la NASA à la place de la table que j'avais écrite de mémoire |
| 1 | Le monde de test place ses opérateurs dans la bande de la NASA : 0,42 L/min, un peu au-dessus de la référence de 0,38, comme des gens au travail. Il était à 0,5, hors bande. Hab-B : 0,30 L/min, entre sommeil et éveil |
| 2, 3, 4, 5, 8 | Fiche de méthode `nasa-scrubber-test-protocols`. Elle mesure Volume, AirChange, CO2Generation et RemovalRate, donc `library.methods` la propose quand un volume est à mesurer. Ses règles d'application : séparer les inconnues, préférer une source connue à un équipage, dire à quel point de fonctionnement le rendement vaut, répéter avant de conclure, dire ce que le modèle néglige |
| 6, 7 | Fiche `nasa-co2-limits`. Nos seuils y sont convertis : l'arrêt à 3 200 ppm vaut environ 2,4 mmHg, ELEVATED environ 2,7 mmHg, CRITICAL environ 3,0 mmHg, soit la limite d'une heure de [V2 6004]. Ils sont cohérents à 101,3 kPa |

## 4. Ce qui reste à reprendre, et ce que cela changerait

| conclusion | ce qu'il faudrait | pourquoi ce n'est pas fait |
|---|---|---|
| 2 et 3 | Un **protocole de mise en service par étapes, Lab vide** : d'abord l'échange par la ventilation, sas fermé (injection de CO2, épurateur arrêté), puis l'épurateur à une source connue, sans occupants. Il faut un appareil d'injection au registre (un simulateur métabolique), et un plancher de vitesse qui dépende de l'occupation : le plancher de 30 % protège des gens, un Lab vide n'en a pas besoin | C'est un changement de l'enveloppe de sécurité (`PROCEDURE_ENVELOPE`) et du registre : à décider avec toi, pas en passant |
| 4 | Un rendement d'épurateur qui dépend du CO2 d'entrée, dans le nœud du catalogue et dans la fiche technique | Le nœud est dans le substrat (spikypanda), que je ne touche pas ; c'est aussi une question pour l'automaticien |
| 5 | Répéter une étape du protocole et donner la répétabilité dans le compte rendu | Petit changement du sujet `procedure` ; à faire |
| 6 | La **pression totale de la cabine** dans la topologie de la station, et des seuils écrits en mmHg puis convertis | La station ne documente pas sa pression aujourd'hui. Pour une base lunaire à atmosphère réduite, nos seuils en ppm seraient faux |
| 7 | Le dire dans le compte rendu : une limite tenue sur la moyenne n'exclut pas une poche | À ajouter aux lignes du compte rendu |

Les conclusions 2 et 3 répondent directement à ce que les passages de
l'exemple ont montré : le volume, l'échange par le sas et le débit de
l'équipage se confondent tant que l'essai les fait varier ensemble (voir
`exemple-mise-en-service-2.fr.md`, et la question 8 de
`control-system-questions.md`).

## 5. Le premier passage avec la bibliothèque de la NASA

Exécuté le 24 septembre à 16:55 UTC (journal :
`docs/exemples/2026-09-24-mise-en-service-7-journal.md`). Pour mémoire, les
passages 3 à 6 de la journée, après les corrections du document
`exemple-mise-en-service-2.fr.md` :

| passage | ce qui a changé avant | meilleur jumeau | ce qui l'a arrêté |
|---|---|---|---|
| 3 | constantes connues avec leur source, bibliothèque montrée d'entrée, garde sur les valeurs obtenues sous hypothèse | aucun candidat évalué | le retard écrit comme nom nu (`"tau_scrubber"`), NaN sans explication ; corrigé : un nom nu vaut sa variable |
| 4 | ce correctif | 8 000 ppm | le CO2 de Hab-B (1 500 ppm) câblé dans une émission du Lab (ppm/min) sans échelle q/V ; corrigé : le diagnostic dit ce qui entre dans le nœud à la première minute |
| 5 | ce diagnostic | 134,6 ppm, avec V = 29 à 30 m³ retrouvé (vrai : 30) | 0,35 L/min par personne pris pour une constante ; c'est la moyenne journalière |
| 6 | débit par activité dans la bibliothèque | **16,9 ppm, accepté** | accepté pour de mauvaises raisons : un protocole de 15 minutes seulement, V = 42,5 au lieu de 30, et le débit de l'équipage ajusté librement |
| 7 | la bibliothèque NASA, la règle de la bande | 114 ppm | voir ci-dessous |

Ce que montre le passage 7 :
- **L'Observateur a lu les fiches de la NASA** : la fiche technique, le bilan
  de masse, les débits métaboliques, les limites, l'installation. Mais il a
  rendu la bande en trois constantes séparées (`CO2_awake_min` à 0,26,
  `CO2_awake_ref` à 0,38, `CO2_awake_max` à 0,45) au lieu d'une constante
  avec son min et son max. L'usine n'avait donc pas de bande à respecter, et
  elle a ajusté librement un « débit d'émission de l'équipage ».
- **Sept candidats sur quatorze n'ont pas été construits** : la timeline de la
  vitesse et son câblage vers l'épurateur, encore. C'est la correction
  proposée depuis le premier passage et pas encore faite : donner dans le
  brief la fiche des nœuds retenus, avec un exemple de câblage.
- **Le protocole a une montée de 30 % puis 21 minutes à 100 %.** Le compte
  rendu en tire 83,5 m³ en mettant l'équilibre à 0 : la décroissance a duré
  bien moins d'une constante de temps. La fiche `co2-mass-balance` le dit
  (« a time constant or more »), et la garde du protocole ne le vérifie pas.

Ce que j'en conclus : les données de la NASA sont dans la bibliothèque et
sont lues. Ce qui manque est du côté du harnais :
1. une constante « connue » dont le nom finit par `_min`, `_ref` ou `_max`
   devrait être refusée par la garde, avec la consigne de donner une bande ;
2. les fiches des nœuds avec un exemple de câblage dans le brief de l'usine ;
3. une garde du protocole qui exige une décroissance d'au moins une
   constante de temps prévue ;
4. et surtout le protocole par étapes de la section 4 (Lab vide, source
   connue). C'est ce que font la NASA et SAM, et c'est la seule façon de
   séparer le volume, l'échange et l'équipage. Il demande ta décision sur
   l'enveloppe de sécurité.
