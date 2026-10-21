# Variation de vitesse et choix de la prise matérielle

Constat du 19 octobre 2026 : pendant les essais de l'utilisateur, la vitesse affichée et le moteur réel passent éventuellement de 0 à 33 %, puis à 0, sans variation de régulation visible. La préparation du tournage doit distinguer ce qui est déjà observé de ce qui reste à démontrer.

## Ce que montrent les traces disponibles

Les deux traces consultées sont sous `outputs/tier3/sessions/`, dans le sous-répertoire `reasoner-nemotron-measured` de chaque session :

| Session | Vitesses des états après décision | Résultat |
|---|---|---|
| `2026-10-19T21-09-04-energy-shortage-a` | 33 % | Proposition d'un arrêt de 30 minutes, en attente d'autorisation. |
| `2026-10-19T21-10-42-energy-shortage-b` | 33 %, puis 0 % | Arrêt borné autorisé et exécuté, rapporté pour 28 minutes. |

Ces traces confirment le comportement rapporté ; elles ne constituent pas à elles seules une preuve de provenance matérielle. L'utilisateur constate aussi le mouvement sur le banc.

## Trois comportements différents

**Changement de consigne par un agent.** Le scénario `specs/scenario-night-9.json` contient notamment l'événement `load-rises` : deux occupants commencent un effort, le CO2 est déclaré ELEVATED et l'agent doit traiter la situation. Le modèle peut demander une hausse de vitesse ; ce résultat doit être constaté dans la prise. Le fournisseur de répétition `stand-ins/night/scripted.ts` prévoit 30 %, puis 60 %, mais cette séquence écrite ne prédit pas les décisions de Nemotron et ne peut pas lui être attribuée.

**Paliers d'un essai de qualification.** Dans `slots/scenario/commissioning.ts`, la mise en service fait exécuter la procédure autorisée par `tier3/procedure.ts`. Chaque étape envoie `motor.set_speed` avec le pourcentage du protocole. Il faut donc examiner le protocole réellement accepté : a-t-il plusieurs vitesses distinctes, sont-elles acceptées, l'essai atteint-il ces étapes avant un éventuel abandon ? C'est la piste existante pour montrer des variations pendant la qualification. Il s'agit d'un protocole d'identification, pas d'une régulation continue du CO2.

**Réaction déterministe de protection.** Le fournisseur logiciel `slots/scrubber/provider.ts` maintient la consigne entre les commandes ; il force notamment 100 % au seuil critique et peut redémarrer après un arrêt selon son mode de garde. Les scénarios Energy shortage C et D préparent ces situations dans un monde simulé avec les outils `debug.*`. Leur exécution sur le substitut logiciel ne prouve pas une réaction identique de la carte réelle. Le mode atmosphérique et les outils disponibles sur le firmware doivent être vérifiés avant de choisir ces prises pour le matériel.

Aucune boucle de régulation continue du CO2 ajustant progressivement la consigne n'a été trouvée dans les sources TypeScript examinées de ce dépôt. Cela ne conclut pas sur l'ensemble du firmware externe : sa régulation électrique, ses rampes et ses limites locales sont un autre niveau de contrôle.

## Conséquence pour le tournage

1. Ne pas retenir Energy shortage A ou B comme preuve de régulation progressive. Ils peuvent montrer le raisonnement, l'autorisation et un arrêt borné.
2. Examiner d'abord la procédure acceptée d'une mise en service complète. Chercher des paliers distincts et leurs commandes acceptées dans la trace, puis constater leur effet sur la carte réelle.
3. Essayer l'événement `load-rises` de Night 9 pour observer une adaptation de consigne décidée par Nemotron. Ne pas promettre à l'avance une valeur de vitesse.
4. Si l'on veut montrer une véritable boucle de régulation du CO2, il faut identifier ou implémenter cette boucle et la valider avec une perturbation d'activité simulée. Le modèle peut superviser ; le contrôle déterministe et les protections gardent leurs rôles propres. Ce travail n'est pas réalisé par cette note.

La répétition doit rapporter une chronologie lisible : activité simulée, CO2, consigne demandée, état accepté par la carte et motif de chaque modification. Ne pas choisir des changements de vitesse uniquement pour l'image et les présenter comme de la régulation.

La minute matérielle peut montrer le moteur en fonctionnement sans plusieurs changements de régime. En revanche, la voix et les légendes ne doivent annoncer une adaptation, une qualification terminée ou une protection déclenchée que si la prise les montre réellement.
