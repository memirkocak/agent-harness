/**
 * Synchronisation notes/rapport.md (finalize + filet auto).
 */
import { executeTool } from "../tool-registry.ts";
import {
  isReportToolSuccess,
  normalizeReportContent,
  writeFullReport,
} from "../../tools.ts";
import type { Message } from "../../types.ts";

function wasReportSaved(messages: Message[]): boolean {
  return messages.some(
    (m) => m.role === "tool" && isReportToolSuccess(m.content),
  );
}

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

export async function syncReportFile(messages: Message[]): Promise<void> {
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
  await executeTool("save_note", { content: report }, true);
}
