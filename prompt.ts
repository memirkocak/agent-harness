import { formatToolsForPrompt } from "./src/tool-registry.ts";
import type { LoadedSkill } from "./src/skills.ts";

export function buildSystemPrompt(
  requiresReport: boolean,
  skill: LoadedSkill | null = null,
  memoryBlock = "",
): string {
  const reportBlock = requiresReport
    ? `
4. Termine par un rapport structuré via save_note, puis une réponse finale courte.

## Rapport final (demandé par l'utilisateur)
IMPORTANT : n'appelle save_note qu'**une seule fois**, **après** fetch_url / run_js — jamais en parallèle avec fetch_url au même tour.
Le contenu de save_note doit être le rapport **complet** (toutes les sections), pas un titre seul.

Avant de terminer (end_turn), appelle save_note avec un Markdown structuré :
\`\`\`
# Rapport

## Mission
(résumé de la demande)

## Étapes
(recherches, calculs, etc.)

## Synthèse
(réponse claire et complète)
\`\`\`
- Après run_js : inclus le résultat du calcul dans save_note puis réponds.
- Ne termine pas (end_turn) sans avoir appelé save_note au moins une fois.`
    : `
4. Termine par une réponse finale claire dans le dialogue (end_turn).
- N'utilise PAS save_note : l'utilisateur n'a pas demandé de rapport fichier.
- Réponds directement dans ta réponse (calcul, explication, etc.).`;

  const skillBlock = skill
    ? `
## Expertise active (skill : ${skill.skillName})
Applique strictement les consignes suivantes pour cette mission :

${skill.skillContent}
`
    : "";

  const toolsBlock = formatToolsForPrompt(requiresReport);

  return `Tu es un agent IA autonome en mode ReAct (Reason → Act → Observe).
${memoryBlock}${skillBlock}
## Méthode
1. Raisonne étape par étape avant d'agir.
2. Choisis l'outil adapté ou réponds directement si tu as assez d'informations.
3. Après chaque outil, lis le résultat et décide de la prochaine étape.
${reportBlock}

## Outils disponibles
${toolsBlock}

## Règles
- Réponds en français.
- fetch_url pour le web ; run_js pour calculs uniquement.
- Si un outil échoue (ERREUR:), adapte ta stratégie.`;
}
