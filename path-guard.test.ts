import { describe, expect, test } from "bun:test";
import { resolveProjectPath } from "./src/path-guard.ts";
import { PROJECT_ROOT } from "./config.ts";

describe("resolveProjectPath", () => {
  test("accepte un fichier sous la racine projet", () => {
    const p = resolveProjectPath("package.json");
    expect(p).toContain("package.json");
  });

  test("refuse la traversal", () => {
    expect(() => resolveProjectPath("../../../etc/passwd")).toThrow(
      /hors projet/,
    );
  });
});

describe("PROJECT_ROOT", () => {
  test("défini", () => {
    expect(PROJECT_ROOT.length).toBeGreaterThan(0);
  });
});
