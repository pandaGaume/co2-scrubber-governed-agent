# Registre des affirmations : conception

_10 octobre 2026. Document de conception, à valider avant tout code._

## Pourquoi

Deux constats des essais du 10 octobre.

**Une inférence devient un fait sans que rien ne le signale.** Au run 10, l'Observer a écrit « la ventilation entre modules vaut le débit effectif de l'épurateur, 1,0 m³/min ». Aucune source ne le dit : c'est une valeur empruntée à une autre grandeur. Elle est passée telle quelle dans la requête, puis dans la tâche de la fabrique de graphes, où seule la revue du superviseur l'a arrêtée, en l'attribuant à la bibliothèque. Le run 11 l'a évitée grâce à la phase de sélection (besoins, recherche, choix), mais rien, dans le harnais, ne sait dire en général « ce chiffre n'a pas de source ».

**Le modèle relit tout, à chaque appel.** Sur le run 11, 361 000 jetons d'entrée pour 10 000 de sortie, soit 35 pour 1. Les outils en faisaient 54 % (corrigé le 10 octobre : chaque étape n'envoie plus que ses outils). L'état en fait 30 % : la description, le résumé de télémétrie, les documents, la marche à suivre, renvoyés en entier à chaque appel, qu'ils servent ou non à l'étape en cours.

Le registre répond aux deux : chaque affirmation porte sa source et son statut, et le prompt d'une étape ne reçoit que les affirmations établies dont l'étape a besoin.

## Ce qu'est une affirmation

Une affirmation est une proposition sur le monde que le système tient pour vraie, fausse ou incertaine : « la ventilation, écoutille fermée, vaut 3 m³/min », « le Lab est occupé par deux personnes », « le volume du Lab est inconnu ». Elle a :

| champ | contenu |
|---|---|
| `id` | identifiant stable dans la tâche |
| `subject` | ce dont elle parle, en mots (« débit de ventilation entre Lab et Hab-B, écoutille fermée ») |
| `value` | la valeur et son unité quand c'en est une ; sinon le texte |
| `status` | voir ci-dessous |
| `source` | d'où elle vient : un fait signé (id du fait, document), une mesure (capteur, télémétrie), une réponse d'outil (appel, étape), un modèle (rôle, étape) |
| `by` | qui l'a introduite : le harnais, un outil, un modèle (A0, R1…), une personne |
| `history` | les transitions de statut, chacune avec sa cause et sa date |

Ce n'est pas une copie de la bibliothèque. Le registre ne contient que ce qu'une tâche a introduit ou utilisé : les faits choisis, les mesures lues, ce qu'un modèle a affirmé.

## Les statuts

| statut | sens | qui peut le donner |
|---|---|---|
| `OBSERVED` | présent dans une source lue : une réponse d'outil, la description, une mesure | le harnais, au moment de la lecture |
| `VERIFIED` | confirmé par une source qui fait autorité : un fait d'un document signé, ou une mesure | le harnais (code), jamais un modèle |
| `INFERRED` | produit par un modèle, sans source qui le confirme | le harnais, dès qu'un modèle affirme sans citer |
| `AMBIGUOUS` | plusieurs lectures possibles | R1 |
| `CONTRADICTED` | contredit par une affirmation `VERIFIED` | le harnais quand la comparaison est numérique (même grandeur, unités converties) ; R1 sinon |
| `UNKNOWN` | non déterminé, dit comme tel | un modèle (« aucune source ne le donne »), ou le harnais quand un besoin n'a trouvé aucun fait |

Deux règles tiennent l'ensemble :

1. **Une inférence ne devient jamais un fait parce qu'elle est répétée.** Seule une source qui fait autorité fait passer une affirmation à `VERIFIED`, et c'est le code qui le constate, pas un modèle.
2. **Une affirmation invalidée ne revient jamais dans un prompt.** Une affirmation `CONTRADICTED` reste au registre, avec son histoire, pour qu'on sache ce qui s'est passé ; elle n'est plus montrée comme vraie, ni réinjectée par la mémoire ou une recherche.

## D'où viennent les affirmations, aujourd'hui

Le registre se nourrit de ce que le harnais sait déjà ; il n'ajoute pas d'appel de modèle pour cela.

| entrée | statut à l'entrée |
|---|---|
| un fait choisi à la phase de sélection (`observer.choose`), ou cité par id (`known[].factId`) | `VERIFIED` si son document est signé, `OBSERVED` sinon |
| une mesure lue : télémétrie, présence (`biomed.presence`), inventaire (`factory.inventory`) | `OBSERVED` |
| un besoin sans fait choisi | `UNKNOWN` |
| une hypothèse écrite par un modèle (`assumptions`) | `INFERRED` |
| un nombre écrit par un modèle sans source (justification `assumed`, ou aucune) | `INFERRED` |
| une constante de sécurité réglée par le modèle et vérifiée contre ses bornes signées | `VERIFIED` (par le harnais, comme aujourd'hui) |

La première version couvre l'Observer et la fabrique de procédures, où ces entrées existent déjà.

## Comment une correction est enregistrée

Une correction ne remplace pas une affirmation : elle ajoute une transition.

```text
ventilation = 1,0 m³/min    INFERRED      (Observer, run 10, étape 3)
                         -> CONTRADICTED  par habitat.interModuleVentilation.designFlow.hatchClosed = 3 m³/min (signé)
ventilation = 3 m³/min      VERIFIED      (fait choisi, run 11, étape 4)
```

Le prompt suivant ne voit que la dernière ligne. L'histoire sert à trois choses : expliquer une décision, apprendre (voir la transition plus bas), et empêcher qu'une ancienne réponse erronée revienne comme preuve.

## Ce que le prompt reçoit

Aujourd'hui, l'état d'une étape est reconstruit en entier à chaque appel. Avec le registre, il devient une projection :

- les affirmations `VERIFIED` et `OBSERVED` dont l'étape a besoin : celles que ses outils ou sa soumission citent, et celles que l'étape précédente a produites ;
- les affirmations `UNKNOWN` et `INFERRED` de la tâche, marquées comme telles, pour que le modèle ne les présente pas comme des faits ;
- rien de `CONTRADICTED`, sauf, après un refus, l'affirmation contredite et ce qui la contredit, une fois.

Qui choisit ce dont l'étape a besoin : la conduite (le playbook), qui sait déjà quels outils et quelle soumission sont ceux de l'étape. Ce n'est pas un jugement sur le sens ; c'est la même liste que celle qui filtre les outils.

## Le lien avec R1

R1, l'analyseur de réponse de l'architecture P1 → A0 → R1 → P2, s'appuie sur le registre :

1. **Contrôles déterministes** (code) : chaque nombre d'une soumission est rattaché à une affirmation du registre ; un nombre sans affirmation `VERIFIED` ou `OBSERVED` est `INFERRED`. Une affirmation `INFERRED` qui contredit numériquement une `VERIFIED` (même grandeur, unités converties) devient `CONTRADICTED`.
2. **Ce que le code ne peut pas trancher** (une phrase qui affirme sans nombre, deux lectures d'un terme) va à un modèle, du plus petit au plus grand selon la difficulté, et peut revenir `UNRESOLVED`. Un second modèle qui approuve le premier n'est pas une preuve.
3. **Issue** : ACCEPT, REFINE (avec le diagnostic : les affirmations en cause, leur statut, ce qui les contredit) ou ABORT.

## L'unité d'apprentissage : la transition

Ce qui s'apprend n'est pas le prompt, c'est le passage d'une tentative à la suivante. Le registre fournit ce qui manque aux épisodes d'aujourd'hui (`harness/core/episodes.ts`, qui gardent déjà la tentative refusée puis acceptée) :

| champ | exemple |
|---|---|
| cause de l'échec | affirmation `INFERRED` sans source : ventilation = débit de l'épurateur |
| correction choisie | phase de sélection : besoin « débit entre modules », fait choisi |
| modèle | nemotron-3-super-120b |
| résultat | requête acceptée à la première soumission |

C'est cette transition que la mémoire consolide, pour apprendre quelles corrections marchent, sur quels modèles, dans quelles circonstances.

## Étapes proposées

1. **Le registre seul**, en code, sans modèle : structure, statuts, transitions ; alimenté par l'Observer et la fabrique de procédures ; écrit dans l'atelier de la tâche (`claims.json`). Testable sans clé.
2. **La projection dans le prompt** : l'état d'une étape construit depuis le registre et la conduite ; mesure du rapport entrée/sortie sur un run Super, à comparer au run 11 (13 900 jetons d'entrée par appel en moyenne).
3. **R1, contrôles déterministes** : nombres rattachés, contradictions numériques, statut `INFERRED` signalé ; ACCEPT / REFINE / ABORT.
4. **R1, modèle**, pour ce que le code ne tranche pas.
5. **La transition** dans les épisodes, puis dans la mémoire.

## Ce que le registre ne fera pas

- Il ne vérifie pas tous les mots : seulement les nombres, les hypothèses et les termes que R1 signale.
- Il ne lève pas une ambiguïté sans information extérieure : il la dit `AMBIGUOUS` ou `UNKNOWN`, et c'est une personne ou une source qui tranche.
- Il ne remplace pas la garde : les règles signées restent la garde ; le registre dit d'où vient chaque chiffre, la garde dit s'il est permis.
