import { describe, expect, test } from "bun:test";
import {
  isReportToolSuccess,
  normalizeReportContent,
  REPORT_UNCHANGED_MARKER,
  REPORT_WRITTEN_MARKER,
} from "./tools.ts";
import { assertSafeUrl } from "./src/url-guard.ts";
import { list_dir, read_file } from "./tools.ts";

describe("assertSafeUrl", () => {
  test("accepte https public", () => {
    expect(() => assertSafeUrl("https://example.com/page")).not.toThrow();
  });

  test("refuse localhost", () => {
    expect(() => assertSafeUrl("http://localhost/admin")).toThrow(/non autorisé/);
  });

  test("refuse file protocol", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(/Protocole/);
  });
});

describe("normalizeReportContent", () => {
  test("retire fence markdown", () => {
    const out = normalizeReportContent("```markdown\n# Titre\n```");
    expect(out).toBe("# Titre");
  });
});

describe("read_file / list_dir", () => {
  test("lit package.json", async () => {
    const out = await read_file("package.json");
    expect(out).toContain("agent-harness");
  });

  test("liste la racine", async () => {
    const out = await list_dir(".");
    expect(out).toContain("[file]");
  });
});

describe("isReportToolSuccess", () => {
  test("détecte les marqueurs rapport", () => {
    expect(isReportToolSuccess(`${REPORT_WRITTEN_MARKER} : notes/rapport.md`)).toBe(
      true,
    );
    expect(isReportToolSuccess(`${REPORT_UNCHANGED_MARKER} : notes/rapport.md`)).toBe(
      true,
    );
    expect(isReportToolSuccess("ERREUR: foo")).toBe(false);
  });
});
