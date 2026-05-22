# AGENTS.md — agent-harness

Guide pour agents IA et développeurs travaillant sur ce harness ReAct.

## Description de l'agent

**agent-harness** est un agent autonome minimal en **TypeScript + Bun**, piloté par **Ollama (llama3.2)** en local. Il suit le pattern **ReAct** (Reason → Act → Observe) avec **tool calling** et **skills dynamiques** chargés selon la mission.

Pas de LangChain ni framework agent : boucle et outils écrits à la main.

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Runtime | [Bun](https://bun.sh) |
| Langage | TypeScript (strict) |
| LLM | Ollama — `llama3.2` |
| API | `POST http://localhost:11434/api/chat` |
| Provider | **Agnostic** (format messages + tools OpenAI-compatible) |

## Architecture (fichiers)

| Fichier | Rôle |
|---------|------|
| `index.ts` | Entrée CLI, mission, skill, lancement |
| `agent.ts` | Boucle ReAct (max 15 tours), `stop_reason` |
| `llm.ts` | Client Ollama, `mapToolCalls`, outils exposés |
| `tools.ts` | `fetch_url`, `run_js`, `read_file`, `list_dir`, `save_note` |
| `config.ts` | Constantes + `PROJECT_ROOT` / `AGENT_PROJECT_ROOT` |
| `src/tool-registry.ts` | Schéma + exécution outils |
| `prompt.ts` | System prompt + injection skill |
| `mission.ts` | Détection rapport fichier demandé |
| `src/skills.ts` | Détection + chargement skills |
| `types.ts` | `Message`, `ToolCall`, `LlmResponse`, `AgentOptions` |
| `skills/*/SKILL.md` | Expertises dynamiques |

Voir aussi : `docs/ARCHITECTURE.md`

## Outils disponibles

| Outil | Description |
|-------|-------------|
| `fetch_url(url)` | Récupère le texte d'une page web (max 5000 car., timeout 15s) |
| `run_js(code)` | Exécute du JS via `Bun.spawn` (pas `eval`), timeout 30s |
| `list_dir(path)` | Liste un dossier du projet (`AGENT_PROJECT_ROOT`) |
| `read_file(path)` | Lit un fichier source pour audit (chemins relatifs, pas de `../`) |
| `save_note(content)` | Écrit dans `notes/rapport.md` (si mission le demande) |

Les outils sont déclarés dans `src/tool-registry.ts` et exécutés via `tools.ts`.

**Audit sécurité** : voir `docs/AGENT-SECURITE.md` et skill `security-audit`.

## Skills disponibles

Détection automatique dans `src/skills.ts` : lit les **triggers** du frontmatter YAML de chaque `SKILL.md` (score le plus élevé).

| Skill | Dossier | Triggers (exemples) |
|-------|---------|---------------------|
| **security-audit** | `skills/security-audit/` | audit sécurité, injection sql/xss, owasp, faille, durcissement |
| **code-review** | `skills/code-review/` | review, code review, PR, refactor |
| **tech-report** | `skills/tech-report/` | rapport, architecture, compare, documentation |
| **data-analysis** | `skills/data-analysis/` | analyse des données, API, trends, anomalies |

Le contenu de `SKILL.md` est injecté dans le **system prompt** (pas le message user).

## Règles globales

1. **ReAct** : chaque tour = `llm()` → éventuellement outils → réinjection `role: tool` → tour suivant.
2. **stop_reason** : `tool_use` (continue), `end_turn` (fin), `max_turns` (15 max), `error`.
3. **Rapport fichier** : seulement si la mission contient des mots-clés rapport (`mission.ts`). Sinon réponse terminal uniquement.
4. **save_note auto** : `ensureReportSaved()` dans `agent.ts` si rapport demandé et modèle oublie.
5. **Skills** : optionnels ; agent généraliste si aucun match.
6. **Erreurs outils** : retournées en `ERREUR: ...` pour que le LLM réagisse au tour suivant.

## Commandes Bun

```bash
# Installer les deps
bun install

# Modèle Ollama (une fois)
ollama pull llama3.2

# Lancer avec mission par défaut
bun run index.ts

# Mission personnalisée
bun run index.ts "Fais un audit sécurité de ce code"

# Rapport explicite
bun run index.ts "Compare React et Vue et rédige un rapport structuré"

# Calcul sans rapport
bun run index.ts "Calcule 15 * 23"
```

**Ne pas utiliser** `node index.ts` — Bun requis (`Bun.spawn`, `import.meta.dir`).

## Variables d'environnement

| Variable | Défaut | Usage |
|----------|--------|-------|
| `OLLAMA_HOST` | `http://localhost:11434` | URL API Ollama |

## Ajouter un skill

1. Créer `skills/mon-skill/SKILL.md` avec frontmatter `name` + liste `triggers:`.
2. Pas de liste à maintenir dans `src/skills.ts` — détection automatique au scan du dossier `skills/`.
3. Documenter ici.

## Logs attendus

```
── Détection skill ─────────────
Mission analysée : ...
Skill chargé : tech-report

[Tour 1] stop_reason=tool_use | outils: fetch_url
  [outil] fetch_url(...) → ...
```
