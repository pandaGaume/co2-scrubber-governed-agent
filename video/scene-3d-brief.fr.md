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
atmosphère, ombres nettes.

### Le ciel

Le vrai ciel, à sa vraie place. À l'œil, depuis l'ombre, il est
spectaculaire ; un appareil réglé pour l'habitat éclairé et la Terre pleine
n'en capterait presque rien (comme sur les photos Apollo). Le montrer est un
choix assumé de pose longue, tenu **discret** : la Voie lactée reste sous
la Terre et sous la coque éclairée en luminosité.

- Source : NASA SVS, *Deep Star Maps 2020* (Gaia, Hipparcos, Tycho ;
  domaine public), coordonnées équatoriales J2000 : `milkyway_2020_4k.exr`
  pour la Voie lactée diffuse, `hiptyc_2020_16k.exr` réduite en 8k
  (`hiptyc_2020_8k_sum.exr`, somme 2 × 2 qui conserve le flux de chaque étoile,
  demi-précision) pour les étoiles brillantes.
- Orientation : le pôle Sud lunaire regarde vers le pôle Sud de
  l'écliptique, l'horizon suit l'écliptique. Les longitudes sont calées
  sur la scène (soleil à l'azimut 150°, Terre à −6°). Conséquences, vérifiées
  au rendu : le Grand Nuage de Magellan est presque au zénith (85°), la Croix du
  Sud à 50°, et le centre galactique se lève à 5,5° à l'azimut −60°,
  juste derrière le bord de Shackleton. Dans le plan 1, la Voie lactée
  monte de la crête vers la gauche.
- La matrice monde → écliptique → équatorial est appliquée dans le shader
  du monde par trois produits scalaires ; le ciel n'éclaire pas la scène
  (rayons caméra seulement).

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
   près du sas. Plusieurs passages par tracé.
   **Pas de vent sur la Lune : rien ne s'efface.** Les anciennes traces sont
   aussi nettes que les récentes, seulement recouvertes par endroits.
   **Le module est une zone de chantier** (même script) : les stries de
   nivellement de la lame en bandes sur l'aire, les ornières larges (voie
   2,6 m) de l'engin qui l'a mis en place, en boucles autour du module et
   arrivant de l'est.
   **Les empreintes de l'équipage** : semelle de surbotte type Apollo
   (environ 33 × 13 cm, barrettes transversales, 1,5 à 2,5 cm de profondeur, talon
   plus marqué, petit bourrelet, régolithe tassé plus sombre) ; pas alternés
   de 0,75 m environ, parfois le saut à pieds joints. L'aire entière
   piétinée, autour du module, sous la coque et aux six pieds (les vérins
   calés à la main), des tours complets du module ; un piétinement serré au
   pied de l'escalier ; des allers-retours vers le mât du projecteur et
   autour de sa base ; des tours du rover et des allers-retours entre
   l'escalier et ses sièges ; quatre sorties à pied aller-retour (est, nord
   vers la Terre, sud par le mât, ouest vers Shackleton) jusqu'à 50 à 70 m.
   Le projecteur du sas éclaire de nouveau le pied de l'escalier. Caméra de
   détail `Cam_Footprints` (`video/3d/footprints-preview.png`).
2 quater. **Fait.** Rover non pressurisé garé au pied du sas, là où
   finissent les traces, orienté vers le départ de la traversée : châssis en
   aluminium, quatre roues en treillis d'acier à chevrons en titane
   (Ø 0,82 m, voie 1,83 m, empattement 2,3 m), garde-boue blanc cassé, deux
   sièges, console, batteries et électronique sous MLI argentée, mât
   caméra, antenne parapluie en treillis pointée vers la Terre. Un second
   projecteur de zone de sortie, sous le sas côté façade, l'éclaire de face.
   Caméra de détail `Cam_Rover` (`video/3d/rover-preview.png`).
2 quinquies. **Fait.** Vidéo de survol `video/3d/nuit9-shackleton-flyby.mp4`
   (1920 × 1080, 24 i/s, 696 images, 29 s, H.264), caméra `Cam_Flyby`
   visant le centre de la station (`Station_Target`) :
   approche de 10 s à 1,7 m du sol le long des ornières de la grande
   traversée, montée verticale de 5 s jusqu'à 32 m, tour complet de 14 s
   à 16,6 m de rayon ; vitesses nulles aux deux transitions, flou de bougé
   (obturation 0,35). Projecteur en tête du mât d'antenne pour le toit.
   Rendu sans interface : `scripts/render_setup.py` (reprend là où il
   s'est arrêté), encodage : `scripts/encode_mp4.py` (séquenceur de
   Blender, pas de ffmpeg). Images dans `video/3d/render/flyby/`
   (environ 1,7 Go, à ne pas versionner).
3. **Fait, première version.** Machine intérieure (plans 2 et 4), scène
   Blender « Machine » du même fichier, construite par
   `scripts/build_machine.py` :
   - géométrie de `dashboard/room-model.js` à l'identique (une unité =
     0,5 m) : cabine et ses deux fonds, conduits aller et retour aux mêmes
     tracés (coudes arrondis, brides), colonne, turbine à six pales
     vrillées (mêmes rayons, même vrillage de 0,42 rad), moteur, arbre,
     lit d'absorbant, quatre dormeurs aux positions de la page ;
   - en écorché technique : la moitié tournée vers la caméra est ouverte,
     la tranche a son matériau ; coques blanc cassé, aluminium brossé et
     usiné, acier, moteur noir anodisé, absorbant granuleux, panier perforé ;
   - couche de données en teal (seule couleur saturée) : particules de CO2,
     tirets de flux, anneaux du lit ;
   - caméra du plan 2 (`Cam_Plan2`) : la projection du canvas de Mother
     (lacet −0,58, tangage 0,30, distance 15, cadrage à 63 % de la largeur
     centré à 33,5 %). La projection de la page est l'image miroir d'une
     caméra physique : le modèle est monté en miroir pour que le rendu
     tombe exactement sur le fil de fer de l'écran. Elle regarde la machine
     légèrement par en dessous, comme la page ;
   - caméra du plan 4 (`Cam_Plan4`) : la turbine de près, profondeur de
     champ à f/2,8.

   **La machine bouge par les lectures, rien d'autre.**
   `scripts/bake_reading.py` lit un fichier de lectures du tableau de bord
   et reprend les encodages de la page :
   - la turbine tourne à 3,4 rad/s × débit/100 (un tour toutes les
     5,6 s à 33 %) et s'arrête net sans alimentation ;
   - les tirets de flux avancent à 0,9 cycle/s × débit/100 ;
   - le nombre de particules allumées vaut (ppm − 400)/4 600 × 260 ;
   - les anneaux du lit montent jusqu'au résidu/0,1, en ambre si le lit
     est chaud ;
   - la couleur suit le mot d'état que la carte a envoyé.

   Chaque lecture est tenue jusqu'à la suivante. Lectures actuelles :
   `readings/control-room-capture.json`, la lecture de la capture du
   control room (1 200 ppm NOMINAL, 33 %, 0,150 A, résidu 0,020), tenue
   12 s. **À remplacer par les lectures de la prise enregistrée.**
   Rendu : `scripts/render_machine.py`, vidéos `nuit9-machine-plan2.mp4`
   et `nuit9-machine-plan4.mp4`.
3 bis. **Fait, première version.** L'intérieur de la station
   (`scripts/build_interior.py` pour la coque, `scripts/build_interior_zones.py`
   pour les zones), dans une collection partagée par la scène extérieure et
   une scène « Interior » sans terrain. Le réalisme porte sur le matériel ;
   les humains sont seulement devinés.
   - Coque intérieure : panneaux muraux, sol carrelé, plafond, mains
     courantes bleu-gris anodisé, chemin de câbles, écoutille vers le sas,
     les trois hublots. Éclairage de nuit bas et neutre : ce sont les écrans
     qui éclairent.
   - Quartier d'équipage (paroi +y, côté fond) : quatre couchettes en deux
     superpositions, rideaux à demi tirés, quatre dormeurs dans leurs sacs,
     sans visage.
   - Poste de veille (paroi −y, sous le hublot allumé vu de dehors) :
     l'écran du control center et, à sa gauche, celui du monitoring médical,
     qui jouent **la prise enregistrée** (`the station preview.mp4`,
     3836 × 912, 30 i/s ; recadrage 0–954 px pour le médical, 958–2874 px
     pour le control center ; segment de 1 min 36 à 1 min 50, autorisation du
     commandant et monitoring actif, rééchantillonné à 24 i/s en temps réel
     par `scripts/extract_screens.py`). Clavier, micro, tabouret, et une
     ceinture cardio posée sur le bureau, seule trace d'une personne.
   - Baie de support vie (paroi +y, côté sas) : la colonne SCR-1 dans sa
     baie avec un hublot d'inspection sur la turbine (qui tourne au débit
     lu, `scripts/bake_interior.py`), conduits vers le plafond et le sol ; la
     plaque du broker, en aluminium anodisé gravé
     `/habitat/cabin-1/eclss/scrubber-1`, avec un anneau teal armé ; la
     carte dans son boîtier transparent (module ESP32-S3, pont en H, capteur
     de courant, broches, bornier, LED), étiquetée MIN-FLOW GUARD ; près de
     l'écoutille, l'interrupteur de coupure de l'équipage sous capot
     transparent, éclairé par sa veilleuse.
   - Plans intérieurs, en mouvement (des plans fixes n'apportaient rien
     qu'une image) :
     - I1 → I2, travelling de 14 s (`Cam_I12_Dolly`) : il part sur les
       couchettes, où une veilleuse blanche dessine un dormeur dans son sac,
       avance dans l'allée et finit face aux deux écrans qui jouent la prise ;
     - I3, la baie (6 s, `Cam_I3_Dolly`) : de l'allée jusqu'à la colonne
       SCR-1 ;
     - I4, la descente (10 s, `Cam_I4_Crane`) : un mouvement de grue le long
       de la chaîne d'autorité, plaque du broker, étiquette SCR-1, carte
       MIN-FLOW GUARD, puis la turbine qui tourne derrière le hublot ;
     - I4c, la coupure de l'équipage (4 s, `Cam_I4c_Push`) : lente poussée
       vers l'interrupteur.

     Vidéos : `nuit9-interior-i12_dolly.mp4`, `-i3_bay_dolly`, `-i4_crane`,
     `-i4c_cutoff_push`. Rendu : `scripts/render_interior.py`.
   - Archive : chaque rendu de test est gardé dans `video/3d/archive/<date>/`,
     préfixé par l'heure.
4. Coupe d'autorité (plan 3) pilotée par la trace d'une prise : l'anneau
   de la plaque du broker et la LED de la carte prendront la couleur du
   refus réel (rouge pour la politique, ambre pour le firmware).

Fichiers : `video/3d/nuit9-shackleton.blend` (86 Mo, à ne pas versionner
dans git tel quel), `video/3d/plan1-preview.png`, scripts du terrain dans
`video/3d/scripts/` (ils lisent et écrivent dans un dossier `../lola/`).
