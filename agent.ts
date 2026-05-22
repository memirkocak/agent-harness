/**
 * agent.ts — Boucle ReAct (Reason → Act → Observe)
 *
 * Orchestre la conversation entre Ollama (llm.ts) et les outils (tools.ts).
 * Chaque "tour" = un cycle complet ; l'historique `messages` grossit à chaque fois.
 */
import { llm } from "./llm.ts";
import {
  executeTool,
  isReportToolSuccess,
  normalizeReportContent,
  previewResult,
  writeFullReport,
} from "./tools.ts";
import type {
  AgentOptions,
  LlmResponse,
  Message,
  StopReason,
  ToolCall,
} from "./types.ts";

/** Outils exécutables en parallèle dans un même tour (fetch_url, run_js). */
const PARALLEL_TOOLS = new Set(["fetch_url", "run_js"]);

type ToolCallResult = { id: string; content: string };

async function runOneToolCall(
  call: ToolCall,
  options: AgentOptions,
): Promise<ToolCallResult> {
  if (call.name === "save_note" && !options.requiresReport) {
    return {
      id: call.id,
      content:
        "ERREUR: save_note indisponible — cette mission ne demande pas de rapport fichier.",
    };
  }

  const content = await executeTool(call.name, call.arguments);
  console.log(`  [résultat ${call.name}] ${previewResult(content)}`);
  return { id: call.id, content };
}

/**
 * Phase 1 : fetch_url + run_js en parallèle.
 * Phase 2 : save_note (et autres) après — aligné avec prompt.ts.
 * Messages tool réinjectés dans l'ordre des tool_calls du modèle.
 */
async function executeToolCallsForTurn(
  calls: ToolCall[],
  options: AgentOptions,
): Promise<ToolCallResult[]> {
  const parallel = calls.filter((c) => PARALLEL_TOOLS.has(c.name));
  const deferred = calls.filter((c) => !PARALLEL_TOOLS.has(c.name));

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

/** true si save_note / writeFullReport a écrit notes/rapport.md pendant cette mission. */
function wasReportSaved(messages: Message[]): boolean {
  return messages.some(
    (m) => m.role === "tool" && isReportToolSuccess(m.content),
  );
}

/** Contenu passé à save_note par le modèle (souvent un brouillon trop court). */
function earlySaveNoteContent(messages: Message[]): string | null {
  for (const m of messages) {
    if (m.role !== "assistant" || !m.tool_calls) continue;
    for (const call of m.tool_calls) {
      if (call.name === "save_note") {
        const raw = call.arguments.content;
        if (typeof raw === "string" && raw.trim()) return raw;
      }
    }
  }
  return null;
}

/** Dernière réponse assistant textuelle (hors tours outils quasi vides). */
function finalAssistantReport(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant" || !m.content.trim()) continue;
    const cleaned = normalizeReportContent(m.content);
    if (m.tool_calls?.length && cleaned.length < 120) continue;
    if (
      cleaned.length >= 300 ||
      (cleaned.length >= 150 && /^#+\s/m.test(cleaned))
    ) {
      return cleaned;
    }
  }
  return null;
}

/**
 * Aligne notes/rapport.md sur la réponse finale si le modèle a sauvegardé trop tôt
 * (ex. save_note en parallèle de fetch_url au tour 1, rapport complet au tour 2).
 */
async function finalizeReport(messages: Message[]): Promise<void> {
  const final = finalAssistantReport(messages);
  const early = earlySaveNoteContent(messages);

  if (final) {
    const finalLen = final.length;
    const earlyLen = early ? normalizeReportContent(early).length : 0;
    const needsSync =
      !wasReportSaved(messages) ||
      finalLen > earlyLen + 80 ||
      (earlyLen > 0 && earlyLen < 500 && finalLen > earlyLen);

    if (needsSync) {
      console.log(
        "[harness] rapport fichier synchronisé avec la réponse finale complète",
      );
      await writeFullReport(final);
      return;
    }
  }

  await ensureReportSaved(messages);
}

/**
 * Filet de sécurité : le modèle oublie souvent save_note après run_js seul.
 * On construit un rapport minimal à partir de la mission + outils + réponse finale.
 */
async function ensureReportSaved(messages: Message[]): Promise<void> {
  if (wasReportSaved(messages)) return;

  const mission =
    messages.find((m) => m.role === "user")?.content ?? "Mission";

  const toolResults = messages
    .filter((m) => m.role === "tool" && !isReportToolSuccess(m.content))
    .map((m) => `- ${m.content}`)
    .join("\n");

  const synthèse =
    [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim())?.content ??
    "(aucune synthèse)";

  const report = [
    "# Rapport",
    "",
    "## Mission",
    mission,
    "",
    "## Étapes",
    toolResults || "(aucun outil exécuté)",
    "",
    "## Synthèse",
    synthèse,
  ].join("\n");

  console.log(
    "[harness] save_note automatique (le modèle n'avait pas sauvegardé le rapport)",
  );
  await executeTool("save_note", { content: report });
}

/** Sécurité : évite une boucle infinie si le modèle ne termine jamais. */
const MAX_TURNS = 15;

/** Texte affiché dans les logs [Tour N] pour comprendre l'action du tour. */
function describeAction(response: LlmResponse): string {
  if (response.stop_reason === "end_turn") return "réponse finale";
  if (response.stop_reason === "tool_use" && response.tool_calls?.length) {
    return `outils: ${response.tool_calls.map((t) => t.name).join(", ")}`;
  }
  if (response.stop_reason === "max_turns") return "limite 15 tours";
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

/**
 * Lance l'agent sur une mission (system + user déjà dans `initial`).
 *
 * Schéma d'un tour :
 *   Reason  → llm(messages)     Ollama lit l'historique et décide
 *   Act     → executeTool(...)  si tool_use : exécute 1..n outils
 *   Observe → messages "tool"   résultats réinjectés pour le tour suivant
 */
export async function runAgent(
  initial: Message[],
  options: AgentOptions,
): Promise<Message[]> {
  const messages: Message[] = [...initial];
  let stopped = false; // true si end_turn (mission réussie)
  let failed = false; // true si crash Ollama (pas de faux "max_turns")

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    let response: LlmResponse;

    // ─── REASON : appel au LLM ───────────────────────────────────────────
    // Ollama reçoit tout l'historique (user, assistant, tool) et répond :
    // - end_turn  → texte final, on arrête
    // - tool_use  → liste d'outils à exécuter (fetch_url, run_js, save_note si rapport demandé)
    try {
      response = await llm(messages, options);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      logTurn(turn, "error", `LLM: ${err.slice(0, 80)}`);
      failed = true;
      messages.push({
        role: "assistant",
        content: `Échec LLM : ${err}`,
      });
      break;
    }

    logTurn(turn, response.stop_reason, describeAction(response));

    // On garde la réponse assistant (avec tool_calls si présents) dans l'historique
    messages.push({
      role: "assistant",
      content: response.content ?? "",
      ...(response.tool_calls ? { tool_calls: response.tool_calls } : {}),
    });

    // ─── FIN : le modèle a répondu sans demander d'outil ─────────────────
    if (response.stop_reason === "end_turn") {
      stopped = true;
      break;
    }

    // ─── ACT + OBSERVE : exécution des outils ───────────────────────────
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
      continue; // tour suivant → nouveau Reason avec historique enrichi
    }

    // Réponse incohérente (ni end_turn ni tool_use valide)
    logTurn(turn, "error", "réponse LLM sans outils ni fin de tour");
    break;
  }

  // 15 tours sans end_turn → arrêt forcé
  if (!stopped && !failed) {
    logTurn(MAX_TURNS, "max_turns", "arrêt forcé après 15 tours");
  }

  // Rapport fichier : sync finale ou filet si le modèle n'a jamais sauvegardé
  if (stopped && !failed && options.requiresReport) {
    await finalizeReport(messages);
  }

  return messages;
}
