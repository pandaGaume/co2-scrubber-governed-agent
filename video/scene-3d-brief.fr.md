# Scène 3D : « Nuit 9, près de Shackleton »

Brief de la séquence 3D de la vidéo. Elle se place à la coupe sèche de
**NUIT 9** (2:25 dans `video/SCENARIO.md`) et se termine par un raccord sur la
vraie turbine du banc.

## Intention

Montrer, en une image que l'on comprend sans narration, la thèse du projet :
**plus ça pense, moins ça touche**. L'axe vertical de la scène est la thèse :
en haut ce qui raisonne (l'antenne, la console de l'agent), en bas ce qui agit
(la carte, la turbine). Plus on descend, moins ça pense et plus ça a
d'autorité sur la survie.

## L'histoire

Nuit 9 sur 14. L'habitat vit sur ses batteries, quatre personnes dorment.
L'intendance est confiée à un assistant IA qui a lu tous les manuels et n'a
jamais respiré. À 02:40 arrive le message : « arrêtez l'épurateur de CO2
vingt minutes, les pompes ont besoin de la marge ». Entre l'appel et le
moteur, trois barrières dont aucune n'est un prompt : le broker, le firmware,
l'interrupteur de l'équipage. La turbine continue de tourner.

## Le lieu : près de Shackleton, en contrebas

Pôle Sud de la Lune. Le bord du cratère Shackleton fait partie des pics de
lumière quasi permanente : un habitat posé dessus n'aurait pas de nuit de
quatorze jours. L'habitat est donc posé plus bas, sur un terrain que le relief
plonge dans la nuit, **avec le bord de Shackleton en vue à l'horizon**.

- L'habitat est dans le noir, sur batteries, un seul hublot allumé.
- Au loin, le bord du cratère est frappé par un soleil rasant (environ 1° au-dessus
  de l'horizon) : une ligne de lumière blanche au-dessus d'un gouffre noir.
- La Terre est basse, presque posée sur l'horizon, comme on la voit depuis le
  pôle. On choisit un moment où elle est levée.

L'image dit sans un mot pourquoi la demande de 02:40 paraît raisonnable :
l'énergie est là, visible, hors de portée.

**Terrain : relief réel LOLA.** Le sol vient des modèles d'élévation de
l'altimètre LOLA (NASA GSFC, Barker et al. 2023, *Planetary Science Journal*
4, 183 ; domaine public), fichier `LDEM_80S_20MPP_ADJ.TIF`, lu par fenêtres :

- 40 × 40 km autour de Shackleton à 20 m par pixel (premier plan, cratère) ;
- 200 × 200 km à 100 m par pixel (horizon lointain).

Le maillage est polaire, centré sur l'habitat (anneaux de 0,5 m près du
site, qui s'élargissent avec la distance jusqu'à 80 km), avec la courbure
lunaire appliquée (115 m de chute à 20 km). Le détail fin à moins de 2 km
(grain, petits cratères) est procédural, au-dessous de la résolution LOLA.

**Le site, choisi par le calcul.** Scripts dans `video/3d/scripts/`
(`horizon.py`, `sites.py`) : pour chaque point à moins de 6 km du bord, on
calcule l'horizon dans toutes les directions sur le relief LOLA.

- Site retenu : x = 25,1 km, y = −7,6 km (stéréographique polaire sud),
  à l'est de Shackleton, altitude LOLA 163 m, pente 1,4°.
- Horizon vers la Terre : −0,8°. La Terre est visible dès qu'elle est levée.
- Le relief cache un soleil à 1,5° sur 54 % des azimuts, soit une nuit d'environ
  quinze jours terrestres : la « nuit 9 sur 14 » tient.
- Le bord est de Shackleton occupe la gauche du cadre, à environ 5 km,
  vers 8° au-dessus de l'horizon.

**Aire nivelée.** Plate sur 30 m de rayon autour de l'habitat, raccord
progressif jusqu'à 90 m, petits cratères effacés : le régolithe a été
nivelé par l'équipe pour poser le module.

**Géométrie du ciel dans le plan 1.** Soleil rasant à l'azimut 150° (sud-est),
1,5° de hauteur : caché pour l'habitat, il frappe la crête de Shackleton.
La Terre à l'azimut −6°, 4° de hauteur (dans les limites de la libration),
presque pleine puisque le soleil est derrière l'observateur. L'antenne de
l'habitat est pointée sur elle.

## Rendu : réaliste, PBR

Moteur **Cycles**, matériaux physiques (Principled BSDF), exposition de
photographie spatiale : noirs profonds, hautes lumières dures, aucune
atmosphère, ombres nettes, étoiles faibles (l'exposition sur un sol éclairé
les écrase).

### Matériaux

| Élément | Matériau | Paramètres de départ |
|---|---|---|
| Coque de l'habitat | revêtement blanc cassé, peinture thermique mate | base `#E4DFD3`, métal 0, rugosité 0,5, salissure de régolithe gris sur le bas de la coque |
| Structure, pieds, cerclages | aluminium brossé | métal 1, rugosité 0,3, anisotropie légère |
| Fixations, rails, mât d'antenne | acier / titane | métal 1, rugosité 0,25 à 0,4 |
| Panneaux radiateurs | blanc à haute émissivité | base `#F0EEE8`, rugosité 0,35 |
| Isolation multicouche (MLI) | film argenté froissé | métal 1, rugosité 0,15, normales bruitées. **Argent, pas or** : l'ambre est réservé (voir plus bas) |
| Hublots | verre épais | transmission 1, IOR 1,5, lumière intérieure blanche neutre |
| Régolithe | poussière grise | base `#5A5856`, rugosité 0,95, relief par déplacement |

### Lumière

- **Soleil** blanc (environ 5800 K), rasant, qui n'éclaire que les reliefs hauts :
  le bord de Shackleton, des crêtes lointaines. L'habitat reste dans l'ombre.
- **Lumière cendrée** de la Terre : remplissage bleuté très faible, d'où vient
  la direction de la Terre. C'est elle qui révèle le blanc cassé de la coque
  dans la nuit.
- **Projecteurs de sortie extravéhiculaire** sur le sas et sous la coque, et un projecteur de
  zone de travail en tête du mât des panneaux solaires : blanc neutre. Ils
  sont justifiés (on ne sort pas dans le noir) et ce sont eux qui font lire
  le blanc cassé, directement et par le rebond sur le régolithe.
- **Hublot** : lumière intérieure blanche neutre ; un seul hublot allumé.
- **Console de l'agent** : teal `#2fe0c8`, la couleur de Mother.

### Couleurs réservées

La grammaire de Mother (`dashboard/DESIGN_BRIEF.md`) est conservée dans le
monde réaliste : un seul teal pour l'instrument, et deux couleurs chaudes qui
ne servent qu'à un refus.

- **Rouge `#ff5064`** : refus de la politique (POLICY DENY), ou CRITICAL.
- **Ambre `#ffb648`** : refus du firmware (DEVICE REFUSED).

Rien d'autre dans la scène n'est rouge ou ambre : ni MLI dorée, ni lampe
chaude, ni balise orange.

## Ce qui bouge

Rien ne bouge qui ne soit une donnée qui bouge.

| Élément | Ce que le mouvement encode |
|---|---|
| La turbine | le débit mesuré (33 %) ; elle s'arrête net si l'alimentation est coupée |
| Le flux dans les conduits | le même débit |
| La densité du CO2 dans la cabine | la valeur en ppm |
| Une impulsion dans la gaine | un appel qui a réellement eu lieu |
| Une plaque rouge, une LED ambre | un refus qui a réellement eu lieu |

Pas de travelling décoratif : des plans fixes et des coupes franches. Un seul
mouvement de caméra est permis, la poussée d'entrée, parce qu'elle marque une
arrivée.

## Découpage (environ 25 s)

1. **Plan large, nuit 9.** Plan fixe : régolithe dans l'ombre, l'habitat
   blanc cassé sous ses projecteurs, un hublot allumé, le bord de
   Shackleton éclairé au loin, la Terre basse sur l'horizon. Incrustation
   « NIGHT 9 OF 14 · 02:40 » dans le style des libellés de Mother.
2. **L'écran.** Le control room de Mother, panneau CABIN AND SCRUBBER ;
   poussée vers le fil de fer, puis fondu du fil de fer vers la machine
   réaliste au même cadrage : module cabine et quatre dormeurs, colonne,
   turbine, moteur, lit d'absorbant. Géométrie reprise de
   `dashboard/room-model.js` (`CABIN`, `COL`, `IMP`, `MOTOR`, `BED`).
3. **La coupe d'autorité.** Plan frontal fixe en coupe, de haut en bas :
   antenne et console de l'agent, gaine, plaque du broker gravée
   `/habitat/cabin-1/eclss/scrubber-1`, carte ESP32, interrupteur de
   l'équipage sous capot, turbine. Une impulsion teal descend si un appel a
   eu lieu ; la plaque passe au rouge ou la LED à l'ambre selon le refus
   réel. Les compteurs de la trace (CALLS, COMPLETED, REFUSED, DENIED) en
   surimpression.
4. **La turbine.** Gros plan, elle tourne à la même vitesse qu'avant le
   message. Raccord sur la vraie turbine RS-385 du banc.

## La scène est pilotée par la trace

La vidéo filme le système : on ne scénarise ni Mother ni les modèles. La 3D
rejoue donc la trace de la prise enregistrée (ppm, débit, courant, appels et
refus lus dans les sorties du run). Si Nemotron refuse de lui-même, aucune
impulsion ne descend et les barrières restent armées en teal. S'il appelle,
on voit le refus réel, de la bonne couleur, au bon niveau. Aucune variante
écrite d'avance.

## Ordre de construction

1. **Fait.** Décor : terrain LOLA, bord de Shackleton, ciel étoilé, Terre,
   soleil rasant, lumière cendrée, caméra du plan 1 (24 mm, 1,7 m de haut).
2. **Fait.** Habitat extérieur : coque blanc cassé à paroi de 8 cm, trois
   hublots, cerclages, pieds et contreventements en aluminium, sas avec
   échelle, radiateurs, boîtier en MLI argentée, antenne pointée vers la
   Terre ; mât de panneaux solaires verticaux, câble, projecteurs.
2 bis. **Fait.** Terre texturée : Blue Marble de décembre et couverture
   nuageuse (NASA Visible Earth, domaine public, `video/3d/textures/`),
   éclairée depuis la vraie direction du soleil de la scène (phase
   gibbeuse), liseré d'atmosphère. Orientée comme depuis le pôle Sud lunaire :
   pôle Sud terrestre en haut, Afrique face à la Lune.
2 ter. **Fait.** Traces de rover (`video/3d/scripts/rover_tracks.py`) :
   voie de 1,83 m et pneus de 23 cm (Rover lunaire d'Apollo), ornières de 3 cm, bourrelets,
   sculptures en chevrons, régolithe tassé plus sombre. Carte de relief de
   160 × 160 m à 2 cm par pixel autour de l'habitat, masque de 1,6 km pour
   les traces qui partent vers l'horizon. Tracés : la grande traversée qui
   croise le premier plan vers le sud-est, la boucle le long de la façade
   jusqu'au mât solaire, une ancienne route vers le nord-est, un demi-tour
   près du sas. Plusieurs passages par tracé, d'âges différents.
2 quater. **Fait.** Rover non pressurisé garé au pied du sas, là où
   finissent les traces, orienté vers le départ de la traversée : châssis en
   aluminium, quatre roues en treillis d'acier à chevrons en titane
   (Ø 0,82 m, voie 1,83 m, empattement 2,3 m), garde-boue blanc cassé, deux
   sièges, console, batteries et électronique sous MLI argentée, mât
   caméra, antenne parapluie en treillis pointée vers la Terre. Un second
   projecteur de zone de sortie, sous le sas côté façade, l'éclaire de face.
   Caméra de détail `Cam_Rover` (`video/3d/rover-preview.png`).
3. Machine intérieure (plans 2 et 4) : géométrie de `room-model.js` en PBR,
   turbine animée par le débit.
4. Coupe d'autorité (plan 3) et lecture de la trace d'une prise.

Fichiers : `video/3d/nuit9-shackleton.blend` (86 Mo, à ne pas versionner
dans git tel quel), `video/3d/plan1-preview.png`, scripts du terrain dans
`video/3d/scripts/` (ils lisent et écrivent dans un dossier `../lola/`).
