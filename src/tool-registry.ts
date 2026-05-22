/**
 * Registre unique des outils : schéma LLM, prompt, exécution, parallélisme.
 */
import {
  AGENT_ALLOW_RUN_JS,
  MAX_FETCH_CHARS,
  MAX_READ_FILE_BYTES,
} from "../config.ts";
import { executeTool as runToolHandler, logTool } from "../tools.ts";

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  promptLine: string;
  parallelSafe: boolean;
  requiresReport?: boolean;
  enabled: boolean;
};

const ALL_TOOLS: ToolDefinition[] = [
  {
    name: "fetch_url",
    description: `Récupère le texte d'une page web (HTML nettoyé, max ${MAX_FETCH_CHARS} caractères). Pour rechercher des infos.`,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL http(s) complète" },
      },
      required: ["url"],
    },
    promptLine: "fetch_url(url) — texte d'une page web (recherche).",
    parallelSafe: true,
    enabled: true,
  },
  {
    name: "run_js",
    description:
      "Exécute du JavaScript via Bun. Utilise console.log pour le résultat. Calculs et tests uniquement.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Code JS à exécuter" },
      },
      required: ["code"],
    },
    promptLine: "run_js(code) — calculs / JS via Bun (console.log pour le résultat).",
    parallelSafe: true,
    enabled: AGENT_ALLOW_RUN_JS,
  },
  {
    name: "list_dir",
    description:
      "Liste fichiers et dossiers d'un répertoire du projet (chemin relatif). Exclut node_modules/.git. Pour cartographier avant audit.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Chemin relatif (ex. ".", "src", "api")',
        },
      },
      required: ["path"],
    },
    promptLine:
      'list_dir(path) — liste le contenu d\'un dossier du projet (ex. ".", "src").',
    parallelSafe: true,
    enabled: true,
  },
  {
    name: "read_file",
    description: `Lit un fichier texte du projet (max ${MAX_READ_FILE_BYTES} car.). Chemins relatifs uniquement. Pour analyser code routes, auth, SQL, templates.`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Chemin relatif (ex. "src/index.ts", "package.json")',
        },
      },
      required: ["path"],
    },
    promptLine:
      "read_file(path) — lit un fichier source du projet pour l'audit.",
    parallelSafe: true,
    enabled: true,
  },
  {
    name: "save_note",
    description:
      "Sauvegarde le rapport Markdown COMPLET dans notes/rapport.md. Appeler une seule fois, à la fin, après toutes les recherches — pas en parallèle avec fetch_url.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "Markdown (# Rapport, ## Mission, ## Étapes, ## Synthèse)",
        },
      },
      required: ["content"],
    },
    promptLine:
      "save_note(content) — sauvegarde un rapport Markdown dans notes/rapport.md.",
    parallelSafe: false,
    requiresReport: true,
    enabled: true,
  },
];

function activeTools(requiresReport: boolean): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => {
    if (!t.enabled) return false;
    if (t.requiresReport && !requiresReport) return false;
    return true;
  });
}

export function getParallelToolNames(): Set<string> {
  return new Set(
    ALL_TOOLS.filter((t) => t.parallelSafe && t.enabled).map((t) => t.name),
  );
}

export function getOllamaToolSchemas(requiresReport: boolean): object[] {
  return activeTools(requiresReport).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function formatToolsForPrompt(requiresReport: boolean): string {
  const lines = activeTools(requiresReport).map((t) => `- ${t.promptLine}`);
  if (!requiresReport) {
    lines.push(
      "- save_note — non disponible pour cette mission (pas de rapport demandé).",
    );
  }
  return lines.join("\n");
}

export function listToolNames(requiresReport: boolean): string[] {
  return activeTools(requiresReport).map((t) => t.name);
}

function isToolAllowed(name: string, requiresReport: boolean): boolean {
  return activeTools(requiresReport).some((t) => t.name === name);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  requiresReport: boolean,
): Promise<string> {
  if (!isToolAllowed(name, requiresReport)) {
    if (name === "save_note") {
      return "ERREUR: save_note indisponible — cette mission ne demande pas de rapport fichier.";
    }
    if (name === "run_js" && !AGENT_ALLOW_RUN_JS) {
      return "ERREUR: run_js désactivé (AGENT_ALLOW_RUN_JS=0).";
    }
    const available = listToolNames(requiresReport).join(", ");
    const err = `ERREUR: outil inconnu ou indisponible "${name}". Disponibles : ${available}`;
    logTool(name, args, err);
    return err;
  }
  return runToolHandler(name, args);
}
