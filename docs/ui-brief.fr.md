# Brief de l'interface : le poste de contrôle, un tier du broker, et la vidéo

*Brief du 20 septembre 2026, à valider avant le code. Complète `auto-adaptation.fr.md` (section 6.1, la page est la vidéo) et `../dashboard/DESIGN_BRIEF.md` (la direction artistique, pixel art des années 1990, du 18 septembre), qui reste la référence visuelle. Décision prise avec Guillaume le 20 septembre : la vidéo est l'enregistrement continu de la page ; ce qui arrive de l'extérieur clignote ; chaque étape se voit à l'écran et, quand la carte agit, à l'image de la caméra.*

## 0. Ce que ce document fixe

La page n'est pas un tableau de bord posé à côté du système : elle est un tier du système, un client du broker comme les autres, et elle est ce que le jury verra. Ce brief dit ce qu'elle est (section 1), pour qui et comment on saura qu'elle est réussie (2 et 11), ses règles (3), son écran (4), sa grammaire visuelle (5), ses alertes (6), d'où vient chaque chose affichée (7), ses états (8), ce qu'elle ne fait jamais (9), et l'ordre de construction (10). Rien ne se code avant validation.

## 1. Ce qu'est la page : un tier, pas un tableau de bord

**Le poste de contrôle, Tier 4.** C'est l'écran de l'équipage et de l'opérateur : là où l'on voit, et là où l'on approuve. La page se connecte au broker (`/providers` pour la liste des slots, `/<slot>/mcp` pour chaque slot, comme tout client) avec trois identités, trois sessions, toutes dans la trace du broker :

| identité | ce qu'elle fait | ce qu'elle a le droit d'appeler |
|---|---|---|
| `viewer` | lit tout, reçoit les notifications, ne commande rien | `mcp.tools.read` sur `/habitat/**` ; les ressources (`scrubber://log`, `station://journal`, `twin://reports`, `factory://trace`, `world://scenario`) |
| `operator` | approuve ou refuse ce que la station propose ; tient la régie | `station.approve`, `station.refuse` (`mcp.tools.register` reste à la station elle-même) ; `world.play`, `world.pause`, `world.rate` |
| `tier3` | le harnais de l'agent, qui tourne dans la page pour que le studio le montre | le rôle `tier3` de la politique, inchangé : lecture, actuation sous politique, `factory.request`, `reasoner.decide` ; jamais `power`, `protect`, `register`, `grammar` |

La page n'a aucun bouton vers la carte. Ce que l'opérateur fait passe par la station ; ce que l'agent fait passe par le harnais et la politique ; la carte refuse seule.

**La régie n'est pas un tier.** La barre `DIRECTOR` commande le slot `world` (jouer la nuit, pause, vitesse, position). Le scénario (les minutes de la section 5 de la spécification : les messages de la Terre, les entrées et sorties de personnes, la porte, la dégradation du scrubber 2) est un fichier avec son sha256, joué par le slot `world` ; les messages de la Terre partent du monde, pas de la page. La barre est dessinée à part, avec ce mot, pour que le jury ne confonde jamais ce qui pilote la démo et ce que fait le système.

## 2. Le public et l'épreuve du muet

Le jury : des ingénieurs et des gens qui achètent, sur un portable, une vidéo compressée, vue une fois, parfois sans le son. La page doit donc se comprendre seule, comme l'écran d'un film où l'on sait ce qui se passe avant que le personnage ne le dise.

**L'épreuve du muet.** Une personne extérieure regarde la vidéo sans le son, une fois, et doit répondre à cinq questions : qui commande ? qu'a demandé l'agent ? qu'est-ce qui a été refusé, et par qui ? qu'est-ce qui a été fabriqué, et qui l'a jugé ? que s'est-il passé la seconde fois que la porte s'est ouverte ? Cinq bonnes réponses, la page est prête ; une mauvaise, la zone en cause est reprise.

Conséquence : chaque état a un signal, chaque signal a une étiquette de quatre mots au plus, chaque chiffre a une unité et une source.

## 3. Les règles, comme au cinéma

1. **Un écran, une prise.** Tout ce qui se passe est sur la page au moment où ça se passe ; pas de coupe, pas de montage entre les étapes.
2. **Ce qui vient de l'extérieur clignote** jusqu'à ce que quelqu'un l'ait pris : un message de la Terre, une approbation demandée, une proposition de propagation.
3. **Chaque changement d'état a un signal sous 300 ms, qui reste au moins deux secondes**, même si la machine a été plus rapide : la vitesse de la machine s'écrit en chiffres (« 3 ms »), elle ne se montre pas en vitesse.
4. **Une couleur par acteur, une couleur par verdict**, jamais une couleur pour décorer.
5. **La caméra est la vérité.** Quand la carte agit ou refuse, l'image de la caméra grandit ; la turbine qui ralentit, ou qui ne s'arrête pas, est ce que le jury croit.
6. **Rien ne disparaît.** Les choses se replient dans une pile (les cartes, le journal, la console) ; on peut remonter.
7. **Le texte est en anglais, court, dans les mots de la trace** : `device refused`, pas « capability execution error » ; `model does not explain`, pas « anomaly detected ».
8. **Chaque chiffre porte son unité et sa source** (le fichier, le sha256 court) ; aucun n'est tapé à la main.
9. **Le silence est un signal.** À la récurrence, les étapes 5 et 6 restent éteintes et sont entourées : `no reasoner call`.
10. **Rien à l'écran que le système ne fasse.** Pas de barre de progression inventée, pas de statut décoratif ; une source muette affiche `no data` et l'heure de la dernière lecture.

## 4. L'écran

1920 × 1080, l'écran de tournage (la grille 640 × 360 du brief de design, × 3) ; enregistrement à 30 images par seconde ; aucun texte sous 16 px.

| zone | position et taille | étiquette à l'écran | contenu |
|---|---|---|---|
| bandeau haut | 1920 × 56, en haut | `NIGHT 9 · MIN 262` ; `TICK 312 · KNOWN · REPLAY · 3 ms · REASONER 0 · FACTORY 0` ; `NEMOTRON · claude:en · PROTECTED` ; l'état de la page (section 8) | l'horloge de mission, le battement, le profil, l'état |
| bande d'état | 1920 × 28, sous le bandeau, visible seulement quand la branche est ouverte | `MODEL DOES NOT EXPLAIN · FACTORY REQUESTED 12:42` | reste tant que la branche n'est pas fermée |
| centre | 1440 × 724, à gauche | le titre du document en cours : `AGENT LOOP`, `FACTORY`, `JUDGMENT` | le graphe en cours, sa mise en lumière, le suivi ; la vignette de l'agent (douze points) quand un autre document est au centre |
| bas | 1440 × 272, sous le centre | `RUN MONITOR` | les cartes empilées ; la carte rouge du résidu ; les deux colonnes de la récurrence |
| colonne droite, haut | 480 × 300 | `WORLD` | les deux volumes, la porte, les personnes, le CO2 et son état, la vitesse des scrubbers |
| colonne droite, milieu | 480 × 360 | `BOARD CONSOLE` | les lignes publiées par la carte, avec l'heure |
| colonne droite, bas | 480 × 364 | `FLEET` et `STATION LOG` | `scrubber` banque A / banque B et la jauge d'épreuve ; `scrubber-2` le témoin ; le journal |
| caméra | 320 × 180 en bas à droite, 640 × 360 quand elle grandit | `LIVE · RS-385` | l'image de la carte et de la turbine |
| superposition | 960 × 160, centrée en haut du centre | `INCOMING · EARTH`, `APPROVAL REQUESTED`, `PROPAGATION PROPOSED` | l'alerte (section 6) |
| superposition finale | 1440 × 724 sur le centre | `SCORECARD` | le scorecard à la fin de la nuit |
| barre de régie | 1920 × 40, tout en bas | `DIRECTOR` | jouer, pause, vitesse, la ligne de temps de la nuit avec les minutes du scénario marquées |

Ordre d'empilement : superpositions, puis alertes, puis caméra, puis zones. Ce qui bouge : les étapes du graphe, les cartes qui s'empilent, les lignes de console, l'alerte, la caméra qui grandit, la transition entre documents. Rien d'autre.

## 5. La grammaire visuelle

**La direction artistique est celle de `dashboard/DESIGN_BRIEF.md`**, pixel art des années 1990, pour toutes les zones autour du graphe : la palette de seize couleurs au plus déclarée une fois, les panneaux à biseau d'un pixel avec leur barre de titre, les polices bitmap (titres en 8 × 8, texte et console dans une face pixel plus étroite), les LED, l'afficheur à sept segments pour le CO2, la turbine en sprite de huit images dont la cadence suit la vitesse, la grille de 640 × 360 pixels logiques agrandie d'un facteur entier (× 3 à 1920 × 1080). Tailles minimales du brief de design : 16 px pour la console et le journal, 24 px pour les valeurs, 48 px pour le CO2. Le graphe au centre garde le rendu du studio : c'est l'outil, les panneaux sont la scène ; la frontière entre les deux est un panneau à biseau comme les autres.

**Une couleur par acteur, prise dans la palette du brief de design :** la carte `amber` ; l'agent `green` (la bande de titre des cartes existantes) ; le jumeau `blue` ; l'usine `violet` ; la station `slate` ; la Terre et l'opérateur `yellow` (les alertes) ; le monde `white`.

**Une couleur par verdict :** refusé par la carte `orange` (étape 9, console) ; arrêté par le harnais `red` (étape 8) ; le modèle n'explique pas `red` (carte du résidu, bande d'état) ; décision en cours ou réussie `green` ; en attente `grey`.

**Le mouvement.** Deux choses seulement clignotent : CRITICAL (la LED, 2 Hz, comme dans le brief de design) et une alerte pas encore prise (le bandeau, 1 Hz) ; chaque étape du graphe reste allumée 350 ms au moins (la file de repères existante) ; transition entre documents 400 ms ; la caméra grandit en 300 ms ; aucun rebond, aucun effet de profondeur.

**Le son.** Trois sons courts : message entrant, refus, modèle chargé ; coupés par `?sound=0` ; la vidéo peut se passer d'eux (section 2).

## 6. Les alertes et les approbations

Cycle d'une alerte : elle arrive (une notification du slot `world` pour un message de la Terre ; de la station pour une approbation demandée ou une proposition de propagation) ; le bandeau clignote avec l'étiquette, la source et le texte écrit lettre par lettre ; elle est prise (un message de la Terre : quand l'étape 2 s'allume, l'agent l'a lu ; une approbation ou une propagation : quand l'opérateur clique `APPROVE` ou `REFUSE`) ; elle se replie en carte dans la pile, avec l'heure et qui l'a prise.

Le clic `APPROVE` est la seule commande que la page envoie en dehors de la régie : `station.approve { proposalId }`, avec l'identité `operator` ; c'est la station qui pousse. Un refus est aussi une carte. Une alerte jamais prise reste à l'écran : c'est voulu, on doit le voir.

## 7. D'où vient chaque chose affichée

| zone | slot | outil, ressource ou notification | cadence | identité |
|---|---|---|---|---|
| battement, étapes, cartes de l'agent | le harnais dans la page | ses propres événements (`onStage`, la trace) | chaque tick | `tier3` |
| le résidu | `twin` | `twin.predict` appelé par l'observateur de l'agent ; le résidu est un champ de l'état | chaque tick | `tier3` |
| `WORLD` | `world` | `world.state` | une fois par seconde | `viewer` |
| `BOARD CONSOLE` | `scrubber` | `scrubber://log` (stub) ; notification du slot quand la carte se publie (étape B) | une fois par seconde | `viewer` |
| les alertes | `world`, `station` | notifications `earth.message`, `station.approval_requested`, `station.propagation_proposed` | à l'arrivée | `viewer` |
| `APPROVE` / `REFUSE` | `station` | `station.approve`, `station.refuse` | au clic | `operator` |
| cartes de l'usine | `factory` | `factory://trace` (le même rendu de cartes que l'agent) | une fois par seconde pendant un job | `viewer` |
| le document de l'usine, le document de jugement | `factory`, `twin` | `factory://documents/<sha>`, `twin://documents/<sha>`, `twin://reports/<id>` | à l'ouverture | `viewer` |
| `FLEET`, `STATION LOG`, la jauge d'épreuve | `station`, `scrubber-2` | `station://journal`, `station.artifacts`, `station://probation/<sha>`, `scrubber-2.motor.state` | une fois par seconde | `viewer` |
| la régie | `world` | `world.play`, `world.pause`, `world.rate`, `world://scenario` | au clic | `operator` |
| la trace et le scorecard | `station` | `station.record` : chaque ligne de décision part vers la station, qui écrit `trace.jsonl`, `scorecard.json` et le manifeste | chaque décision, puis à la fin | `tier3` |

La preuve n'est pas dans le navigateur : la page envoie, la station écrit, le manifeste nomme le sha256 du scénario, des paramètres, du profil, et du bundle de la page.

## 8. Les états de la page

Écrits en toutes lettres dans le bandeau haut : `IDLE` (le battement seul) ; `EVENT` (des étapes s'allument, une carte se construit) ; `BRANCH OPEN` (la bande d'état rouge, tant que le modèle n'explique pas) ; `FACTORY` (le document de l'usine au centre, la vignette bat) ; `JUDGMENT` (le document de jugement au centre) ; `APPROVAL PENDING` (l'alerte clignote) ; `PROBATION` (la jauge avance) ; `PROPAGATION` (le témoin vérifie, charge, rejoue) ; `SCORECARD`. Un état ne se devine pas : il se lit.

## 9. Ce que la page ne fait jamais

Elle n'appelle jamais `scrubber.motor.*` ni `scrubber.scrubber.*`, jamais `station.register_artifact`, jamais un outil de construction de l'usine : la politique les refuse à `viewer` et à `operator`, et la page n'a pas de bouton pour eux. Elle n'invente ni chiffre, ni statut, ni progression. Elle ne cache aucun refus. Elle ne joue pas le scénario elle-même : le scénario est un fichier joué par le slot `world`. Elle ne tient pas la clé du modèle : le raisonneur est un slot.

## 10. Construction

**Où.** Dans le dépôt de la démo : `tier3/browser/agent-page.ts` (l'extension du studio, déjà là) et `tier3/browser/tiles/` (une tuile par zone, `IRenderable`, comme la tuile du moniteur) ; la tuile du moniteur reste dans le plugin du harnais. Deux petites choses côté studio (`node-editor-v2`) : ouvrir un autre document sans arrêter l'extension et en le disant (`Studio.openDocument` avec un rappel), et une superposition (`Studio.addOverlay(el)`).

**Ordre.** (1) La grille et les zones, chacune avec son état `no data`. (2) L'alerte et la régie sur le slot `world`. (3) `WORLD`, `BOARD CONSOLE`, `FLEET` et le journal. (4) Le battement, la carte du résidu, les deux colonnes de la récurrence. (5) Les trois documents et la vignette. (6) La caméra. (7) Le scorecard. (8) La trace vers la station. Chaque pas se répète sur l'agent scripté, modèle coupé (`?llm=0`), avant tout run avec un modèle.

**La liste de contrôle.** Le storyboard (section 6 de la spécification) ligne par ligne : à la minute prévue, les signaux de la section 6.1 sont visibles, en une prise ; une capture d'écran par ligne, rangée dans `outputs/rehearsal/`.

## 11. Critères d'acceptation

1. L'épreuve du muet (section 2) réussie par une personne extérieure, cinq réponses sur cinq.
2. La liste de contrôle du storyboard passée deux fois de suite, en une prise, sans intervention hors régie.
3. Aucun chiffre à l'écran sans unité ni source ; le manifeste nomme les sha256 du scénario, des paramètres, du profil et du bundle de la page.
4. Le journal de la politique du broker ne montre que trois identités (`viewer`, `operator`, `tier3`) et aucun appel refusé venant de la page.
5. 1920 × 1080, 30 images par seconde, aucun texte sous 16 px, aucun chevauchement, les pixels entiers du brief de design : vérifié sur les captures d'écran de la liste de contrôle.

## 12. Le démarrage et le Control Board (ajouté le 20 septembre 2026, soir)

*Décision de Guillaume : le node editor reste l'outil de mise au point et de visualisation des processus ; l'expérience de la démo commence ailleurs, et on y arrive sans rien taper.*

**Le déroulé.** `npm run server` démarre le broker et les slots, puis ouvre le navigateur sur `/` (`--no-open` l'en empêche). La page est une console de démarrage, vert phosphore, qui écrit son journal ligne par ligne : `SYSTEM STARTING`, puis les vérifications. Chaque ligne est une vraie requête, jamais un décor : le broker répond (`initialize` sur `_broker`) ; la liste des slots (`providers_list`) ; chaque slot attendu (`scrubber`, `twin`, `station`, `factory`, `reasoner`, `speech`) répond à `initialize` et dit sa version (un `-stub` est écrit tel quel) ; le studio, le bundle de l'agent et le graphe de l'agent sont servis ; les paramètres et le scénario sont lus et leur sha256 est calculé dans la page (`crypto.subtle`) et écrit en court ; le raisonneur dit s'il est prêt (`reasoner.describe` : modèle, clé présente) ; la voix dit son moteur (`speech.describe`). Un slot absent reste `[WAIT]` en ambre tant que la console boucle (elle réinterroge le broker toutes les deux secondes), puis `[FAIL]` en rouge après le délai, et la console continue : un scrubber matériel qui n'est pas sur le réseau reste rouge, non connecté, et on le voit. `BOOT COMPLETE` ; la console attend une touche (c'est le geste qui autorise le son), s'efface, et laisse la place au Control Board.

**Le Control Board, première version.** Le bandeau haut (le nom, l'horloge de mission, l'état). À gauche, la liste des slots : une LED par slot, verte s'il répond, rouge s'il ne répond pas, ambre pendant qu'on l'attend ; sa version, son tier, sa grammaire ; la page réinterroge le broker toutes les deux secondes, un slot qui tombe passe au rouge. Au centre, la boucle de l'agent : la page du studio, incrustée telle quelle (une `iframe` sur `/studio/node-editor-v2/index.html?ext=/agent/tier3.js`), commandée par le Control Board par `postMessage` (jouer un événement, tout jouer, réinitialiser). En bas, la voix de la station : ce qu'elle dit, en texte, au moment où elle le dit. À droite, le menu `SIMULATION` : les événements du scénario, un par bouton, et `ALL`. Les zones de la section 4 qui manquent encore (le monde à deux volumes, la console de la carte, la flotte, la caméra) viendront à leur place, sans changer ce cadre.

**La station dit bonjour.** Quand la liste est au vert (ou que le délai est passé), la station parle : « Hello. » puis un texte d'accueil de deux ou trois phrases, rédigé par le modèle de langage à partir du rapport de démarrage (quels slots répondent, lesquels ne répondent pas, le moteur de la voix, la nuit du scénario), par un nouvel outil du slot `reasoner`, `compose { instructions, context }`, qui rend un texte sans appel d'outil. Les faits viennent du rapport ; le modèle les formule ; la voix les dit (`speech.say`, locuteur `station`) et la page les écrit. Sans clé, la station dit bonjour et lit le rapport elle-même, en une phrase par fait, et le dit.

**Une seule sortie audio.** Le Control Board est la sortie audio (il a reçu le geste) ; la page du studio incrustée ne joue rien (`&output=none`) mais parle (ses phrases partent vers le slot) et se règle sur la file du slot : elle attend, avant la décision suivante, qu'il n'y ait plus rien en attente ni en cours de lecture (`speech://queue`), quelle que soit la page qui joue.

**Le bouton FACTORY (ajouté le 21 septembre 2026).** Dernier bouton du menu `SIMULATION`, après `ALL`. Depuis le démarrage, le Control Board relève l'état de la carte toutes les deux secondes (`scrubber.motor.state` : ppm, état, vitesse, courant, alimentation) et garde les relevés de la nuit (au plus 1800, soit une heure). Le bouton envoie à l'usine la demande écrite dans le fichier du scénario (`specs/scenario-night-9.json`, clé `factory.request` : les sorties requises, les contraintes, le sujet), avec ces relevés comme données (`data[].rows`) et le dernier état comme observation ; la page ne connaît aucun chiffre du contrat, elle les lit dans le fichier. L'usine ouvre la tâche, écrit la télémétrie avec son sha256 et lance sa boucle sur-le-champ (`factory.request` la lance dans le processus du slot ; `run: false` ouvre seulement la tâche). La page suit la tâche (`factory.task` chaque seconde) et la station dit une phrase par pas, lue dans le manifeste de la tâche (`dashboard/factory-voice.js` : l'outil, sa source, son issue, les chiffres de la réponse : « Model fitted on 19 rows, 19 inside the domain: rmse 0.0008, worst error 0.001, parity ok. », « The factory plans on 1 node type: Physics.LifeSupport:cabin-air. Missing: scrubber_2_efficiency; to be fitted. »), puis la fin (« Proposed to the station: p0003-..., 5 artifacts, 7 steps. The twin's judgment is the next step. » ou l'échec avec sa raison). Un pas rejoué depuis les recettes est dit tel quel (« from a recipe »). Le bandeau haut affiche `FACTORY · step n` pendant la tâche. Vérifié le 21 septembre avec le constructeur scripté et la voix silencieuse. Décision du même jour : le graphe de l'usine n'est pas au centre du Control Board ; l'usine a sa propre page.

**La page de l'usine (ajoutée le 21 septembre 2026, soir).** `npm run server` ouvre deux fenêtres : le Control Board (`/`) et la page de l'usine (`/factory.html`, le studio sur `graphs/factory-agent.spikypanda`, les mêmes douze étapes avec les libellés de l'usine : « 1 Observe the workshop », « 6 Ask the builder », « 8 Builder guard », « 11 Evaluate, validate », « 12 Learn the recipe »). Le bandeau du Control Board a aussi un lien FACTORY vers elle. La boucle tourne dans le slot `factory` (Node) ; la page ne fait rien tourner : elle lit les tâches de l'usine (`factory://tasks` toutes les deux secondes, la plus récente sauf choix dans la liste), suit la tâche (`factory.task`) et, pour chaque pas du manifeste, allume les douze étapes une à une (le chemin de la recette sans les étapes 5 et 6 quand le pas est rejoué ; l'arrêt en rouge à la garde ou au constructeur quand le pas a été refusé), avec dans la tuile du moniteur une phrase par étape, l'appel et sa réponse, la récompense, puis la phrase du pas et celle de la fin. Elle ne parle pas : le Control Board est la seule sortie audio. Elle ne rejoue rien d'elle-même à l'ouverture (remarque de Guillaume, 21 septembre au soir : « il y a un start automatique, ce n'est pas bon ») : la dernière tâche déjà terminée est seulement nommée dans le bandeau et la tuile (« Last task t-..., failed, 5 steps; waiting for the next one »), la choisir dans la liste la rejoue ; ce que la page suit, c'est une tâche en cours ou demandée après son ouverture.

**Les phrases sont dans les grammaires du slot, par langue (règle de Guillaume, 21 septembre ; mécanisme de mcp-core 1.2.0).** Aucune phrase fixe dans le code, et pas de chargeur à part : ce que la station dit d'une tâche de l'usine et ce que la page de l'usine affiche est la section `phrases` des fichiers de grammaire du slot `factory` (`slots/factory/grammars/default/en.json` et `fr.json`, à côté des mots de ses outils ; mêmes clés, mêmes trous `{nom}` dans chaque langue, vérifié quand le slot se publie, `referenceLocale`). Le serveur mcp-core donne à chaque session ses phrases dans la langue qu'elle a annoncée, sous la ressource `grammar://phrases` ; le Control Board et la page de l'usine les lisent sur leur session avec le slot (`capabilities.locale` = `?locale=` ou la langue du navigateur ; repli sur la langue puis sur l'anglais par le résolveur). Le module `harness/browser/factory-voice.ts` ne porte que le choix de la clé et les valeurs lues dans le manifeste ; une clé absente s'affiche telle quelle, une valeur absente du manifeste se lit « ? ». Ce qui vient des outils et du manifeste (un refus « device refused: affine fit... », le champ `ended`) reste en anglais dans la phrase : ce sont des données, pas des mots. Les phrases de l'agent ont suivi le même chemin le 21 septembre au soir, sur le slot `station` (`slots/station/grammars/default/{en,fr}.json`, 79 phrases) : ce que la station dit du jumeau, de la carte, d'un refus, d'un message de la Terre (`station-voice.ts`), ce que la tuile de la page de l'agent écrit à chaque étape (`agent-page.ts`), et le bonjour du Control Board avec la consigne donnée au modèle pour l'accueil (le modèle écrit alors l'accueil dans la langue de la page). Les messages du scénario et les raisons du modèle restent des données, dans leur langue. Décision de Guillaume le 21 septembre au soir : **tout en en-US par défaut** (le Control Board, la page de l'agent, la page de l'usine ; `?locale=fr` pour le français), parce que les messages du scénario, les raisons du modèle et les erreurs des outils sont des données en anglais, et une phrase française autour d'une donnée anglaise se lit mal. Et une seule phrase par fait : quand le constructeur renonce, l'appel refusé dit la raison, « The factory gives up. » ne la répète pas, ni la fin (« The task ends failed; nothing is proposed. ») ; le préfixe du fil (« device refused: ») est retiré des raisons, la phrase dit déjà qui a refusé.

**Deux fenêtres, une seule sortie audio (bogue du 21 septembre : « la fenêtre de l'usine ne peut pas être ouverte en même temps que celle de la station, plus de son et tout se fige »).** Trois causes, trois corrections. (1) Le serveur ouvrait la fenêtre de l'usine par-dessus celle du Control Board ; une fenêtre entièrement recouverte est une page cachée pour le navigateur, qui ralentit ses minuteurs jusqu'à un réveil par minute au bout de cinq minutes : la sortie audio du Control Board ne relevait plus la file, plus de son, et la page ne se rafraîchissait plus. C'est maintenant le Control Board qui ouvre la fenêtre de l'usine, sur l'appui de touche qui termine son démarrage (un navigateur n'ouvre une fenêtre que sur un geste), sur la moitié droite de l'écran (`?factory=0` pour ne pas l'ouvrir ; la fenêtre est nommée, un second démarrage la réutilise). (2) L'horloge de relevé de la sortie audio bat dans un worker, que le navigateur ne ralentit pas comme les minuteurs d'une page cachée ; et une page cachée ne prend plus d'énoncé (livraison unique : si le Control Board est ouvert deux fois, ou derrière une fenêtre, c'est la page visible qui parle ; une prise faite ailleurs est écrite dans le journal, « said by another page »). (3) La page de l'agent attendait que la file de la station soit vide avant sa décision suivante ; les phrases que le Control Board dit d'une tâche de l'usine passent par la même file, l'agent se figeait le temps qu'elles soient dites. Il n'attend plus que ses propres énoncés (`speechHeard` sur les identifiants rendus par `speech.say`). À savoir : un événement du scénario est dit en priorité `high`, ce qui retire de la file ce qui n'était pas encore dit, la narration de l'usine comprise ; jouer un événement pendant qu'une tâche est racontée coupe la narration.

**Le constructeur peut renoncer (`task.fail`, 21 septembre).** Un bouton FACTORY appuyé avant tout événement donne une télémétrie à une seule vitesse ; l'ajustement affine ne peut pas se faire (« every point shares the same duty, the slope is undefined »). Le constructeur scripté renonce alors avec la raison de l'outil (`task.fail`), la tâche finit `failed` en cinq pas au lieu de dépenser les vingt itérations sur le même échec, et la station dit « L'usine renonce : ... » puis « La tâche a échoué : ... ». Vérifié sur le tableau.

**Ce qui ne change pas.** Rien à l'écran que le système ne fasse (section 3, règle 10) ; un chiffre porte son unité et sa source ; les identités sont celles de la section 1 (le Control Board est `viewer` et, pour la régie, `operator` ; la boucle dans l'iframe est `tier3`).
