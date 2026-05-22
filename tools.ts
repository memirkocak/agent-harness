/**
 * tools.ts — Les "mains" de l'agent (tool calling)
 *
 * Ollama ne peut pas ouvrir le web ni écrire des fichiers : il demande un outil
 * par son nom, et executeTool() exécute la fonction correspondante.
 * Le résultat (string) est renvoyé à la boucle ReAct (agent.ts) en message "tool".
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const NOTES_DIR = "notes";
/** Rapport final demandé par le system prompt (save_note). */
const NOTES_FILE = join(NOTES_DIR, "rapport.md");
const MAX_FETCH_CHARS = 5000;
const FETCH_TIMEOUT_MS = 15_000;
const RUN_JS_TIMEOUT_MS = 30_000;
/** Longueur max affichée dans les logs [outil] (résultat complet dans messages). */
export const LOG_PREVIEW_CHARS = 50;

export function previewResult(result: string): string {
  if (result.length <= LOG_PREVIEW_CHARS) return result;
  return `${result.slice(0, LOG_PREVIEW_CHARS)}…`;
}

function logTool(name: string, args: Record<string, unknown>, result: string) {
  console.log(
    `  [outil] ${name}(${JSON.stringify(args)}) → ${previewResult(result)}`,
  );
}

/** Retire balises HTML et espaces superflus pour le LLM. */
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

// ─── Outil 1 : fetch_url ───────────────────────────────────────────────────
// Usage typique : recherche web, documentation, Wikipedia.
// Le texte retourné est lu par Ollama au tour Observe suivant.
export async function fetch_url(url: string): Promise<string> {
  if (!url.trim()) throw new Error("url requis");

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

// ─── Outil 2 : run_js ──────────────────────────────────────────────────────
// Usage typique : calculs, petits tests. Pas pour rédiger des explications.
// Pas d'eval : code écrit dans un fichier temp puis Bun.spawn (sandbox minimal).
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

/** Préfixe des messages tool après écriture réussie de notes/rapport.md. */
export const REPORT_WRITTEN_MARKER = "Rapport écrit";

/** Préfixe si le contenu est identique au fichier (pas de réécriture). */
export const REPORT_UNCHANGED_MARKER = "Rapport inchangé";

export function isReportToolSuccess(content: string): boolean {
  return (
    content.includes(REPORT_WRITTEN_MARKER) ||
    content.includes(REPORT_UNCHANGED_MARKER)
  );
}

/** Nettoie la réponse assistant avant écriture fichier (fences, entités HTML). */
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

/**
 * Écriture unique de notes/rapport.md : remplace tout le fichier (pas d'append).
 * Utilisé par save_note, writeFullReport et finalizeReport.
 */
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

/** Sync harness : remplace notes/rapport.md (alias de writeReportFile). */
export async function writeFullReport(content: string): Promise<string> {
  return writeReportFile(content);
}

// ─── Outil 3 : save_note ───────────────────────────────────────────────────
export async function save_note(content: string): Promise<string> {
  return writeReportFile(content);
}

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

/** Registre nom d'outil → fonction (appelé par executeTool). */
const handlers: Record<string, ToolHandler> = {
  fetch_url: async (args) => fetch_url(String(args.url ?? "")),
  run_js: async (args) => run_js(String(args.code ?? "")),
  save_note: async (args) => save_note(String(args.content ?? "")),
};

/**
 * Point d'entrée des outils depuis agent.ts (phase Act du ReAct).
 *
 * - Ne lance pas d'exception vers l'agent : retourne "ERREUR: ..." en string
 *   pour que Ollama puisse corriger sa stratégie au tour suivant.
 * - Log [outil] avec preview 50 caractères (résultat complet dans messages).
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = handlers[name];
  if (!handler) {
    const err = `ERREUR: outil inconnu "${name}". Disponibles : fetch_url, run_js, save_note`;
    logTool(name, args, err);
    return err;
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
