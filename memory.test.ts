import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  buildSummaryFromMessages,
  countEpisodes,
  estimateMaxFileBytes,
  forgetProject,
  formatMemoryForPrompt,
  loadEpisodes,
  projectIdFromRoot,
  saveEpisode,
} from "./src/memory/episodes.ts";
import { MAX_EPISODES_STORED, MEMORY_DIR } from "./config.ts";

const testProjectId = `test-${Date.now()}`;

describe("mémoire épisodique", () => {
  test("formatMemoryForPrompt vide", () => {
    expect(formatMemoryForPrompt([])).toBe("");
  });

  test("buildSummaryFromMessages prend la dernière réponse assistant", () => {
    const s = buildSummaryFromMessages([
      { role: "user", content: "mission" },
      { role: "assistant", content: "Réponse finale audit." },
    ]);
    expect(s).toContain("Réponse finale");
  });

  test("save puis load épisode", async () => {
    await saveEpisode({
      mission: "Test mémoire harness",
      skillName: "security-audit",
      requiresReport: false,
      stopReason: "end_turn",
      turnsUsed: 2,
      messages: [
        { role: "user", content: "Test" },
        { role: "assistant", content: "OK test mémoire." },
      ],
      projectId: testProjectId,
    });

    const loaded = await loadEpisodes(testProjectId);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.at(-1)?.mission).toBe("Test mémoire harness");

    const block = formatMemoryForPrompt(loaded);
    expect(block).toContain("Mémoire");

    await forgetProject(testProjectId);
    expect(await loadEpisodes(testProjectId)).toEqual([]);
  });
});

describe("projectIdFromRoot", () => {
  test("produit un identifiant non vide", () => {
    expect(projectIdFromRoot().length).toBeGreaterThan(0);
  });
});

describe("MEMORY_DIR", () => {
  test("chemin sous memory/episodes", () => {
    expect(MEMORY_DIR).toContain("memory");
    expect(MEMORY_DIR).toContain("episodes");
  });
});

describe("limites taille", () => {
  test("fichier mémoire reste petit (estimation < 50 Ko)", () => {
    expect(estimateMaxFileBytes()).toBeLessThan(50 * 1024);
  });

  test("purge au-delà de MAX_EPISODES_STORED", async () => {
    const pid = `purge-${Date.now()}`;
    for (let i = 0; i < MAX_EPISODES_STORED + 3; i++) {
      await saveEpisode({
        mission: `Mission numéro ${i}`,
        skillName: null,
        requiresReport: false,
        stopReason: "end_turn",
        turnsUsed: 1,
        messages: [
          { role: "user", content: `M${i}` },
          { role: "assistant", content: `Réponse ${i}` },
        ],
        projectId: pid,
      });
    }
    expect(await countEpisodes(pid)).toBe(MAX_EPISODES_STORED);
    await forgetProject(pid);
  });
});
