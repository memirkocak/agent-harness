import type { AgentOptions, LlmResponse, Message, ToolCall } from "./types.ts";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_URL = `${OLLAMA_HOST}/api/chat`;
/** Modèle Ollama utilisé par le harness (tool_calls). */
export const OLLAMA_MODEL = "llama3.2";
const OLLAMA_TIMEOUT_MS = 120_000;

const CORE_TOOLS = [
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Récupère le texte d'une page web (HTML nettoyé, max 5000 caractères). Pour rechercher des infos.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL https:// complète" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
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
    },
  },
] as const;

const SAVE_NOTE_TOOL = {
  type: "function",
  function: {
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
  },
} as const;

/** Outils exposés à Ollama selon la mission (save_note seulement si rapport demandé). */
function toolsForMission(requiresReport: boolean) {
  return requiresReport ? [...CORE_TOOLS, SAVE_NOTE_TOOL] : [...CORE_TOOLS];
}

type OllamaRawToolCall = {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
};

type OllamaChatMessage = {
  role: string;
  content: string;
  tool_calls?: OllamaRawToolCall[];
  tool_call_id?: string;
};

/**
 * Convertit notre historique vers le format Ollama.
 * Les messages tool réinjectent les résultats d'outils pour la phase Observe du ReAct.
 */
function toOllamaMessages(messages: Message[]): OllamaChatMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function parseToolArguments(
  raw: Record<string, unknown> | string,
): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Arguments outil JSON invalides : ${raw.slice(0, 80)}`);
    }
  }
  return raw;
}

function mapToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((tc, i) => {
    const item = tc as OllamaRawToolCall;
    const fn = item.function;
    if (!fn?.name) throw new Error("tool_call sans nom de fonction");
    return {
      id: item.id ?? `call_${Date.now()}_${i}`,
      name: fn.name,
      arguments: parseToolArguments(fn.arguments),
    };
  });
}

/**
 * Appel Ollama /api/chat avec tool_calls.
 * Retourne stop_reason tool_use (outils) ou end_turn (réponse finale).
 */
export async function llm(
  messages: Message[],
  options: AgentOptions,
): Promise<LlmResponse> {
  let res: Response;
  try {
    res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: toOllamaMessages(messages),
        tools: toolsForMission(options.requiresReport),
        stream: false,
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("TimeoutError") || msg.includes("timeout")) {
      throw new Error(
        `Ollama timeout (${OLLAMA_TIMEOUT_MS / 1000}s). Modèle trop lent ou serveur arrêté.`,
      );
    }
    throw new Error(
      `Ollama injoignable (${OLLAMA_HOST}). Lance l'app Ollama et : ollama pull ${OLLAMA_MODEL}\n→ ${msg}`,
    );
  }

  let data: {
    message?: { content?: string; tool_calls?: unknown[] };
    error?: string;
  };

  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error(`Ollama : réponse JSON invalide (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const detail = data.error ?? JSON.stringify(data);
    if (res.status === 404 && String(detail).includes("not found")) {
      throw new Error(
        `Modèle "${OLLAMA_MODEL}" introuvable. Lance : ollama pull llama3.2`,
      );
    }
    throw new Error(`Ollama API HTTP ${res.status}: ${detail}`);
  }

  if (data.error) {
    throw new Error(`Ollama : ${data.error}`);
  }

  const toolCalls = mapToolCalls(data.message?.tool_calls);

  if (toolCalls.length > 0) {
    return {
      content: data.message?.content || null,
      stop_reason: "tool_use",
      tool_calls: toolCalls,
    };
  }

  return {
    content: data.message?.content ?? "",
    stop_reason: "end_turn",
  };
}
