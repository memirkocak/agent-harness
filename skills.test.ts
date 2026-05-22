import { describe, expect, test } from "bun:test";
import { parseSkillMd, resolveSkillForMission } from "./src/skills.ts";

describe("parseSkillMd", () => {
  test("parse name et triggers", () => {
    const raw = `---
name: test-skill
triggers:
  - alpha
  - beta
---
# Corps skill
`;
    const { meta, body } = parseSkillMd(raw);
    expect(meta.name).toBe("test-skill");
    expect(meta.triggers).toEqual(["alpha", "beta"]);
    expect(body).toContain("# Corps skill");
  });
});

describe("resolveSkillForMission", () => {
  test("audit sécurité → security-audit", async () => {
    const s = await resolveSkillForMission("Fais un audit sécurité");
    expect(s?.skillName).toBe("security-audit");
  });

  test("calcule seul → null", async () => {
    const s = await resolveSkillForMission("Calcule 10*10");
    expect(s).toBeNull();
  });

  test("audit sécurité injection → security-audit", async () => {
    const s = await resolveSkillForMission(
      "Audit sécurité de mon site : injection SQL et XSS",
    );
    expect(s?.skillName).toBe("security-audit");
  });

  test("code review → code-review (pas security)", async () => {
    const s = await resolveSkillForMission("Fais une code review de cette PR");
    expect(s?.skillName).toBe("code-review");
  });
});
