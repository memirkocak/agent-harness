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
  /** Présent quand l'assistant demande des outils. */
  tool_calls?: ToolCall[];
  /** Lie la réponse tool à l'appel correspondant (réinjection ReAct). */
  tool_call_id?: string;
};

/**
 * stop_reason — pourquoi le tour s'arrête ou continue :
 * - tool_use : le LLM veut exécuter des outils → boucle continue
 * - end_turn : réponse finale → arrêt propre
 * - max_turns : limite de 15 tours atteinte
 * - error : échec LLM ou réponse invalide
 */
export type StopReason = "end_turn" | "tool_use" | "max_turns" | "error";

export type LlmResponse = {
  content: string | null;
  stop_reason: StopReason;
  tool_calls?: ToolCall[];
};

/** Options de la mission (index.ts → runAgent → llm). */
export type AgentOptions = {
  /** true si la mission demande un rapport dans notes/rapport.md */
  requiresReport: boolean;
};
