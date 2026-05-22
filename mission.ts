/**
 * Détecte si la mission utilisateur demande un rapport dans notes/rapport.md.
 * Heuristique stricte (pas de second appel LLM).
 */
export function missionRequiresReport(mission: string): boolean {
  const m = mission.toLowerCase();

  /** Signaux explicites — suffisent seuls. */
  const primary = [
    "rapport",
    "notes/rapport",
    "save_note",
    "fichier md",
    "fichier markdown",
    "rapport.md",
  ];

  if (primary.some((k) => m.includes(k))) return true;

  /** Signaux composés — évite les faux positifs (.md, document, structuré seuls). */
  const needsRapportOrNotes = (extra: string[]) =>
    extra.some((k) => m.includes(k)) &&
    (m.includes("rapport") || m.includes("notes/rapport") || m.includes("notes"));

  if ((m.includes("rédig") || m.includes("redig")) && m.includes("rapport")) {
    return true;
  }

  if (needsRapportOrNotes(["sauvegard", "enregistr"])) return true;

  if (
    (m.includes("écris") || m.includes("ecris")) &&
    (m.includes("rapport") || m.includes("notes/rapport"))
  ) {
    return true;
  }

  return false;
}
