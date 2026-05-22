# Rapport de refactorisation — agent-harness

Date : mai 2026  
Périmètre : priorités **1**, **2** et **3** (config, contexte, tests, registry, rapport, API agent, sécurité, skills).

---

## Résumé

Refactorisation **incrémentale** : le comportement ReAct reste le même pour l’utilisateur CLI, avec une structure plus modulaire, un seul registre d’outils, et des garde-fous réseau/code.

| Priorité | Statut |
|----------|--------|
| P1 — config, contexte, tests | ✅ |
| P2 — tool-registry, report/sync, prompt | ✅ |
| P3 — AgentResult, sécurité URL/run_js, skill min score | ✅ |

---

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `config.ts` | Constantes centralisées (tours, Ollama, timeouts, contexte, skills) |
| `src/context.ts` | Troncature historique avant `llm()` |
| `src/url-guard.ts` | `assertSafeUrl()` anti-SSRF basique |
| `src/tool-registry.ts` | Schéma LLM, prompt, parallélisme, `executeTool` |
| `src/report/sync.ts` | `syncReportFile`, filet `ensureReportSaved` |
| `mission.test.ts` | (existant) tests mission rapport |
| `tools.test.ts` | URL, normalize, marqueurs rapport |
| `skills.test.ts` | `parseSkillMd`, résolution skill |
| `context.test.ts` | `trimMessagesForLlm` |
| `RapportRefacto.md` | Ce document |

---

## Fichiers modifiés

| Fichier | Changement principal |
|---------|----------------------|
| `agent.ts` | ~300 → ~160 lignes ; boucle seule ; `AgentResult` |
| `tools.ts` | Config + `assertSafeUrl` ; `executeTool` interne au registry |
| `llm.ts` | Config, `trimMessagesForLlm`, schémas via registry, `ollamaClient` |
| `prompt.ts` | Liste outils via `formatToolsForPrompt()` |
| `types.ts` | `AgentResult`, interface `LlmClient` |
| `index.ts` | Affiche `stopReason` et `turnsUsed` |
| `src/skills.ts` | `SKILL_MIN_SCORE`, `parseSkillMd` exporté |
| `package.json` | `bun test` (déjà présent) |

---

## Nouvelles fonctionnalités

1. **`config.ts`** — `OLLAMA_MODEL` via env, `MAX_CONTEXT_CHARS`, `AGENT_ALLOW_RUN_JS`, etc.
2. **Budget contexte** — troncature des vieux messages `tool` avant Ollama (log `[harness] contexte tronqué`).
3. **`src/tool-registry.ts`** — ajouter un outil = une entrée `ToolDefinition` (+ handler dans `tools.ts`).
4. **`AgentResult`** — `{ messages, stopReason, turnsUsed }` retourné par `runAgent`.
5. **`LlmClient`** — `ollamaClient` dans `llm.ts` (préparation autre provider).
6. **`assertSafeUrl`** — http(s) publics uniquement ; refuse localhost / IP privées.
7. **`AGENT_ALLOW_RUN_JS=0`** — retire `run_js` du schéma et du prompt.
8. **`SKILL_MIN_SCORE`** — configurable dans `config.ts` (défaut 1).

---

## Comportements supprimés / changés

| Avant | Après |
|-------|--------|
| Constantes éparpillées | `config.ts` |
| Liste outils en dur dans `prompt.ts` + `llm.ts` | `tool-registry` |
| Logique rapport dans `agent.ts` | `src/report/sync.ts` |
| `runAgent` → `Message[]` | `runAgent` → `AgentResult` |
| `save_note` guard dupliqué dans `agent.ts` | Registry `executeTool` |
| Skills : score 0 accepté si best | Score &lt; `SKILL_MIN_SCORE` → pas de skill |
| `fetch_url` sans contrôle URL | `assertSafeUrl` obligatoire |

**Non modifié :** boucle ReAct, parallélisme phase 1/2, écriture rapport unifiée (`writeReportFile`), `missionRequiresReport` strict.

---

## Fonctionnalités vérifiées

```bash
bun run check   # tsc --noEmit
bun test        # 4 fichiers, tous pass
```

| Fonctionnalité | Statut |
|----------------|--------|
| CLI `bun run index.ts` | OK (API `AgentResult`) |
| Outils fetch_url / run_js / save_note | OK via registry |
| Rapport `notes/rapport.md` | OK via `syncReportFile` |
| Skills dynamiques | OK + seuil score |
| Mission sans rapport | OK |
| Parallélisme outils | OK (`getParallelToolNames`) |

**Non testé automatiquement :** appel Ollama réel (nécessite serveur local).

---

## Architecture après refactor

```
index.ts
  → mission.ts, skills.ts, prompt.ts (registry)
  → agent.ts (boucle)
       → llm.ts → context.ts + tool-registry (schéma)
       → tool-registry → tools.ts (implémentations)
       → report/sync.ts → tools.ts + registry
config.ts ← lu partout
```

---

## Variables d'environnement

| Variable | Défaut | Effet |
|----------|--------|--------|
| `OLLAMA_HOST` | `http://localhost:11434` | URL API |
| `OLLAMA_MODEL` | `llama3.2` | Modèle |
| `AGENT_ALLOW_RUN_JS` | activé | `0` désactive `run_js` |

---

## Prochaines étapes (hors ce refactor)

- Plus de tests (registry, `syncReportFile`)
- Limite `MAX_PARALLEL_FETCH`
- Provider OpenAI implémentant `LlmClient`
- Section dans `docs/GUIDE.md` pointant vers ce rapport
