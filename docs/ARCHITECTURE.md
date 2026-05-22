# AI Agent Harness — Architecture (ReAct + Ollama)

> Harness autonome minimal : **Bun + TypeScript + Ollama llama3.2**  
> Style : pipeline IA / orchestration agent (sans LangChain)

---

## 1. Vue pipeline (couches logiques)

```mermaid
flowchart TB
  subgraph ENTRY["🟦 ENTRÉE UTILISATEUR"]
    CLI["CLI / Terminal<br/>bun run index.ts"]
    ARGV["process.argv<br/>mission dynamique"]
    DEF["DEFAULT_MISSION<br/>fallback"]
    CLI --> ARGV
    ARGV --> DEF
  end

  subgraph PROMPT["🟦 PROMPT & MISSION"]
    PROMPT_TS["prompt.ts<br/>buildSystemPrompt()"]
    IDX["index.ts<br/>messages[] initial"]
    PROMPT_TS -->|"role: system"| IDX
    ARGV -->|"role: user"| IDX
  end

  subgraph HARNESS["🟪 HARNESS — ORCHESTRATION"]
    AGENT["agent.ts<br/>runAgent()"]
    LOOP["Boucle ReAct<br/>MAX_TURNS = 15"]
    STOP["stop_reason<br/>end_turn | tool_use | max_turns | error"]
    ENSURE["ensureReportSaved()<br/>filet sécurité rapport"]
    AGENT --> LOOP
    LOOP --> STOP
    AGENT --> ENSURE
  end

  subgraph MEMORY["🟣 MÉMOIRE — SESSION"]
    TYPES["types.ts<br/>Message | ToolCall | LlmResponse"]
    HIST["messages: Message[]<br/>historique conversation"]
    TYPES -.-> HIST
  end

  subgraph LLM_LAYER["🟢 LLM — REASONING"]
    LLM_TS["llm.ts<br/>llm()"]
    OLLAMA["Ollama Server<br/>localhost:11434"]
    MODEL["llama3.2"]
    API["POST /api/chat"]
    PARSE["mapToolCalls()<br/>parseToolArguments()"]
    TOOLS_SCHEMA["OLLAMA_TOOLS"]
    LLM_TS --> API
    API --> OLLAMA
    OLLAMA --> MODEL
    LLM_TS --> PARSE
    LLM_TS --> TOOLS_SCHEMA
  end

  subgraph TOOLS_LAYER["🟧 OUTILS — ACT"]
    EXEC["tools.ts<br/>executeTool()"]
    FU["fetch_url()"]
    RJ["run_js()"]
    SN["save_note()"]
    EXEC --> FU
    EXEC --> RJ
    EXEC --> SN
  end

  subgraph EXEC_LAYER["🔴 EXÉCUTION"]
    FETCH["fetch natif<br/>timeout 15s"]
    SPAWN["Bun.spawn<br/>fichier .ts temp"]
    BUN_RT["Bun Runtime"]
    FETCH --> FU
    SPAWN --> RJ
    BUN_RT --> SPAWN
  end

  subgraph STORAGE["⬜ STOCKAGE"]
    RAPPORT["notes/rapport.md<br/>persistance disque"]
    SN --> RAPPORT
  end

  subgraph OUTPUT["🟦 SORTIE"]
    LOGS["Logs terminal<br/>logTurn | logTool | preview 50c"]
    REP["=== Réponse ===<br/>index.ts console.log"]
    LOGS --> CLI
    REP --> CLI
  end

  IDX -->|"runAgent(messages)"| AGENT
  LOOP -->|"Reason"| LLM_TS
  HIST <-->|"read / append"| LOOP
  LLM_TS <-->|"toOllamaMessages()"| HIST
  STOP -->|"tool_use"| EXEC
  EXEC -->|"string résultat"| HIST
  STOP -->|"end_turn"| ENSURE
  ENSURE --> SN

  classDef entry fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef orch fill:#ede7f6,stroke:#5e35b1,color:#311b92
  classDef mem fill:#f3e5f5,stroke:#8e24aa,color:#4a148c
  classDef llm fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef tools fill:#fff3e0,stroke:#ef6c00,color:#e65100
  classDef exec fill:#ffebee,stroke:#c62828,color:#b71c1c
  classDef store fill:#eceff1,stroke:#546e7a,color:#263238

  class CLI,ARGV,DEF,PROMPT_TS,IDX,LOGS,REP entry
  class AGENT,LOOP,STOP,ENSURE orch
  class TYPES,HIST mem
  class LLM_TS,OLLAMA,MODEL,API,PARSE,TOOLS_SCHEMA llm
  class EXEC,FU,RJ,SN tools
  class FETCH,SPAWN,BUN_RT exec
  class RAPPORT store
```

---

## 2. Boucle ReAct détaillée (orchestration)

```mermaid
flowchart LR
  subgraph TOUR["Tour N (agent.ts — runAgent)"]
    direction TB
    R["① REASON<br/>llm(messages)"]
    D{"stop_reason ?"}
    E["② end_turn<br/>break + ensureReportSaved"]
    A["③ ACT<br/>for each tool_call"]
    O["④ OBSERVE<br/>messages.push role:tool"]
    R --> D
    D -->|end_turn| E
    D -->|tool_use| A
    A --> O
    O -->|"continue"| R
    D -->|error / invalide| X["break"]
  end

  MAX{{"MAX_TURNS = 15<br/>agent.ts L68"}}
  MAX -.-> TOUR

  classDef reason fill:#c8e6c9,stroke:#388e3c
  classDef act fill:#ffe0b2,stroke:#f57c00
  classDef observe fill:#e1bee7,stroke:#7b1fa2
  classDef decision fill:#fff9c4,stroke:#f9a825

  class R reason
  class A act
  class O observe
  class D decision
```

---

## 3. Flux de données (tool calling)

```mermaid
sequenceDiagram
  autonumber
  participant U as Utilisateur / CLI
  participant I as index.ts
  participant P as prompt.ts
  participant A as agent.ts<br/>runAgent
  participant M as messages[]<br/>mémoire session
  participant L as llm.ts<br/>llm()
  participant O as Ollama<br/>llama3.2 :11434
  participant T as tools.ts<br/>executeTool
  participant W as Web / Bun
  participant F as notes/rapport.md

  U->>I: bun run index.ts "mission"
  I->>P: buildSystemPrompt()
  P-->>I: system prompt ReAct
  I->>M: [system, user]
  I->>A: runAgent(messages)

  loop ReAct max 15 tours
    A->>L: llm(messages)
    L->>L: toOllamaMessages()
    L->>O: POST /api/chat + OLLAMA_TOOLS
    O-->>L: content + tool_calls?
    L->>L: mapToolCalls()
    L-->>A: LlmResponse + stop_reason

    alt stop_reason = tool_use
      A->>M: push assistant + tool_calls
      loop chaque ToolCall
        A->>T: executeTool(name, args)
        alt fetch_url
          T->>W: fetch(url)
          W-->>T: HTML → texte
        else run_js
          T->>W: Bun.spawn(bun, tmp.ts)
          W-->>T: stdout
        else save_note
          T->>F: Bun.write(rapport.md)
          F-->>T: OK
        end
        T-->>A: string (ou ERREUR:)
        A->>M: push role:tool + tool_call_id
      end
    else stop_reason = end_turn
      A->>M: push assistant final
      A->>A: ensureReportSaved() si besoin
      A->>T: save_note (auto)
      T->>F: écrit rapport
    end
  end

  A-->>I: history
  I->>U: console.log Réponse + chemin rapport
```

---

## 4. Cartographie fichiers ↔ responsabilités

```mermaid
flowchart TB
  subgraph FILES["Codebase TypeScript"]
    index["index.ts<br/>Point d'entrée · CLI · affichage"]
    prompt["prompt.ts<br/>System prompt agent"]
    agent["agent.ts<br/>Orchestration ReAct"]
    llm["llm.ts<br/>Client Ollama"]
    tools["tools.ts<br/>Implémentation outils"]
    types["types.ts<br/>Contrats de données"]
  end

  subgraph DATA["Persistance"]
    md["notes/rapport.md<br/>Rapport Markdown"]
  end

  subgraph EXTERNAL["Externe"]
    ollama["Ollama :11434"]
    internet["Internet · pages web"]
    bun["Bun subprocess"]
  end

  index --> prompt
  index --> agent
  agent --> llm
  agent --> tools
  agent --> types
  llm --> types
  tools --> types
  llm --> ollama
  tools --> internet
  tools --> bun
  tools --> md

  classDef f_orch fill:#d1c4e9,stroke:#512da8
  classDef f_llm fill:#c8e6c9,stroke:#388e3c
  classDef f_tool fill:#ffcc80,stroke:#ef6c00
  classDef f_mem fill:#e1bee7,stroke:#7b1fa2
  classDef f_store fill:#cfd8dc,stroke:#455a64

  class index,agent f_orch
  class llm f_llm
  class tools f_tool
  class types f_mem
  class md f_store
```

---

## 5. Gestion interne (erreurs, logs, parsing)

| Composant | Fichier | Fonctions / éléments |
|-----------|---------|----------------------|
| **Types** | `types.ts` | `Message`, `ToolCall`, `LlmResponse`, `StopReason` |
| **Parsing tool_calls** | `llm.ts` | `mapToolCalls()`, `parseToolArguments()`, `toOllamaMessages()` |
| **Logs tours** | `agent.ts` | `logTurn()`, `describeAction()` |
| **Logs outils** | `tools.ts` | `logTool()`, `previewResult()` (50 car.) |
| **Erreurs LLM** | `llm.ts` | timeout, HTTP 404, JSON invalide |
| **Erreurs outils** | `tools.ts` | `ERREUR: ...` retourné en string (pas de crash agent) |
| **Erreurs boucle** | `agent.ts` | try/catch `llm()`, `stop_reason: error` |
| **Limite tours** | `agent.ts` | `MAX_TURNS = 15`, `max_turns` |

---

## 6. Légende des couleurs

| Couleur | Domaine |
|---------|---------|
| Bleu | Entrée / sortie utilisateur (CLI, terminal) |
| Violet | Orchestration harness (boucle ReAct) |
| Violet clair | Mémoire session (`messages[]`) |
| Vert | LLM (Ollama, reasoning, tool selection) |
| Orange | Outils (tool calling, `executeTool`) |
| Rouge | Exécution (fetch, Bun.spawn) |
| Gris | Stockage persistant (`rapport.md`) |

---

## 7. Mémoire : ce qui est persistant vs session

| Donnée | Persistant ? | Où |
|--------|--------------|-----|
| Historique `messages[]` | Non (RAM, une exécution) | `agent.ts` — `runAgent()` |
| Rapport mission | **Oui** (disque) | `notes/rapport.md` via `save_note()` |
| Logs terminal | Non | stdout |
| Modèle Ollama | Oui (disque Ollama) | Hors repo — `~/.ollama` |

**Mémoire persistante métier** = uniquement **`notes/rapport.md`**.  
**Mémoire de travail** = tableau **`messages`** passé à chaque appel `llm()`.

---

## 8. Références code (points d'ancrage)

| Flux | Fichier · Lignes (approx.) |
|------|---------------------------|
| Mission CLI | `index.ts` L17-19 |
| System prompt | `prompt.ts` L2-38 · `index.ts` L22 |
| Lancement boucle | `index.ts` L29 → `agent.ts` `runAgent()` |
| Reason | `agent.ts` L110 · `llm.ts` `llm()` L131 |
| Act multi-outils | `agent.ts` L139-155 · `tools.ts` `executeTool()` L193 |
| Observe / réinjection | `agent.ts` L149-153 · `llm.ts` `toOllamaMessages()` L77 |
| stop_reason | `llm.ts` L184-195 · `agent.ts` L132-160 |
| Rapport auto | `agent.ts` `ensureReportSaved()` L25-65 |
| Ollama endpoint | `llm.ts` L3-4 · L134 |
