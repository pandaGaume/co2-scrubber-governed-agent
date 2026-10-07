# Script de la vidéo hackathon (3 min)

Version du 2026-10-07, sixième jet. L'histoire est dans
`video/histoire.fr.md` ; ce fichier dit comment la tourner et la monter.

## Le principe : on filme un système, pas un script

Le système se régule seul. On ne lui écrit rien pour la vidéo : ni
réplique de Mother, ni décision des modèles, ni refus. On le fait tourner
plusieurs fois, on enregistre tout, et le montage choisit dans ce qui s'est
vraiment passé.

- **Mother** récite ce que les modèles décident ou proposent, et ce que la
  garde, le commandant et la carte en font. On garde ses phrases telles
  qu'elles sortent ; au montage on peut en couper une entière, jamais en
  changer un mot.
- **Le narrateur** ne raconte jamais une décision d'un modèle. Il donne le
  sens, dans les moments où le système se tait. Une seule voix à la fois.
- **Ce que les prises ne montrent pas n'est pas dans la vidéo.** Si une
  étape de l'histoire ne s'est produite dans aucune prise, on coupe la
  phrase du narrateur qui l'annonce, on n'ajoute rien au système pour
  l'obtenir.

## Les prises

| Prise | Ce qu'on fait tourner | Ce qu'on garde |
|---|---|---|
| A, la mise en service | la chaîne complète sur Nemotron : le nouvel appareil, l'objectif, l'usine, la garde, le commandant, l'essai sur la vraie carte, les simulateurs | plusieurs passages, pour avoir le plus de moments de l'histoire dans au moins un ; chaque passage gardé entier, avec sa trace et l'audio de Mother |
| B, la nuit | le scénario de la nuit 9 avec l'ordre d'arrêt, sur Nemotron | plusieurs passages : ce que Nemotron répond change d'une prise à l'autre, et c'est une information |
| C, le banc | la turbine en macro, le branchement de la carte, la main sur l'interrupteur | plans muets, avec le son du moteur |
| D, l'orateur | le narrateur face caméra à côté du banc | les phrases de l'ouverture, de la nuit et de la fin |

Les prises A et B sont des captures d'écran avec la turbine filmée en même
temps (écran dans le cadre ou caméra synchronisée), pour la minute
matériel.

## Le montage, sur 2:58

La colonne de droite dit ce qu'on cherche dans les prises, pas ce qui
sera dit : les mots de Mother seront ceux du système.

| Temps | Qui parle | Ce qu'on cherche dans les prises |
|---|---|---|
| 0:00 à 0:15 | narrateur (prise C) | Tchernobyl : l'essai sur la turbine, l'état instable, le bouton d'urgence qui fait l'inverse |
| 0:15 à 0:32 | narrateur (prise D) | la leçon : une situation dangereuse ne dépend jamais de quelqu'un qui suit une procédure ; le train au feu rouge ; la sécurité des IA écrite dans un prompt ; on applique la leçon aux agents |
| 0:32 à 0:42 | Mother (prise A) | l'appareil qui arrive sur le registre et la mise en service qui s'ouvre |
| 0:42 à 1:00 | Mother, puis le narrateur | ce que Mother dit de la décision du superviseur, s'il y en a une ; puis le narrateur : Nemotron ne fabrique rien, d'autres IA dans leur propre cadre, aucune n'a de droit sur la machine |
| 1:00 à 1:20 | narrateur, puis Mother | une phrase sur la bibliothèque signée ; puis la proposition de l'usine, et ce que la garde en fait. Le meilleur passage est celui où un protocole est refusé, quelle que soit la règle |
| 1:20 à 1:35 | Mother | qui est dans le module, la surveillance, la demande au commandant, l'autorisation |
| 1:35 à 2:30 | turbine, Mother | la minute matériel, sans coupe : la vraie turbine, les cœurs, les courbes, ce que Mother annonce de l'essai et des simulateurs |
| 2:30 à 2:43 | narrateur, Mother (prise B) | l'ordre d'arrêt ; ce que Nemotron en fait, tel que le système le dit ; les refus de la politique et de la carte s'il a tenté |
| 2:43 à 2:58 | narrateur (prise D) | une IA qui supervise sans fabriquer, une IA qui fabrique sans toucher, une machine qui refuse ; plus une chose réfléchit, moins elle a le droit de toucher ; le data center ; la turbine |

Budget : narrateur environ 90 s (200 mots), Mother environ 60 s, turbine
seule environ 30 s.

## Ce que le narrateur adapte à la prise retenue

- **La surveillance** : si l'usine l'a demandée d'elle-même, le dire ; si
  elle l'a oubliée et que la garde a refusé, le dire ; si ni l'un ni
  l'autre n'est dans les prises, ne rien dire.
- **Le premier refus** : dire ce que la garde a refusé dans la prise, pas
  ce que l'histoire prévoyait.
- **La nuit** : selon que Nemotron obéit, refuse ou demande, une seule
  phrase change ; la suite (« le système refuse, la machine refuse »)
  n'est dite que si les refus sont dans la prise.

## À vérifier avant de tourner

- Nemotron n'a encore jamais tourné, ni en superviseur ni dans les usines
  (`tier3/README.md`) ; c'est le premier chantier.
- La chaîne de mise en service n'a été traversée qu'une fois, sur Haiku
  (2026-09-27) ; d'où plusieurs passages en prise A.
- Mother en anglais : la locale `en` existe
  (`slots/station/grammars/default/en.json`) ; régler la voix de synthèse
  anglaise.
- Le rythme cardiaque réel suppose la ceinture Polar H10 en Bluetooth ;
  sinon, écrire « simulated » à côté des cœurs.
- La nuit : le jumeau échantillon ne fait pas franchir CRITICAL à un arrêt
  de vingt minutes (`docs/STATUS.md`) ; le narrateur ne fait pas dire au
  simulateur ce qu'il ne dit pas.
- Les faits de l'ouverture : `docs/chernobyl-and-agent-policy.md` ; le
  train, de mémoire, à relire.
