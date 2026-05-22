/**
 * Skills dynamiques — une seule source : skills/<nom>/SKILL.md
 *
 * - triggers + name → frontmatter YAML (détection)
 * - corps du fichier → injecté dans le system prompt (prompt.ts)
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { SKILL_MIN_SCORE } from "../config.ts";

const SKILLS_ROOT = join(import.meta.dir, "..", "skills");

export type LoadedSkill = {
  skillName: string;
  skillContent: string;
};

type SkillEntry = {
  name: string;
  triggers: string[];
  body: string;
};

let catalogCache: SkillEntry[] | null = null;

/** Lit chaque dossier skills/ (fichier SKILL.md), une fois — cache. */
async function loadCatalog(): Promise<SkillEntry[]> {
  if (catalogCache) return catalogCache;

  const entries: SkillEntry[] = [];
  const dirs = await readdir(SKILLS_ROOT, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const path = join(SKILLS_ROOT, dir.name, "SKILL.md");
    const file = Bun.file(path);
    if (!(await file.exists())) continue;

    const raw = await file.text();
    const { meta, body } = parseSkillMd(raw);
    const triggers = meta.triggers ?? [];
    if (triggers.length === 0) continue;

    entries.push({
      name: meta.name ?? dir.name,
      triggers,
      body,
    });
  }

  catalogCache = entries;
  return entries;
}

/** Parse --- yaml --- + corps Markdown (name + triggers uniquement). */
export function parseSkillMd(raw: string): {
  meta: { name?: string; triggers?: string[] };
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) {
    return { meta: {}, body: raw.trim() };
  }

  const yaml = match[1];
  const body = match[2].trim();
  let name: string | undefined;
  const triggers: string[] = [];
  let inTriggers = false;

  for (const line of yaml.split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item?.[1]) {
      if (inTriggers) triggers.push(item[1].trim());
      continue;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv?.[1]) continue;
    inTriggers = false;
    if (kv[1] === "name" && kv[2] !== undefined) name = kv[2].trim();
    if (kv[1] === "triggers") inTriggers = true;
  }

  return {
    meta: { name, triggers: triggers.length ? triggers : undefined },
    body,
  };
}

/** Compte combien de triggers matchent la mission (score le plus haut gagne). */
function scoreMission(mission: string, triggers: string[]): number {
  const m = mission.toLowerCase();
  return triggers.filter((t) => m.includes(t.toLowerCase())).length;
}

/**
 * Détecte + charge le skill pour la mission.
 * null = aucun trigger ne correspond.
 */
export async function resolveSkillForMission(
  mission: string,
): Promise<LoadedSkill | null> {
  const catalog = await loadCatalog();
  let best: SkillEntry | null = null;
  let bestScore = 0;

  for (const skill of catalog) {
    const score = scoreMission(mission, skill.triggers);
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }

  if (!best || bestScore < SKILL_MIN_SCORE) return null;

  return { skillName: best.name, skillContent: best.body };
}

export function logSkillDetection(
  mission: string,
  skill: LoadedSkill | null,
): void {
  console.log("── Détection skill ─────────────");
  console.log(`Mission analysée : ${mission}`);
  console.log(skill ? `Skill chargé : ${skill.skillName}` : "Aucun skill détecté");
  console.log("");
}
