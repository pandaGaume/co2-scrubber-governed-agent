# L'évaluateur post-procédure

*Conception, 2026-09-30.* Pendant deux jours, un humain et moi avons relu à la main les épisodes des tâches qui échouaient pour trouver pourquoi. L'évaluateur fait ce travail, puis propose des corrections qu'une personne approuve. Il n'en applique jamais aucune lui-même.

## Pourquoi

La mémoire apprend de l'expérience, mais elle ne dit pas *ce que* l'expérience révèle. Une entrée consolidée peut compenser en silence un trou du contrat : la règle « une seule référence » a été apprise par Sonnet alors que c'était une règle du guard jamais écrite. Les expériences du 29 et du 30 septembre ont montré que la plupart des échecs répétés venaient du harnais ou de mes tâches, pas du modèle :

| Cas réel | Ce qu'on voyait | Ce que c'était | Correction |
|---|---|---|---|
| Troncature à 4096 | « capability outside the allowlist » | réponse coupée, motif perdu en mode state | artefact du harnais : motif `truncated`, limite 8192 |
| Référence composite | « is not a fact of the library » | règle du guard jamais énoncée, message trompeur | trou de contrat : schéma, C, message du guard |
| `Speed` en percent | quantité refusée puis supprimée | homonymie propriété / grandeur, refus sans la bonne réponse | trou de contrat : le refus nomme la grandeur déclarée |
| Boucle de lecture | STUCK après un abort | le brief promettait la procédure abortée, absente ; JSON illisible | trou de contrat et artefact du harnais |
| Historique fictif | procédure introuvable | mes tâches de validation | artefact de l'expérience |
| `steps.0` (GPT) | justification manquante | convention de chemin jamais énoncée | trou de contrat |
| `/steps/0/reason` | `steps.0` chez Sonnet, 3 tâches sur 3 | un exemple dans la description d'un outil | régression causée par un changement du harnais |
| v4, analyse et procédure en désaccord | refus « analysis » | incohérence du modèle, règle énoncée | rien : erreur du modèle, corrigée au retry |

L'évaluateur doit arriver à ces mêmes conclusions tout seul, à partir des traces.

## Ce qu'il est, et ce qu'il n'est pas

- **Il lit.** Il lit les manifestes (la vérité terrain), les épisodes, le registre de la mémoire et les textes du contrat tels que le modèle les a reçus.
- **Il classe.** Chaque constat reçoit une classe : trou de contrat, artefact du harnais, régression, lacune de la bibliothèque, politique apprise, connaissance du domaine, ou erreur du modèle.
- **Il recommande.** Il écrit une proposition (le texte à changer, la raison, les preuves, la vérification à faire) et la dépose pour signature.
- **Il n'applique rien.** Il ne modifie ni le contrat, ni le guard, ni la bibliothèque, ni la mémoire. Une recommandation acceptée est d'abord appliquée dans un fork et mesurée, comme on l'a fait à la main.
- **Il ne juge pas le modèle en soi.** « Le modèle s'est trompé » est une conclusion permise, mais seulement quand la règle était énoncée et que le modèle avait l'information.

## Les entrées

1. **Les épisodes** (`harness/core/episodes.ts`, `lib/working-memory.ts`), sur une fenêtre plus large que la mémoire de travail : toutes les tâches du topic depuis le dernier passage de l'évaluateur. Il y trouve les tentatives, qui a tranché, les problèmes et les contrastes X/Y.
2. **Les traces** (`trace.jsonl`). Il y lit ce que le modèle a réellement reçu avant de se tromper : l'état, le brief et les descriptions des outils. C'est ce qui permet de savoir si une règle était énoncée.
3. **Les empreintes des manifestes** : le modèle et le fournisseur (`provider`), les descriptions d'outils (`tools.sha256`), le prompt (`prompt.sha256`) et, à ajouter, le commit du dépôt. Il repère ainsi une régression après un changement de texte, et une divergence entre modèles.
4. **Le registre de la mémoire** (`adaptations/ledger.json`, `memory/<topic>.json`) : les entrées candidates, en essai et consolidées, avec les épisodes sur lesquels elles reposent.
5. **Le registre des règles du guard** (à créer, voir plus bas) : pour chaque règle, son code, les textes du contrat qui l'énoncent, et le message de refus.

## Les détecteurs, déterministes d'abord

Comme `observe()` pour la réflexion, les détecteurs sont du code, sans modèle. Ils produisent des constats avec leurs preuves. Un modèle n'intervient qu'après, pour rédiger une proposition.

| Détecteur | Ce qu'il cherche | Classe proposée |
|---|---|---|
| **D1, règle non énoncée** | Un refus du guard récurrent dont la règle n'apparaît dans aucun texte que le modèle a reçu avant sa première soumission. La comparaison se fait via le registre des règles, et la trace sert de témoin. | trou de contrat |
| **D2, corrigé au premier retry** | La même forme d'échec, corrigée en un retry par le même Y dans plusieurs tâches. Le modèle sait faire dès qu'on lui dit : l'information manquait, la compétence non. | trou de contrat ou politique apprise (tranché par D1) |
| **D3, divergence entre modèles** | Une forme fréquente chez un modèle et absente chez les autres, sur les mêmes tâches. Les modèles comblent une ambiguïté chacun à leur façon, comme `reference` : citation chez Sonnet, identifiant chez GPT et Fable. | trou de contrat (ambiguïté) |
| **D4, artefact du harnais** | Troncature (`stop_reason`), refus avant le guard, boucle STUCK sur des lectures, compactage qui renvoie toujours la même forme, champ promis par le brief et absent de l'état. | artefact du harnais |
| **D5, régression** | La fréquence d'une forme avant et après un changement d'empreinte (`tools.sha256`, `prompt.sha256`, commit). C'est l'effet d'amorçage `/steps/0` : 0 sur 3 avant, 3 sur 3 après. | régression (le changement fautif est désigné) |
| **D6, entrée de mémoire** | Pour chaque entrée consolidée : ses échecs sont-ils des refus d'une règle non énoncée (D1) ? Alors l'entrée compense un trou de contrat, et on recommande de l'écrire dans le contrat. Porte-t-elle sur l'ordre du travail ? Alors c'est une politique. Porte-t-elle sur le comportement de l'installation (aborts, mesures, écarts du jumeau) ? Alors c'est une connaissance du domaine. | selon le cas |
| **D7, lacune de la bibliothèque** | Un fait manquant ou ambigu : un refus « no fact bounds it », une citation vers un document non signé, une valeur cherchée dans plusieurs documents sans résultat. | lacune de la bibliothèque |
| **D8, erreur du modèle** | La règle est énoncée (D1 négatif), l'information était dans l'état, la forme est isolée ou corrigée au retry, et aucune divergence entre modèles. | erreur du modèle : pas de recommandation, compté seulement |

Le seuil de récurrence reprend celui de la mémoire (au moins 2 tâches), et les formes reprennent celles de `shapesOf`. Un constat isolé est gardé, mais sans recommandation.

## Le registre des règles du guard

D1 a besoin de savoir, pour chaque règle que le guard applique, *où le contrat l'énonce*. Aujourd'hui, ce lien n'existe que dans ma tête.

- **Chaque vérification du guard a un code.** Exemples : `INVALID_REFERENCE_CARDINALITY`, `UNKNOWN_UNIT`, `ANALYSIS_UNCHANGED`, `PATH_BY_POSITION`.
- **Un fichier de spec** (`specs/<topic>/rules.contract.json`, jamais adaptable par la réflexion) associe à chaque code les textes qui l'énoncent : un chemin dans le schéma, une clé de mots, une clé de grammaire.
- **Un test de conformité** vérifie que chaque code a au moins un énoncé et que cet énoncé existe vraiment. Une règle non énoncée ne peut plus exister sans que ce test échoue ou qu'elle soit marquée « tacite, voulue ».
- **À l'exécution**, D1 vérifie que le modèle avait bien reçu cet énoncé : l'étape du playbook l'affiche-t-elle, et la trace le contient-elle ?

Ce registre est aussi la réponse à la question de départ : écrire le contrat plutôt que l'apprendre.

## De la découverte à la recommandation

Pour chaque constat récurrent, une **usine de recommandation** rédige la proposition, sur le modèle de l'usine de réflexion (topic, guard, playbook, script de remplacement) :

- **Contrat** : un nouveau texte pour une description de schéma, une clé de mots ou une grammaire, en anglais uniquement pour ce que lisent les modèles. Le guard de l'usine refuse un exemple qui contredit la convention que le guard applique : c'est la leçon de `/steps/0`.
- **Message du guard** : dire la vraie raison, sans changer la décision.
- **Décision du guard** : proposée seulement, marquée « change ce qui est accepté », avec un niveau d'approbation plus élevé.
- **Bibliothèque** : un fait manquant ou ambigu, déposé sur le rayon des propositions (`library-proposals`, comme les playbooks), non signé.
- **Mémoire** : garder l'entrée, la retirer une fois le contrat corrigé, ou la re-classer.

Chaque proposition porte :

- sa classe ;
- ses preuves (les épisodes, les comptes, les modèles concernés) ;
- le texte proposé ;
- l'effet attendu ;
- un plan de vérification : quelles tâches rejouer, dans quelles conditions (sans mémoire, en condition A), avec combien de tâches.

## La gouvernance

- **Les propositions vont sur le rayon des propositions.** Mother les annonce, la page de la bibliothèque les montre, et le rôle `authorised-signatory` les signe ou les refuse. Aucune n'est appliquée sans signature. Un modèle ne signe jamais.
- **Signée, une proposition est appliquée dans un fork**, puis mesurée par le plan de vérification (le driver et les conditions de `scripts/learning-experiment` servent tels quels). Le résultat revient avec la proposition :
  - amélioration : elle est intégrée au dépôt par un commit humain ;
  - effet nul ou régression : elle est rejetée, avec la mesure.
- **L'évaluateur surveille aussi les corrections.** Après chaque changement d'empreinte, D5 compare les formes avant et après. Une correction qui fait apparaître une nouvelle forme est signalée, comme on l'a fait pour `/steps/0`.

## Quand il tourne

- **Après chaque tâche**, en léger : D4 et D8, qui ne demandent que la tâche elle-même. Les artefacts graves, comme une boucle ou une troncature, sont signalés tout de suite.
- **Par lots** (sur demande, ou tous les N tâches d'un topic) : D1, D2, D3, D5, D6 et D7, qui ont besoin de plusieurs tâches et de plusieurs modèles.
- **Dans un fork ou sur le dépôt**, en lecture seule dans les deux cas. Les propositions vont sur le rayon, et l'application passe toujours par un fork.

## Comment on sait qu'il marche

Les huit cas du tableau du début forment un corpus de test : leurs traces sont conservées dans `docs/experiments/*`, et certaines tâches dans les forks. L'évaluateur doit :

- classer chacun comme on l'a fait ;
- ne rien recommander pour v4 (erreur du modèle) ;
- désigner le changement fautif pour `/steps/0`.

C'est le test de non-régression de l'évaluateur lui-même, sans modèle pour les détecteurs.

## Ce qu'il faut ajouter au harnais

1. **L'empreinte du dépôt dans chaque manifeste** (le commit et son état) : le dernier maillon manquant pour D5.
2. **Des codes stables pour les refus du guard.** Certains existent déjà (`UNKNOWN_UNIT`, `INVALID_REFERENCE_CARDINALITY`), il faut les généraliser.
3. **Le registre des règles** et son test de conformité.
4. **Les traces conservées assez longtemps.** Les dossiers de tâches des forks ne sont pas versionnés ; l'évaluateur a besoin qu'ils vivent jusqu'à son passage. La suppression du fork contaminé a déjà coûté trois traces.

## Plan

- **E1. Détecteurs et rapport.** D4, D5 et D8 d'abord, puis D2 et D3 à partir des épisodes, avec la page qui les montre et le corpus de test des huit cas. Aucun modèle.
- **E2. Registre des règles.** Les codes du guard, `rules.contract.json`, le test de conformité, puis D1 et D6.
- **E3. Usine de recommandation.** Le topic, le guard (dont l'interdiction des exemples contradictoires), le script de remplacement et le dépôt sur le rayon des propositions. D7 et les propositions pour la bibliothèque.
- **E4. Boucle de vérification.** La proposition signée est appliquée dans un fork, mesurée par son plan, puis intégrée ou rejetée avec sa mesure.

E1 et E2 suffisent à retrouver les huit cas sans modèle. E3 et E4 ferment la boucle que nous avons faite à la main ces deux jours.
