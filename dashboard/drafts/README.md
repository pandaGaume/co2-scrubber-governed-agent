# Brouillons

Ce qui a été fait, écarté, et gardé quand même. Rien ici n'est servi par le
dépôt et rien n'est chargé par une page vivante : ce sont des pièces à
consulter, pas du code en service.

| fichier | ce que c'est | pourquoi c'est ici |
|---|---|---|
| [`panel-pixel-art.html`](panel-pixel-art.html) | la control room en pixel-art des années 1990, quatre colonnes à taille fixe, 1280 x 720 mis à l'échelle par quarts | direction abandonnée le 22 septembre 2026 pour du futuriste en tons froids. Elle tient toujours debout sur `../style.css`, qui sert encore `index.html` et `story.html` |
| [`control-room-a-instrument.html`](control-room-a-instrument.html) | proposition A : la nouvelle langue, mais en panneaux de chiffres | propre, et fade. Elle ressemble à un écran de réglages. Gardée comme repli sobre si la 3D pose un problème de performance ou de lisibilité en vidéo |
| [`control-room-b-flat-machine.html`](control-room-b-flat-machine.html) | proposition B : la machine dessinée une fois, à plat, avec les chiffres accrochés dessus par des amorces | c'est l'idée juste, celle d'InGen et de CRETAX. C'est la B qui a fait accepter le principe ; la C ne fait que la construire en volume |

La retenue est la C, `../prototypes/control-room.html`, et elle est portée
dans `../panel.html`, `../room.css` et `../app.js`.

Les trois parlent la même langue que `../biomed.html` : mêmes `:root`, mêmes
pastilles, mêmes règles. Les trois portent leurs données en dur et un
sélecteur d'états en bas à droite qui le dit ; aucune ne parle au broker.
