# agent-harness

Harness ReAct minimal : Ollama + outils (Bun, TypeScript, sans framework).

## Prérequis

- [Bun](https://bun.sh)
- [Ollama](https://ollama.com) + modèle :

```bash
ollama pull llama3.2
```

## Lancer

```bash
bun run index.ts
bun run index.ts "Ta mission : recherche X et rédige un rapport"
```

Modèle fixe : **llama3.2**. Variable optionnelle : `OLLAMA_HOST`.

## Skills dynamiques

Détection auto selon la mission → chargement `skills/<name>/SKILL.md` → injection **system prompt**.

| Skill | Exemples de mission |
|-------|---------------------|
| `security-audit` | audit sécurité, injection sql/xss, owasp, failles |
| `code-review` | review, PR, refactor, qualité code |
| `tech-report` | rapport, architecture, compare, documentation |
| `data-analysis` | analyse des données, API, trends, anomalies |

**Guide agent sécurité** (schémas + utilisation) : [GuideSecurity.md](GuideSecurity.md).  
Référence courte : [docs/AGENT-SECURITE.md](docs/AGENT-SECURITE.md).

Voir `AGENTS.md` pour le détail.

**Guide complet** (modifs récentes, tests, prompts, skills, schémas) : [docs/GUIDE.md](docs/GUIDE.md).

**Rapport refactorisation** (priorités 1–3) : [RapportRefacto.md](RapportRefacto.md).

## Architecture

| Fichier | Rôle |
|---------|------|
| `index.ts` | Mission (argv ou défaut), lancement |
| `agent.ts` | Boucle ReAct (max 15 tours) |
| `llm.ts` | Client Ollama + tool_calls |
| `tools.ts` | fetch_url, run_js, save_note |
| `types.ts` | Types messages / stop_reason |
| `prompt.ts` | System prompt + skill |
| `src/skills.ts` | Détection + chargement skills |

## Sorties

- Terminal : logs tours + `=== Réponse ===`
- `notes/rapport.md` : rapport Markdown structuré
