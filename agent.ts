/**
 * agent.ts — Boucle ReAct (Reason → Act → Observe)
 */
import { MAX_TURNS } from "./config.ts";
import { llm } from "./llm.ts";
import { syncReportFile } from "./src/report/sync.ts";
import {
  executeTool,
  getParallelToolNames,
} from "./src/tool-registry.ts";
import { previewResult } from "./tools.ts";
import type {
  AgentOptions,
  AgentResult,
  LlmResponse,
  Message,
  StopReason,
  ToolCall,
} from "./types.ts";

type ToolCallResult = { id: string; content: string };

async function runOneToolCall(
  call: ToolCall,
  options: AgentOptions,
): Promise<ToolCallResult> {
  const content = await executeTool(
    call.name,
    call.arguments,
    options.requiresReport,
  );
  console.log(`  [résultat ${call.name}] ${previewResult(content)}`);
  return { id: call.id, content };
}

async function executeToolCallsForTurn(
  calls: ToolCall[],
  options: AgentOptions,
): Promise<ToolCallResult[]> {
  const parallelNames = getParallelToolNames();
  const parallel = calls.filter((c) => parallelNames.has(c.name));
  const deferred = calls.filter((c) => !parallelNames.has(c.name));

  const byId = new Map<string, ToolCallResult>();

  if (parallel.length > 1) {
    console.log(
      `  [harness] ${parallel.length} outils en parallèle: ${parallel.map((c) => c.name).join(", ")}`,
    );
  }

  if (parallel.length) {
    const results = await Promise.all(
      parallel.map((c) => runOneToolCall(c, options)),
    );
    for (const r of results) byId.set(r.id, r);
  }

  for (const call of deferred) {
    const r = await runOneToolCall(call, options);
    byId.set(r.id, r);
  }

  return calls.map((c) => {
    const r = byId.get(c.id);
    if (!r) {
      throw new Error(`résultat manquant pour tool_call ${c.id} (${c.name})`);
    }
    return r;
  });
}

function describeAction(response: LlmResponse): string {
  if (response.stop_reason === "end_turn") return "réponse finale";
  if (response.stop_reason === "tool_use" && response.tool_calls?.length) {
    return `outils: ${response.tool_calls.map((t) => t.name).join(", ")}`;
  }
  if (response.stop_reason === "max_turns") return `limite ${MAX_TURNS} tours`;
  if (response.stop_reason === "error") return "erreur";
  return "inconnu";
}

function logTurn(
  turn: number,
  stopReason: StopReason,
  action: string,
): void {
  console.log(`[Tour ${turn}] stop_reason=${stopReason} | ${action}`);
}

export async function runAgent(
  initial: Message[],
  options: AgentOptions,
): Promise<AgentResult> {
  const messages: Message[] = [...initial];
  let stopReason: StopReason = "max_turns";
  let turnsUsed = 0;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    turnsUsed = turn;
    let response: LlmResponse;

    try {
      response = await llm(messages, options);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      logTurn(turn, "error", `LLM: ${err.slice(0, 80)}`);
      stopReason = "error";
      messages.push({
        role: "assistant",
        content: `Échec LLM : ${err}`,
      });
      break;
    }

    logTurn(turn, response.stop_reason, describeAction(response));

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      ...(response.tool_calls ? { tool_calls: response.tool_calls } : {}),
    });

    if (response.stop_reason === "end_turn") {
      stopReason = "end_turn";
      break;
    }

    if (response.stop_reason === "tool_use" && response.tool_calls?.length) {
      const results = await executeToolCallsForTurn(
        response.tool_calls,
        options,
      );

      for (const { id, content } of results) {
        messages.push({
          role: "tool",
          tool_call_id: id,
          content,
        });
      }
      continue;
    }

    logTurn(turn, "error", "réponse LLM sans outils ni fin de tour");
    stopReason = "error";
    break;
  }

  if (stopReason === "max_turns") {
    logTurn(MAX_TURNS, "max_turns", `arrêt forcé après ${MAX_TURNS} tours`);
  }

  if (stopReason === "end_turn" && options.requiresReport) {
    await syncReportFile(messages);
  }

  return { messages, stopReason, turnsUsed };
}
