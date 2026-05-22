/**
 * tools.ts — Implémentations des outils (fetch_url, run_js, save_note).
 * Registre et exécution : src/tool-registry.ts
 */
import { mkdir, readdir } from "node:fs/promises";
import {
  FETCH_TIMEOUT_MS,
  LOG_PREVIEW_CHARS,
  MAX_FETCH_CHARS,
  MAX_LIST_DIR_ENTRIES,
  NOTES_DIR,
  NOTES_FILE,
  RUN_JS_TIMEOUT_MS,
} from "./config.ts";
import { maxReadBytes, resolveProjectPath } from "./src/path-guard.ts";
import { assertSafeUrl } from "./src/url-guard.ts";
import { join } from "node:path";

const LIST_DIR_SKIP = new Set(["node_modules", ".git", ".cursor"]);

export function previewResult(result: string): string {
  if (result.length <= LOG_PREVIEW_CHARS) return result;
  return `${result.slice(0, LOG_PREVIEW_CHARS)}…`;
}

export function logTool(name: string, args: Record<string, unknown>, result: string) {
  console.log(
    `  [outil] ${name}(${JSON.stringify(args)}) → ${previewResult(result)}`,
  );
}

function cleanText(raw: string, isHtml: boolean): string {
  let text = raw;
  if (isHtml) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"');
  }
  return text.replace(/\s+/g, " ").trim();
}

export async function fetch_url(url: string): Promise<string> {
  assertSafeUrl(url);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "agent-harness/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("TimeoutError")) {
      throw new Error(`fetch_url timeout (${FETCH_TIMEOUT_MS / 1000}s) : ${url}`);
    }
    throw new Error(`fetch_url réseau : ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  let text = cleanText(await res.text(), contentType.includes("html"));

  if (text.length > MAX_FETCH_CHARS) {
    text = `${text.slice(0, MAX_FETCH_CHARS)}… [tronqué à ${MAX_FETCH_CHARS} caractères]`;
  }

  return text;
}

export async function run_js(code: string): Promise<string> {
  if (!code.trim()) throw new Error("code requis");

  const tmpPath = join(import.meta.dir, `.tmp-run-${Bun.randomUUIDv7()}.ts`);

  try {
    await Bun.write(tmpPath, code);

    const proc = Bun.spawn(["bun", tmpPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => proc.kill(), RUN_JS_TIMEOUT_MS);

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      if (exitCode !== 0) {
        const err = stderr.trim() || `code de sortie ${exitCode}`;
        throw new Error(err);
      }

      return stdout.trim() || "(aucune sortie)";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("killed") || proc.exitCode === null) {
        throw new Error(`run_js timeout (${RUN_JS_TIMEOUT_MS / 1000}s)`);
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    try {
      await Bun.file(tmpPath).unlink();
    } catch {
      /* fichier temporaire déjà supprimé */
    }
  }
}

function normalizeForDedup(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export const REPORT_WRITTEN_MARKER = "Rapport écrit";
export const REPORT_UNCHANGED_MARKER = "Rapport inchangé";

export function isReportToolSuccess(content: string): boolean {
  return (
    content.includes(REPORT_WRITTEN_MARKER) ||
    content.includes(REPORT_UNCHANGED_MARKER)
  );
}

export function normalizeReportContent(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenced?.[1]) t = fenced[1].trim();
  else {
    t = t.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return t
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function defaultReportHeader(): string {
  return `# Rapport agent\n\n_Généré le ${new Date().toISOString()}_\n`;
}

async function writeReportFile(content: string): Promise<string> {
  if (!content.trim()) throw new Error("content requis");

  const normalized = normalizeReportContent(content);
  const fullBody = `${defaultReportHeader()}\n${normalized}\n`;

  await mkdir(NOTES_DIR, { recursive: true });
  const file = Bun.file(NOTES_FILE);
  if (await file.exists()) {
    const existingNorm = normalizeForDedup(await file.text());
    const newNorm = normalizeForDedup(fullBody);
    const bodyNorm = normalizeForDedup(normalized);
    if (
      existingNorm === newNorm ||
      (bodyNorm.length > 0 && existingNorm.includes(bodyNorm))
    ) {
      return `${REPORT_UNCHANGED_MARKER} : ${NOTES_FILE}`;
    }
  }

  await Bun.write(NOTES_FILE, fullBody);
  return `${REPORT_WRITTEN_MARKER} : ${NOTES_FILE}`;
}

export async function writeFullReport(content: string): Promise<string> {
  return writeReportFile(content);
}

export async function save_note(content: string): Promise<string> {
  return writeReportFile(content);
}

/** Liste un dossier du projet (audit sécurité / code). */
export async function list_dir(relativePath: string): Promise<string> {
  const abs = resolveProjectPath(relativePath.trim() || ".");

  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`list_dir : ${msg}`);
  }

  const visible = entries
    .filter((e) => !LIST_DIR_SKIP.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const limited = visible.slice(0, MAX_LIST_DIR_ENTRIES);
  const lines = limited.map((e) => {
    const tag = e.isDirectory() ? "[dir]" : "[file]";
    return `${tag} ${e.name}`;
  });

  let header = `Contenu de ${relativePath || "."} (${limited.length} entrées`;
  if (visible.length > MAX_LIST_DIR_ENTRIES) {
    header += `, ${visible.length - MAX_LIST_DIR_ENTRIES} masquées`;
  }
  header += ")";

  return [header, ...lines].join("\n");
}

/** Lit un fichier source sous PROJECT_ROOT (max MAX_READ_FILE_BYTES). */
export async function read_file(relativePath: string): Promise<string> {
  const abs = resolveProjectPath(relativePath);
  const file = Bun.file(abs);

  if (!(await file.exists())) {
    throw new Error(`fichier introuvable : ${relativePath}`);
  }

  const stat = await file.stat();
  if (stat.isDirectory()) {
    throw new Error(`${relativePath} est un dossier — utilise list_dir`);
  }

  let text = await file.text();
  const max = maxReadBytes();
  if (text.length > max) {
    text = `${text.slice(0, max)}\n… [tronqué à ${max} caractères]`;
  }

  return `--- ${relativePath} ---\n${text}`;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

const handlers: Record<string, ToolHandler> = {
  fetch_url: async (args) => fetch_url(String(args.url ?? "")),
  run_js: async (args) => run_js(String(args.code ?? "")),
  save_note: async (args) => save_note(String(args.content ?? "")),
  list_dir: async (args) => list_dir(String(args.path ?? ".")),
  read_file: async (args) => read_file(String(args.path ?? "")),
};

/** Appelé par src/tool-registry.ts après contrôle mission / env. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`handler manquant pour ${name}`);
  }

  try {
    const result = await handler(args);
    logTool(name, args, result);
    return result;
  } catch (e) {
    const err = `ERREUR: ${e instanceof Error ? e.message : String(e)}`;
    logTool(name, args, err);
    return err;
  }
}
