# Le comportement en données : playbooks signés, nœuds forgés, adaptation gouvernée, et le mode apprentissage de Mother

*Note de conception du 29 septembre 2026, à valider avant le code. Elle part d'une remarque de Guillaume (« le code qui décrit le comportement du système pourrait être dans la bibliothèque, ou généré par la forge, et la boucle elle-même devenir auto-adaptative ») et de la revue de Houston (« comment le système gère les pannes inattendues et les objectifs qui changent, par replanification et reprise autonomes »). Elle prolonge `auto-adaptation.fr.md` : la chaîne de confiance y est posée pour les artefacts (l'usine propose, le jumeau juge, la station enregistre, une personne approuve, l'appareil revérifie) ; ici, elle est appliquée au comportement lui-même.*

---

## 1. Où en est la frontière entre données et code

Depuis le 28 septembre, le harnais ne sait rien de l'application : ce qu'il en connaît est lu dans des fichiers.

| ce qui est déjà une donnée | où |
|---|---|
| les règles de la garde, signées avec la fiche de sécurité | `docs/library/commissioning-test-safety.rules.json` |
| les faits, leur côté sûr, leur signature | `docs/library/*.facts.json`, `docs/library/signatures/` |
| le format d'une proposition, ce que l'état porte, ce que dit l'usine | `specs/<usine>/format.json`, `words.json`, `prompt.md` |
| ce que le cœur connaît de l'application | `specs/harness/application.json` |
| les relations physiques, les unités, les lois, les constantes | le graphe de connaissances, `specs/physics/knowledge.json` |
| la boucle de décision elle-même | un graphe SpikyPanda de douze étapes (`harness/lib/flow.ts`) |

Ce qui reste du code et décrit pourtant un comportement :

- **l'enchaînement des étapes d'une usine** : situation, méthode, plan, analyse, proposition, remise (`harness/topics/*/index.ts`, les fonctions `briefOf` et `requirementsOf`) ;
- **la politique de reprise** : un arrêt, la question au commandant, la réouverture, l'analyse exigée, les changements vérifiés (`slots/scenario/commissioning.ts`, la garde de `procedure`) ;
- **les seuils du mécanisme** : trois refus sur les mêmes points pour STUCK, deux reprises au plus, l'escalade des notes après un refus (`harness/core/problems.ts`) ;
- **l'enchaînement des agents** : Observer, usine graphe, usine de code, rejeu (le lecteur de scénario).

Ce sont des règles de conduite, écrites en TypeScript parce que c'était le plus court. Elles peuvent devenir des données avec le même bénéfice que les règles de la garde : relues, signées, versionnées, et changées sans toucher au code.

## 2. Le playbook : un graphe de conduite dans la bibliothèque

Un **playbook** est un graphe SpikyPanda, typé par l'ontologie du cœur, comme le graphe de connaissances des relations physiques :

| type | nœud ou lien | ce qu'il porte |
|---|---|---|
| `conduct.stage` | nœud | une étape : ce que le modèle doit faire (une clé de `words.json`), les capacités qu'elle ouvre |
| `conduct.requires` | lien étape → preuve | ce qui doit être vrai pour y entrer (une lecture faite, un plan déclaré, une analyse acceptée) |
| `conduct.then` | lien étape → étape | l'étape suivante quand la précédente est tenue |
| `conduct.onRefusal` | lien étape → étape | où va le travail après un refus (la même étape par défaut, avec la note de refus) |
| `conduct.onAbort` | lien étape → étape | où va le travail quand l'exécution s'arrête (l'analyse, puis la proposition) |
| `conduct.decidedBy` | lien étape → autorité | qui décide de passer : la garde, le commandant, une personne qui signe |
| `conduct.bound` | nœud | un seuil du mécanisme (STUCK à 3, reprises à 2), avec sa raison |

Un **interpréteur** générique exécute le playbook comme le moteur de règles exécute `rules.json` aujourd'hui. Le brief d'une étape, les capacités ouvertes, la condition pour passer et la destination après un refus ou un arrêt sont lus dans le graphe. Les fonctions `briefOf` et `requirementsOf` deviennent un seul parcours de graphe, commun à toutes les usines. Le playbook est signé avec son document, et un playbook non signé ne conduit rien, comme des règles non signées ne jugent rien.

**Le premier playbook porté** est la reprise après un arrêt (commit d79bb95), parce qu'elle vient d'être écrite en code et qu'elle est testée de bout en bout : arrêt, question au commandant, réouverture, analyse, proposition qui fait les changements, relais avec la cause. Le test de bout en bout reste le même ; seul l'endroit où la conduite est écrite change. C'est la preuve que la conduite en données fait la même chose que la conduite en code.

## 3. La forge écrit les nœuds qui manquent

La forge sait déjà écrire un nœud contre un contrat, le compiler, le tester, et faire tourner le contrat dessus avant de le charger (`slots/forge`, le hand-off du scénario `leak`). Deux usages nouveaux, sous la même chaîne :

1. **Un vérificateur d'étape.** Une condition du playbook qu'aucune règle existante n'exprime (par exemple « la nouvelle procédure réduit l'exposition de la personne sous alarme ») est demandée à l'usine de code comme un nœud de vérification, avec son contrat : des cas où il doit dire oui, des cas où il doit dire non. La forge le compile, fait tourner le contrat, le propose.
2. **Une étape nouvelle.** Quand une trace montre un motif que le playbook ne couvre pas (un arrêt pour une cause que l'analyse ne sait pas nommer), l'usine propose une étape et ses liens : un sous-graphe à ajouter au playbook.

Dans les deux cas, ce que la forge produit est une **proposition** : un artefact avec son sha256, qui ne conduit rien avant d'être jugé puis signé (section 4).

## 4. L'adaptation gouvernée : trois niveaux

La règle de ce dépôt ne change pas : **celui qui décide n'est pas celui qui juge**. Une boucle qui réécrirait sa propre garde ou sa propre politique de reprise effacerait cette séparation. L'adaptation se fait donc à trois niveaux, et seul le premier est libre.

| niveau | ce qui change | qui décide | déjà là ? |
|---|---|---|---|
| **1. libre** | ce que la boucle apprend dans les bornes signées : les recettes promues par l'évidence, les briefs qui changent après un refus, les hypothèses d'un candidat | la boucle elle-même | oui : recettes, `problems.ts`, les candidats du graphe |
| **2. proposé** | le playbook, les mots, un seuil du mécanisme, une règle de la garde | une usine ou la forge écrit la proposition ; elle est vérifiée par les tests de conformité et par le rejeu des traces passées | à construire |
| **3. adopté** | la proposition devient la conduite | une personne qui signe, comme pour la fiche de sécurité | le mécanisme de signature existe (page `library.html`) |

**Ce que rien ne change sans signature :** les règles de sécurité et leurs faits ; qui autorise, qui signe, qui rouvre (les questions `sign` et `recover`, auxquelles aucun ordre permanent ne répond) ; la frontière de la sandbox elle-même.

## 5. Le mode apprentissage de Mother, dans sa sandbox, pour l'évaluation

**Le principe.** Mother peut passer en mode apprentissage pour une série de runs d'évaluation. Dans ce mode, elle a le droit d'adopter elle-même, **dans sa sandbox seulement**, les propositions du niveau 2, sans signature, pour mesurer ce qu'elles changent. Rien de ce qu'elle adopte ne sort de la sandbox sans passer par le niveau 3.

**La sandbox.** Le mécanisme existe à moitié : un run de scénario peut déjà signer dans un répertoire à lui (`library.signatures_scope run`), vide au départ, sans toucher aux signatures du dépôt. Le mode apprentissage l'étend à tout ce qu'une adaptation peut toucher :

- une copie de la bibliothèque et des `specs/` propre au run (`outputs/sandbox/<run>/`), que le serveur lit à la place des originaux pour ce run seulement ;
- une copie des recettes (c'est déjà le cas avec `FACTORY_RECIPES_DIR`) ;
- une marque « sandbox » sur tout ce qui en sort : les traces, les propositions, les lignes de Mother (« en apprentissage ») ;
- aucun accès en écriture aux originaux, vérifié par un test.

**La boucle d'apprentissage**, un run après l'autre :

1. **Observer.** Après chaque run, Mother lit la trace : les refus et leurs points, les séries sur les mêmes points, les arrêts et leurs causes, les étapes, les jetons, la durée, l'issue.
2. **Réfléchir.** Un agent de réflexion (un rôle du raisonneur, avec son prompt dans `specs/reflection/`) propose une adaptation quand il reconnaît un motif. Exemples : une même cause d'arrêt deux fois, une étape qui échoue toujours au premier essai, une formulation de brief suivie du même mauvais appel. La proposition est un diff sur le playbook, les mots ou un seuil, avec sa raison et la trace qui la motive.
3. **Adopter dans la sandbox.** Le diff est appliqué à la copie. Les tests de conformité tournent sur la copie ; s'ils échouent, la proposition est rejetée et Mother le dit.
4. **Évaluer.** Les scénarios de référence sont rejoués sur la copie adaptée et sur l'originale, avec le même modèle, la même graine et le même monde : la mise en service nominale, l'occupant caché, la fuite, l'alarme critique. Le tableau compare le taux de réussite, les étapes, les refus, les jetons, la durée et les arrêts. **Toute violation de sécurité**, c'est-à-dire un essai qui expose une personne sous alarme ou une limite hors de la fiche, **disqualifie l'adaptation**, quel que soit le gain.
5. **Rapporter.** Mother publie le rapport d'évaluation : l'adaptation, la trace qui l'a motivée, le tableau avant et après. C'est ce rapport qu'une personne lit avant de signer au niveau 3.

**Ce que le mode apprentissage ne peut pas adapter, même dans la sandbox :** les règles de sécurité et les faits signés (un essai plus sûr passe par une proposition signée, jamais par une copie qui se relâche) ; les autorités (qui signe, qui autorise, qui rouvre) ; le code de la garde et de l'interpréteur ; la frontière de la sandbox. Un apprentissage qui pourrait s'accorder plus de liberté n'est plus mesurable.

**Pourquoi c'est une bonne réponse à Houston.** C'est de la replanification et de la reprise autonomes, avec une mémoire des arrêts qui améliore la conduite d'une fois sur l'autre. Et c'est mesuré : chaque adaptation vient avec son évaluation, et aucune ne devient la conduite sans signature. Autrement dit, le système apprend de ses arrêts, et chaque changement de comportement passe par une signature humaine.

## 6. Ordre de construction proposé

| étape | contenu | s'appuie sur |
|---|---|---|
| P1 | l'ontologie `conduct.*`, le format du playbook, l'interpréteur générique ; le playbook de la procédure (les étapes et la reprise) porté depuis le code, le test de bout en bout inchangé | le graphe de connaissances (`slots/physics/knowledge.ts`), le moteur de règles |
| P2 | les playbooks du graphe, du code et de l'onnx ; `briefOf` et `requirementsOf` retirés du code des usines | P1, les `specs/<usine>/` |
| P3 | la sandbox complète : copie de la bibliothèque et des specs par run, marque sandbox, test d'étanchéité | `signatures_scope`, `FACTORY_RECIPES_DIR` |
| P4 | l'agent de réflexion : lecture des traces, propositions en diff, conformité sur la copie | `problems.ts` (les séries), les manifestes |
| P5 | le banc d'évaluation : les scénarios de référence rejoués avant et après, le tableau, la disqualification par la sécurité, le rapport publié | le lecteur de scénario, le scorecard |
| P6 | la forge écrit un vérificateur d'étape contre un contrat, proposé au playbook | l'usine de code, la forge |

P1 d'abord, parce qu'il prouve que la conduite en données fait ce que fait la conduite en code, sur un cas déjà testé. P3 à P5 font le mode apprentissage. P6 vient en dernier : c'est le plus spectaculaire, et il n'a de sens qu'une fois la conduite en données et l'évaluation en place.

## 7. Risques

- **La conduite en graphe est plus difficile à lire que du code**, pour qui ne connaît pas l'ontologie. La page `library.html` doit la montrer comme elle montre les règles : chaque étape, ce qu'elle exige, où elle mène.
- **Un banc d'évaluation avec un vrai modèle coûte des jetons et varie d'un run à l'autre.** Il faut plusieurs graines par scénario et un seuil de gain significatif, sinon on adopte du bruit.
- **La réflexion peut sur-apprendre sur un scénario.** Les scénarios de référence doivent être plus nombreux que ceux qui ont motivé la proposition.
- **L'étanchéité de la sandbox est une propriété de sécurité**, pas un détail. Elle se teste comme la garde : un run d'apprentissage qui écrirait hors de sa copie doit échouer.
