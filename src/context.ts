import { MAX_CONTEXT_CHARS, CONTEXT_PROTECT_TAIL } from "../config.ts";
import type { Message } from "../types.ts";

const TRUNCATE_MARKER = "… [contexte tronqué pour limite LLM]";

function messageChars(m: Message): number {
  return m.content.length + 24;
}

/**
 * Réduit l'historique si trop long pour Ollama.
 * Conserve system, user et les CONTEXT_PROTECT_TAIL derniers messages.
 */
export function trimMessagesForLlm(
  messages: Message[],
  maxChars: number = MAX_CONTEXT_CHARS,
): Message[] {
  const total = messages.reduce((s, m) => s + messageChars(m), 0);
  if (total <= maxChars) return messages;

  const result = messages.map((m) => ({ ...m }));
  const protectedIdx = new Set<number>();

  result.forEach((m, i) => {
    if (m.role === "system" || m.role === "user") protectedIdx.add(i);
  });
  for (
    let i = Math.max(0, result.length - CONTEXT_PROTECT_TAIL);
    i < result.length;
    i++
  ) {
    protectedIdx.add(i);
  }

  let size = result.reduce((s, m) => s + messageChars(m), 0);
  for (let i = 0; i < result.length && size > maxChars; i++) {
    if (protectedIdx.has(i)) continue;
    const m = result[i];
    if (m && m.role === "tool" && m.content.length > 400) {
      const before = m.content.length;
      m.content = `${m.content.slice(0, 400)}${TRUNCATE_MARKER}`;
      size -= before - m.content.length;
    }
  }

  if (size > maxChars) {
    console.log(
      `[harness] contexte encore large (${size} car.) après troncature partielle`,
    );
  } else {
    console.log(`[harness] contexte tronqué (${total} → ${size} car.)`);
  }

  return result;
}
