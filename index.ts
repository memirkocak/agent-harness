import { runAgent } from "./agent.ts";
import { OLLAMA_MODEL } from "./llm.ts";
import { missionRequiresReport } from "./mission.ts";
import { buildSystemPrompt } from "./prompt.ts";
import {
  countEpisodes,
  forgetProject,
  formatMemoryForPrompt,
  loadEpisodes,
  logMemoryStatus,
  projectIdFromRoot,
  saveEpisode,
} from "./src/memory/episodes.ts";
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

const rawArgs = process.argv.slice(2);
const forgetMemory = rawArgs.includes("--forget-memory");
const missionArgs = rawArgs.filter((a) => a !== "--forget-memory");

const projectId = projectIdFromRoot();

if (forgetMemory && missionArgs.length === 0) {
  const removed = await forgetProject(projectId);
  console.log(
    removed
      ? `Mémoire supprimée pour ce projet (${projectId}).`
      : `Aucun fichier mémoire pour ce projet (${projectId}).`,
  );
  process.exit(0);
}

if (forgetMemory) {
  const removed = await forgetProject(projectId);
  console.log(
    removed
      ? `Mémoire effacée avant cette mission (${projectId}).\n`
      : "",
  );
}

const mission = missionArgs.join(" ").trim() || DEFAULT_MISSION;

const requiresReport = missionRequiresReport(mission);

const skill = await resolveSkillForMission(mission);
logSkillDetection(mission, skill);

const episodes = await loadEpisodes(projectId);
const totalEpisodes = await countEpisodes(projectId);
logMemoryStatus(projectId, episodes, totalEpisodes);

const memoryBlock = formatMemoryForPrompt(episodes);

const messages: Message[] = [
  {
    role: "system",
    content: buildSystemPrompt(requiresReport, skill, memoryBlock),
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

await saveEpisode({
  mission,
  skillName: skill?.skillName ?? null,
  requiresReport,
  stopReason,
  turnsUsed,
  messages: history,
  projectId,
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
