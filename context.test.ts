import { describe, expect, test } from "bun:test";
import { trimMessagesForLlm } from "./src/context.ts";
import type { Message } from "./types.ts";

describe("trimMessagesForLlm", () => {
  test("ne modifie pas un historique court", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "mission" },
    ];
    expect(trimMessagesForLlm(msgs, 10_000)).toEqual(msgs);
  });

  test("tronque les vieux messages tool", () => {
    const big = "x".repeat(20_000);
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
      { role: "tool", content: big, tool_call_id: "old" },
      { role: "assistant", content: "a1" },
      { role: "tool", content: "petit-1", tool_call_id: "2" },
      { role: "assistant", content: "a2" },
      { role: "tool", content: "petit-2", tool_call_id: "3" },
      { role: "assistant", content: "a3" },
      { role: "tool", content: "petit-3", tool_call_id: "4" },
      { role: "assistant", content: "ok" },
    ];
    const out = trimMessagesForLlm(msgs, 5000);
    const oldTool = out.find((m) => m.tool_call_id === "old");
    expect(oldTool?.content.length).toBeLessThan(big.length);
    expect(oldTool?.content).toContain("tronqué");
  });
});
