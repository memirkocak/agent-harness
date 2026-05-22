import {
  OLLAMA_HOST,
  OLLAMA_MODEL,
  OLLAMA_TIMEOUT_MS,
} from "./config.ts";
import { trimMessagesForLlm } from "./src/context.ts";
import { getOllamaToolSchemas } from "./src/tool-registry.ts";
import type {
  AgentOptions,
  LlmClient,
  LlmResponse,
  Message,
  ToolCall,
} from "./types.ts";

export { OLLAMA_MODEL };

const OLLAMA_URL = `${OLLAMA_HOST}/api/chat`;

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

export const ollamaClient: LlmClient = {
  complete: llm,
};

export async function llm(
  messages: Message[],
  options: AgentOptions,
): Promise<LlmResponse> {
  const trimmed = trimMessagesForLlm(messages);

  let res: Response;
  try {
    res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: toOllamaMessages(trimmed),
        tools: getOllamaToolSchemas(options.requiresReport),
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
        `Modèle "${OLLAMA_MODEL}" introuvable. Lance : ollama pull ${OLLAMA_MODEL}`,
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
