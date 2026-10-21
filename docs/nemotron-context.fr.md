# Appels courts pour Nemotron

Statut au 21 octobre 2026 : le mécanisme décrit ci-dessous est retiré du chemin actif du reasoner. Les traces ont montré des outils conservés du tour précédent et des boucles de pagination terminant les tâches. Le reasoner transmet à nouveau le prompt du rôle, ses outils autorisés et le mode de contexte demandé par le harness. Cette restauration ne résout pas à elle seule les erreurs de contrat des quantités ou les budgets trop courts. Aucune nouvelle mission réelle n'a encore validé le parcours complet.

Le chemin OpenAI-compatible de la famille Nemotron utilise un état reconstruit à chaque appel, sans rejouer le transcript. Pour une lecture interne, seul le dernier appel et sa réponse native sont conservés. Les autres familles conservent leur comportement.

Un socle court rappelle les limites du rôle, les preuves, la récupération, les autorisations et la séparation entre travail délégué et mission. L'objectif reste visible en entier. Sa copie identique dans l'état renvoie à ce texte déjà fourni, sans lecture supplémentaire. La structure des objets reste visible, notamment la phase, les refus et les décisions d'autorité. Les instructions détaillées originales et les longues valeurs documentaires restent consultables par référence vers leurs données exactes, sans résumé produit par le code.

Le modèle choisit lui-même ses lectures avec `context.read`, par pages de 2 400 caractères, et conserve ses faits utiles avec leurs sources dans des notes de travail de 2 000 caractères maximum. Ces notes sont du raisonnement du modèle, jamais une nouvelle source autoritative. L'état courant prime sur elles.

Le catalogue présente les identifiants et de courtes descriptions. Avec `context.tools`, le modèle charge les schémas complets de quatre outils maximum, puis choisit son action. Les outils sélectionnés restent disponibles au tour suivant s'ils sont encore autorisés, mais les outils que le harness vient d'ouvrir (une nouvelle étape de l'ordre de marche) passent devant : une sélection héritée ne masque jamais ce qui est désormais permis. Le code ne sélectionne aucune réponse métier, aucun profil de test et aucune conclusion.

Douze lectures ou sélections internes maximum précèdent une décision métier. Une fois la limite atteinte, le dernier appel ne propose plus que les actions métier : la décision aboutit à une action que les gardes jugent (refus, question, échec de la tâche), jamais à un succès inventé ni à une erreur qui suspend la mission. Les pages internes ne passent pas au broker et ne commandent aucun dispositif. Chaque action métier revient au harness normal et à ses gardes.

Les traces gardent les requêtes et réponses des lectures internes, leur coût cumulé et la proposition métier finale. La console ne reproduit plus les gros arguments du reasoner. Les schémas chargés sont complets et leur taille peut encore dominer un appel complexe; ce mécanisme ne promet donc pas un plafond absolu en tokens.

La vérification locale couvre la restitution intégrale des sources, la sélection des outils par le modèle, la réduction des observations et l'absence de modification des données d'entrée. Elle ne remplace pas une mesure en conditions réelles avec Nemotron.
