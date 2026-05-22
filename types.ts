/** Appel d'outil demandé par le LLM (format API chat). */
export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type Role = "system" | "user" | "assistant" | "tool";

/** Message dans l'historique de conversation. */
export type Message = {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type StopReason = "end_turn" | "tool_use" | "max_turns" | "error";

export type LlmResponse = {
  content: string | null;
  stop_reason: StopReason;
  tool_calls?: ToolCall[];
};

export type AgentOptions = {
  requiresReport: boolean;
};

/** Résultat de runAgent (messages + métadonnées d'arrêt). */
export type AgentResult = {
  messages: Message[];
  stopReason: StopReason;
  turnsUsed: number;
};

/** Contrat pour brancher un autre provider que Ollama plus tard. */
export interface LlmClient {
  complete(messages: Message[], options: AgentOptions): Promise<LlmResponse>;
}
