import { join } from "node:path";

/** Racine du projet à auditer (défaut : dossier du harness). */
export const PROJECT_ROOT =
  process.env.AGENT_PROJECT_ROOT ?? import.meta.dir;

/** Lecture fichier locale (audit code). */
export const MAX_READ_FILE_BYTES = 12_000;
export const MAX_LIST_DIR_ENTRIES = 80;

/** Tours ReAct maximum par mission. */
export const MAX_TURNS = 15;

/** API Ollama. */
export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
export const OLLAMA_TIMEOUT_MS = 120_000;

/** fetch_url */
export const MAX_FETCH_CHARS = 5000;
export const FETCH_TIMEOUT_MS = 15_000;

/** run_js — désactiver avec AGENT_ALLOW_RUN_JS=0 */
export const AGENT_ALLOW_RUN_JS = process.env.AGENT_ALLOW_RUN_JS !== "0";
export const RUN_JS_TIMEOUT_MS = 30_000;

/** Logs outils */
export const LOG_PREVIEW_CHARS = 50;

/** Budget contexte avant appel LLM */
export const MAX_CONTEXT_CHARS = 40_000;
/** Derniers messages non tronqués (hors system). */
export const CONTEXT_PROTECT_TAIL = 6;

/** Skills : score minimum de triggers pour charger un skill */
export const SKILL_MIN_SCORE = 1;

/** Rapport fichier */
export const NOTES_DIR = "notes";
export const NOTES_FILE = join(NOTES_DIR, "rapport.md");

/** Mémoire épisodique (missions passées) — désactiver avec AGENT_MEMORY=0 */
export const MEMORY_ENABLED = process.env.AGENT_MEMORY !== "0";
export const MEMORY_DIR = join(import.meta.dir, "memory", "episodes");
/** Max missions gardées sur disque par projet — au-delà, les plus anciennes sont supprimées. */
export const MAX_EPISODES_STORED = 20;
/** Max missions rappelées dans le prompt (les plus récentes). */
export const MAX_EPISODES_IN_PROMPT = 5;
/** Résumé = extrait court de la réponse finale (pas tout l'historique). */
export const MAX_MEMORY_SUMMARY_CHARS = 600;
/** Texte de la mission tronqué si trop long. */
export const MAX_MEMORY_MISSION_CHARS = 400;
