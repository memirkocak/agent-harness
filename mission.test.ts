import { describe, expect, test } from "bun:test";
import { missionRequiresReport } from "./mission.ts";

describe("missionRequiresReport", () => {
  test("active sur demandes explicites de rapport", () => {
    expect(missionRequiresReport("Compare React et Vue et rédige un rapport structuré")).toBe(
      true,
    );
    expect(missionRequiresReport("Sauvegarde dans notes/rapport")).toBe(true);
    expect(missionRequiresReport("Utilise save_note pour le livrable")).toBe(true);
  });

  test("désactive sur missions sans rapport fichier", () => {
    expect(missionRequiresReport("Calcule moi 10*10.")).toBe(false);
    expect(missionRequiresReport("Fais un audit sécurité de ce code")).toBe(false);
    expect(missionRequiresReport("Analyse ce fichier .md dans le repo")).toBe(false);
    expect(missionRequiresReport("Rédige un document structuré sur React")).toBe(false);
    expect(missionRequiresReport("Écris dans le terminal uniquement")).toBe(false);
  });
});
