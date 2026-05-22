import { runAgent } from "./agent.ts";
import { OLLAMA_MODEL } from "./llm.ts";
import { missionRequiresReport } from "./mission.ts";
import { buildSystemPrompt } from "./prompt.ts";
import {
  logSkillDetection,
  resolveSkillForMission,
} from "./src/skills.ts";
import type { Message } from "./types.ts";

if (typeof Bun === "undefined") {
  console.error(
    "\n❌ Utilise Bun :  bun run index.ts  (pas node index.ts)\n",
  );
  process.exit(1);
}

const DEFAULT_MISSION = "Calcule moi 10*10.";

const mission =
  process.argv.slice(2).join(" ").trim() || DEFAULT_MISSION;

const requiresReport = missionRequiresReport(mission);

const skill = await resolveSkillForMission(mission);
logSkillDetection(mission, skill);

const messages: Message[] = [
  {
    role: "system",
    content: buildSystemPrompt(requiresReport, skill),
  },
  { role: "user", content: mission },
];

console.log(`=== Agent ReAct — Ollama (${OLLAMA_MODEL}) ===\n`);
console.log(`Mission : ${mission}`);
console.log(
  `Rapport fichier : ${requiresReport ? "oui → notes/rapport.md" : "non (réponse terminal uniquement)"}\n`,
);

const { messages: history, stopReason, turnsUsed } = await runAgent(messages, {
  requiresReport,
});

console.log(`\n=== Fin agent (stop_reason=${stopReason}, tours=${turnsUsed}) ===`);

console.log("\n=== Historique final ===");
for (const msg of history) {
  const label =
    msg.role === "tool" ? `tool[${msg.tool_call_id}]` : msg.role;
  const text =
    msg.content.length > 100
      ? `${msg.content.slice(0, 100)}…`
      : msg.content;
  console.log(`  ${label}: ${text}`);
}

const reply = [...history]
  .reverse()
  .find((m) => m.role === "assistant" && m.content.trim());

console.log(`\n=== Réponse ===\n${reply?.content ?? "(aucune)"}`);

if (requiresReport) {
  console.log(`\nRapport : notes/rapport.md`);
}
