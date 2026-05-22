/**
 * Détecte si la mission utilisateur demande un rapport dans notes/rapport.md.
 * Heuristique sur les mots-clés (pas de second appel LLM).
 */
export function missionRequiresReport(mission: string): boolean {
  const m = mission.toLowerCase();

  const keywords = [
    "rapport",
    "rédig",
    "redig",
    "sauvegard",
    "structuré",
    "structuree",
    "structur",
    "document",
    "enregistr",
    "notes/rapport",
    "fichier md",
    ".md",
    "écris dans",
    "ecris dans",
    "save_note",
  ];

  return keywords.some((k) => m.includes(k));
}
