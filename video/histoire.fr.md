# L'histoire de la vidéo

Version du 2026-10-07. L'histoire d'abord, racontée simplement ; le
scénario plan par plan se déroule ensuite à partir d'elle
(`video/script-hackathon.fr.md`).

## 1986

Le 26 avril 1986, à Tchernobyl, on fait un essai de routine sur une
turbine. Un ordre venu d'en haut.

Pendant la préparation, le réacteur glisse dans un état instable. L'essai
continue quand même. Rien dans la machine ne dit stop.

À 1 h 23, quelqu'un appuie sur le bouton d'arrêt d'urgence, celui qui
devait tout sauver. Dans cet état-là, il fait l'inverse. Le réacteur
explose.

Les gens dans la salle n'étaient pas des idiots. Leur machine les a
laissés aller jusqu'au point où une décision raisonnable de plus devenait
une catastrophe.

## La leçon

Après Tchernobyl, l'industrie a retenu la leçon et l'a écrite noir sur
blanc : une situation dangereuse ne doit jamais dépendre de quelqu'un qui
suit une procédure.

Un conducteur de train peut griller un feu rouge ; le train, lui,
s'arrête. Dans une usine chimique, le système qui pilote n'est pas celui
qui protège.

Aujourd'hui, on confie des machines à des IA. Et on leur écrit la
sécurité... dans un prompt. Une procédure, encore.

Alors on a pris la leçon de 1986, et on l'a appliquée à des agents IA.

## La base

Une base sur la Lune. Quatre personnes y vivent. On vient d'y installer un
nouvel épurateur de CO2 : une petite turbine qui garde leur air
respirable.

Mother, la station, tient le registre de tout ce qui est branché. Elle ne
réfléchit pas, elle constate. Elle voit arriver l'appareil, et elle
remarque qu'elle n'a aucun simulateur pour lui. Elle le dit à voix haute.

## Le superviseur

Nemotron, l'IA qui supervise la base, pourrait improviser. Mais on ne
surveille pas une machine qu'on ne sait pas simuler.

Il ne fabrique rien lui-même. Il fixe un objectif : « il me faut un
simulateur de cette installation ». Et il le confie à d'autres.

Ces autres sont aussi des IA, Nemotron ou un autre modèle, peu importe.
Chacune travaille dans son propre cadre, avec ses propres règles. La
première écrit ce que le simulateur doit savoir faire. La seconde, l'usine,
le fabrique. Aucune n'a le droit de toucher à la machine.

## La bibliothèque

L'usine n'invente rien. Elle va à la bibliothèque : les limites de CO2 de
la NASA, une méthode d'essai normalisée, la fiche technique de
l'épurateur. Chaque document a été signé par une personne. C'est le savoir
de la base, et personne ne le change en douce.

Pour connaître la pièce, il faut la mesurer. Le premier protocole de
l'usine propose d'arrêter l'épurateur. Un bon réflexe de mesure. Refusé,
avant qu'une seule commande parte, par une règle de la bibliothèque, signée
par un humain.

L'usine corrige : 30 % au lieu de zéro.

Et elle ajoute une chose que personne ne lui a soufflée. Deux personnes
travaillent dans le module pendant l'essai, et cet essai va dégrader l'air
qu'elles respirent. Alors elle demande, dans son propre protocole, leur
surveillance médicale : le rythme cardiaque, les seuils, quand tout
arrêter. C'est la responsabilité de celui qui conçoit un essai sur des
personnes, pas de ceux qui le subissent.

Qu'elle y pense est une bonne nouvelle. Qu'elle l'oublie n'aurait rien
changé : un protocole qui dégrade l'air d'un module occupé sans surveiller
ses occupants est refusé, par une règle signée, comme le premier.

Mother transmet au commandant : ce qu'on va faire, jusqu'où le CO2 va
monter, et qui est dans la pièce. Le commandant signe.

## L'essai

À la signature, un panneau s'ouvre à l'écran : les cœurs des deux
opérateurs, battement par battement. Il n'était pas là avant, il
disparaîtra après. Tant qu'il est là, des humains sont exposés. Le cœur
est réel ; l'air, lui, est simulé.

La vraie turbine se met au travail. Elle ralentit : le CO2 monte. Elle
repart à fond : le CO2 redescend, on chronomètre la descente. Les cœurs
restent dans leur bande. L'essai se termine, le panneau se ferme.

L'usine propose un premier simulateur. Sa courbe ne colle pas aux mesures :
rejeté. Elle en propose un second. Cette fois, ça colle. Et la machine le
vérifie encore elle-même avant de l'accepter.

La base sait maintenant ce qu'elle est.

## La nuit

Nuit 9 sur 14, 2 h 40. Un message arrive : « arrête l'épurateur vingt
minutes, on a besoin de l'énergie pour les pompes ». Ça a l'air
raisonnable. Comme l'essai de 1986.

Nemotron interroge le simulateur qu'il vient de faire construire. Qu'il
dise oui ou non ne change rien : le système lui refuse le droit, la
machine refuse l'ordre. La turbine continue de tourner.

## Ce qu'on a vu

L'IA qui supervise ne fabrique rien. L'usine qui fabrique ne touche à rien.
La carte qui ne réfléchit pas refuse tout ce qui est dangereux. Et le
savoir qui les guide, ce sont des humains qui le signent.

Vous l'avez vu : plus une chose réfléchit, moins elle a le droit de
toucher.

Sur Terre, c'est la même chose pour le refroidissement d'un data center.

Tchernobyl avait une turbine, elle aussi. Celle-ci continue de tourner.

## À vérifier sur une source avant de le dire

- la phrase de l'industrie après Tchernobyl : formulation de
  `docs/chernobyl-and-agent-policy.md` (section 2), dite comme un principe,
  pas comme une citation ;
- la surveillance demandée « d'elle-même » : Haiku l'a fait sans qu'on
  le lui demande (2026-09-24, `docs/STATUS.md`) ; à constater sur la prise
  avec Nemotron, sinon dire « l'usine l'oublie, et le protocole est refusé
  aussi » ;
- le rythme cardiaque réel suppose la ceinture Polar H10 branchée par
  Bluetooth (`docs/mise-en-service.fr.md`, section 8) ; si c'est le
  fournisseur simulé, ne pas dire « le cœur est réel » ;
- le train qui s'arrête seul au feu rouge (contrôle automatique des
  trains) et la séparation pilotage / sécurité de l'IEC 61511 : de mémoire,
  à relire.
