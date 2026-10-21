# Interprétation des contrats par le LLM

Le branchement est déclaré dans `specs/meaning/tools.json` : les propositions `factory.request` passent par l'interprète avant de revenir aux gardes et à l'exécution du harness. Un JSON valide ne court-circuite plus cette lecture sémantique.

Le rôle est défini par `specs/meaning/prompt.md`. Le modèle du routage `meaning` analyse les chaînes et le contexte. Il choisit ses consultations de Physics, puis rend les arguments complets ou une impossibilité motivée. Les seuls outils accessibles à ce rôle sont les lectures et calculs Physics déclarés dans sa configuration, ainsi que la remise de son interprétation. Il ne dispose pas du lancement de la tâche ou du matériel.

Le code transporte les appels choisis par le modèle, sans tableau d'alias ni conversion de grandeurs propre au scénario. L'ancienne proposition, la lecture rendue et le modèle sont conservés dans la trace. Le schéma et les gardes continuent de juger le résultat. Une impossibilité revient au superviseur pour réévaluation avant toute création de tâche, avec une limite de reprise explicite.

Vérification : le test réel du traducteur sur « motor speed » en pourcentage a conduit Nemotron à consulter Physics et à choisir `Dimensionless`, en conservant le nom `motorSpeed` et l'unité `%`. Les tests locaux couvrent aussi le passage d'un JSON valide par l'interprète et l'absence de traduction inventée lorsque le modèle retourne null. Cette vérification ne constitue pas une exécution complète du commissioning.
