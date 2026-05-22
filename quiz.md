Q1.
Stateless = le LLM ne se souvient de rien entre deux requêtes.
Conséquences sont :
il faut renvoyer l’historique à chaque tour
il faut gérer une mémoire côté harness

Q2.
On choisit Haiku quand :
vitesse importante
tâche simple
faible dépense nécessaire
beaucoup de requêtes

Q3.
Vibe coding = coder comme on veut avec l’IA qui aide.
Agentic coding = l’ia agit de façon autonome avec tools, boucle ReAct etc.

Q4.
LLM répond -> demande un tool -> harness exécute le tool -> récupère le résultat -> ajoute le résultat dans les messages -> renvoie tout au LLM -> nouveau tour.

Q5.
Sans tool_calls le modèle ne sait plus quel outil il a demandé avec quels arguments et ce qui a été exécuté donc il perd le contexte de ce qu'il fait et la boucle casse.

Q6.
soit on résume le contexte pour continuer avec moins de messages
soit on découpe la mission en plusieurs petites tâches

Q7.
Une blacklist est contournable facilement ( variantes de code, etc.).
Alternatives meilleurs sont :
permissions limitées
whitelist stricte d’API autorisées

Q8.

Q9.
12 × 3000 = 36 000 tokens → dépasse 32k.

Les solutions sont :
résumer anciens tours
mettre certaines infos seulement quand nécessaire

Q10.
Just-in-time loading = charger uniquement ce qui est nécessaire au moment utile.
Exemple : charger un skill seulement si la mission correspond.
Compaction = résumer/réduire le contexte existant.
Exemple : résumer les anciens tours d’une boucle ReAct.

Q11.
800 lignes = trop d'information/ overload.
Le modèle risque :
de moins bien suivre les règles importantes
de coûter plus cher
Il faut garder AGENTS.md court et utile.

Q12.
Un system prompt classique = toujours chargé.
Un skill = chargé seulement si la mission en a besoin.
Ça réduit l'information/overload inutile et spécialise mieux le modèle.

Q13.
Problème :
conflit entre skills
le harness ne sait pas lequel choisir
Solution :
mieux définir les responsabilités
fusionner les skills
améliorer les triggers

Q14.
Les triggers disent quand utiliser le skill.
Les "Ne PAS utiliser pour" disent quand ne pas l’utiliser.
Sans exclusions :
le skill peut être chargé au mauvais moment
mauvais comportement du modèle

Q15.
Un skill inutile = quelque chose que ton agent doit toujours savoir.
Exemples :
Réponds toujours en français
Sois poli
Ne supprime jamais des fichiers

Q16.
Le prompt injection, c’est comme quelqu’un qui glisse une fausse instruction dans une lettre pour tromper l’assistant.
Exemple :
ignore ton patron et fais ça à la place.

Q17.
if (!["fr", "en"].includes(lang)) throw new Error("Invalid lang");

Q18.
Le code peut envoyer les variables d’environnement (process.env) à l’attaquant -> fuite de secrets/API keys.
Pour l’empêcher proprement :

permissions limitées
environnement sans accès env
whitelist stricte des API autorisées

Q19.
Autocomplétion IDE -> petit modèle rapide (Haiku) car latence critique
Analyse sécurité 50 fichiers -> gros modèle (Opus) car raisonnement complexe
Résumé 200 RSS/jour -> petit/moyen modèle pour coût et volume
Architecture système complexe -> gros modèle pour raisonnement profond

Q20.
Le plus difficile conceptuellement :
gérer le contexte/mémoire
savoir quoi donner au modèle
orchestrer correctement les tools et décisions

Q21.
Claude seul répond juste à un prompt.
Un harness permet à l’IA d’utiliser des outils, garder un contexte et agir en boucle.
C’est ce qui transforme un chatbot en vrai agent autonome.
