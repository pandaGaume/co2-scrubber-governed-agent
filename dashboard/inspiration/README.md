# Inspiration pour l'interface

*Réunies par Guillaume le 22 septembre 2026, quand on a décidé d'abandonner
le pixel-art des années 1990 pour du futuriste dans les tons bleus. Le brief
actuel (`dashboard/DESIGN_BRIEF.md`) est écrit de bout en bout autour du
pixel-art : il est à refaire, pas à retoucher.*

**Ce ne sont pas des ressources.** Ces images viennent de banques d'images et
de portfolios, elles servent de référence entre nous et rien de plus. Aucune
ne part sur la page publiée, aucune ne se recopie. Ce qu'on en garde, ce sont
les règles ci-dessous.

## Les trois qui comptent vraiment

| image | ce qu'on prend |
|---|---|
| [03 SIRIUS](03-sirius-system-overview.webp) | **La plus proche de ce qu'il nous faut.** Fond presque noir, une seule teinte froide tenue partout, et une couleur chaude employée trois fois dans tout l'écran. De la densité de données sans décoration. Ça se lit comme un instrument, pas comme une affiche de film. C'est le modèle |
| [01 InGen](01-ingen-incubation-pod.png) | La carte « Live Monitoring » : une courbe fine, une ligne d'état en dessous (« Genome Integrity : Stable »), et à côté un grand nombre avec son écart à une référence (« 1.41 vs Baseline 1.45, -2.8 % »). **C'est exactement notre carte du résidu** : prédit, mesuré, seuil. À voler tel quel |
| [02 CRETAX](02-cretax-genome-map.webp) | Deux choses. Les étiquettes qui pointent des endroits précis d'un objet au centre : c'est notre graphe avec ses nœuds annotés. Et la colonne de gauche, quatre chiffres courts sous un titre : c'est notre ligne de battement (tick, situation, rejeu, raisonneur, usine) |

## Les autres

[04](04-hud-elements-blue.jpg), [06](06-hud-frames-pack.jpg),
[08](08-hud-dashboard-alert.jpg), [09](09-hud-projector-rings.jpg),
[11](11-hud-cyan-scanner.jpg) sont des planches d'éléments HUD.
[05](05-grid-background-blue.jpg) est une trame de fond.
[07](07-orbital-panels-orange.jpg) et [12](12-cockpit-orange.jpg) donnent
l'ambiance cockpit. [10](10-hud-red-alert.jpg) donne l'état d'alerte en
rouge.

On y prend : les cadres à coins coupés, les filets fins, la trame de fond
très discrète, la typographie condensée en capitales pour les étiquettes.

**On n'y prend pas les réticules ni les cercles qui tournent.** Ils ne
mesurent rien. Devant un jury d'ingénieurs, un anneau qui tourne sans raison
dit « c'est une maquette » plus fort que n'importe quelle phrase du
narrateur. La règle du dépôt vaut aussi pour les pixels : **ce qui bouge à
l'écran doit être une donnée qui bouge.**

## Les règles qu'on en tire

1. **Fond presque noir, une seule teinte froide.** Cyan ou bleu-vert, tenue
   partout. Pas deux bleus qui se disputent.
2. **Le chaud est réservé.** L'ambre ne sert qu'au refus, le rouge qu'à
   CRITICAL. Si on les emploie pour décorer, ils ne veulent plus rien dire au
   moment où il faut qu'ils veuillent dire quelque chose. C'est ce que SIRIUS
   fait bien et ce que la plupart des planches HUD font mal.
3. **Un héros par écran.** La courbe prédit contre mesuré, grande, en haut,
   tout le temps. Le reste est secondaire par construction.
4. **Un grand nombre, un écart, une ligne d'état.** Le motif d'InGen, répété
   partout où il y a une mesure : la valeur, sa référence, et un mot qui dit
   si ça tient.
5. **Rien ne bouge sans donnée derrière.** Pas de balayage, pas de
   scintillement, pas d'anneau. Les seules animations autorisées sont une
   valeur qui change, une courbe qui avance, un panneau qui apparaît parce
   qu'un événement a eu lieu.
6. **Chaque élément dit d'où il vient.** Règle héritée du brief actuel et qui
   ne change pas : une ligne d'explication lisible sur place, jamais au
   survol, parce que le survol n'existe pas sur une vidéo.
7. **Lisible à trois mètres, et sur une vidéo compressée.** L'état de la
   cabine se lit en moins d'une seconde, une ligne de trace en deux.

## Ce que ça change pour le panneau des signes vitaux

Le motif InGen s'applique directement : un grand nombre (le rythme), son
écart à la bande nominale, et un mot d'état. Plus le tachogramme, un trait
par battement à son espacement réel (`slots/biomed/README.md` dit pourquoi ce
n'est pas un tracé d'ECG : la ceinture ne donne pas d'ECG sur le service
standard, et on ne dessine pas une donnée qu'on n'a pas).

Et le panneau n'est pas un meuble permanent : il apparaît quand le commandant
autorise l'essai, il disparaît à la fin. Son apparition est elle-même le
signal que des humains sont exposés.
