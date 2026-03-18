# Pollinations CLI

A high-performance command line interface for [Pollinations.ai](https://pollinations.ai). Unified access to text, image, audio, and video generation — plus **Pollina**, a full multi-agent autonomous swarm that can write code, build projects, and take action.

## Installation

### Global (after npm publish)
```bash
npm install -g @bluegaminggm/pollinations-cli
```

### Local Development
```bash
git clone https://github.com/blueplaysgames3921/pollinations-cli.git
cd pollinations-cli
npm install
npm link --force
```

---

## Authentication

```bash
pollinations login
```

Two methods available:
- **BYOP (recommended)** — opens your browser, grabs the key from your existing Pollinations session instantly
- **Manual** — paste your API key directly

Keys are stored locally in `~/.pollinations/config.json`. The same key is automatically forwarded to any MCP servers you configure.

```bash
pollinations config    # show stored config and key path
pollinations profile   # show Pollen balance, tier, and permissions
```

---

## Core Commands

### Text
```bash
pollinations text "Explain quantum entanglement"
pollinations text "Write a technical brief" --stream
pollinations text "Refactor this code" --model qwen-coder
pollinations text -f context.txt
cat logs.txt | pollinations text "Summarize these errors"
```

### Image
```bash
pollinations image "High-contrast architectural photography"
pollinations image "Logo design" --model flux --width 1024 --height 1024 --output result.png
```

### Audio
```bash
pollinations audio "A calm narration about space" --voice rachel --speed 1.0
pollinations audio "Ambient lo-fi music" --instrumental true
```

### Video
```bash
pollinations video "A futuristic spacecraft landing" --width 1280 --height 720
```

### Interactive Chat
```bash
pollinations chat
pollinations chat --model openai
pollinations chat --system "You are a senior web developer"
```

Inside chat: type `clear` to reset memory, `exit` to end (with a save prompt).

### Models
```bash
pollinations models
pollinations models --type image
```

### Batch & Gallery
```bash
pollinations batch prompts.txt --parallel 5 --output-dir ./outputs
pollinations gallery
```

### History & Templates
```bash
pollinations history
pollinations replay <id>
pollinations template save review "Analyze this {language} code: {code}"
pollinations template run review --language javascript
```

---

## Sessions

Every chat and assist session can be saved and resumed later.

### Saving
When you type `exit` inside `chat` or `assist`, you are asked:
```
Save this session? (Y/n):
```
- **Y** — saves to `~/.pollinations/sessions.json` with a numbered ID
- **n** — exits without saving

### Listing sessions
```bash
pollinations session
```
Displays a table with ID, type (chat/assist), saved date, model or directory, and title.

### Resuming
```bash
pollinations continue 3
```
Loads session #3 and resumes it exactly where you left off:
- **Chat** — shows the last 10 messages, then continues with full history in context
- **Assist** — shows a recap of the previous session, restores Pollina to the exact directory she was working in

When you exit a resumed session, you are asked again whether to save — this **updates** the existing session rather than creating a new one.

If the original directory was deleted, Pollina falls back to your current directory.

---

## Pollina — Autonomous Swarm Agent

```bash
pollinations assist
# or alias:
pollinations pollina
```

Pollina is a multi-role autonomous agent that can write code, build projects, run commands, generate images, and search the web.

### How the swarm works

```
User input
    │
    ▼
 Greeting? → short direct reply, no tools
    │
    ▼
Coder (qwen-coder)
    │
    ├─ consult_architect  → Architect (mistral)    blueprints the plan
    │
    ├─ consult_researcher → Researcher             grounded web search via Pollinations API
    │       └─ findings injected into Critic for Truth Injection
    │
    ├─ write_file / edit_file → Ghost Runtime     syntax-checks JS/JSON before write
    │
    ├─ [any tool] → execute
    │       └─ write_file / edit_file / shell_exec / generate_image / MCP tools
    │              ↓
    │          Critic (openai)   validates with full project context
    │              │
    │          FAIL → Coder fixes, loop continues
    │          PASS → continue
    │
    └─ no tool → done
```

**Critic is skipped** for read-only tools (`read_file`, `list_files`, `test_syntax`) and simple operations (`delete_file`, `move_file`, `capture_asset`) where validation adds no value.

**Context compression** fires automatically when the session grows past 26 messages, summarising older history into a compact state snapshot so the agent stays sharp over long sessions.

---

## AGENTS.md

Pollina reads `AGENTS.md` from your project root. If none exists, it offers to create one.

```yaml
roles:
  architect: "mistral"      # blueprint planner
  coder:     "qwen-coder"   # executor — writes code and calls tools
  critic:    "openai"       # quality gate — validates before code hits disk
  artist:    "flux"         # default image model

researcher:
  model:   "gemini-search"  # grounded search model — uses your Pollinations API key
  enabled: true

constraints:
  - "Never delete the .git folder"
  - "Always use ESM (import/export)"
  - "Never hardcode API keys"

mcp_servers:
  - name:    "pollinations"
    command: "npx"
    args:    ["-y", "@pollinations_ai/mcp"]

context: "Node.js ESM project on Pollinations.ai"
```

---

## MCP Servers

MCP servers extend Pollina with new capabilities. They are connected at startup and their tools appear automatically in Pollina's tool list.

### Credential injection

Your Pollinations API key is automatically forwarded to every MCP server as `POLLINATIONS_API_KEY`. For servers that need other credentials, use the `env:` block in AGENTS.md with `${VAR_NAME}` placeholders:

```yaml
mcp_servers:
  - name:    "github"
    command: "npx"
    args:    ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"   # reads from your shell environment at runtime
```

Set the variable in your shell before running:
```bash
export GITHUB_TOKEN="ghp_yourtoken"
pollinations assist
```

The `${VAR_NAME}` syntax resolves from `process.env` at startup — credentials never need to be hardcoded in the file.

### Available MCP servers (examples)

| Server | Package | Capability |
|---|---|---|
| Pollinations | `@pollinations_ai/mcp` | Richer image generation and more asset tools (Flux, SDXL) |
| GitHub | `@modelcontextprotocol/server-github` | PRs, commits, issue search |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Query and manage databases |
| Slack | `@modelcontextprotocol/server-slack` | Send messages, read channels |
| Filesystem | `@modelcontextprotocol/server-filesystem` | Extended file operations |

All are commented out by default in the generated AGENTS.md — uncomment and add credentials to enable.

---

## Available Tools

| Tool | Description | Critic runs? |
|---|---|---|
| `read_file` | Read full file content | No |
| `write_file` | Create or overwrite a file (full content required) | Yes |
| `edit_file` | Surgical edits: insert, delete, replace lines or text | Yes |
| `move_file` | Move or rename a file | No |
| `delete_file` | Delete a file (.git blocked) | No |
| `list_files` | List directory contents | No |
| `shell_exec` | Run shell commands | Yes |
| `test_syntax` | Validate JS/JSON without writing to disk | No |
| `generate_image` | Generate image via Pollinations API | Yes |
| `capture_asset` | Download a remote URL to local disk | No |
| `consult_architect` | Get a technical blueprint | — |
| `consult_researcher` | Grounded web search via Pollinations | — |

---

## Security

- **Path hardening** — all file operations resolve against `process.cwd()`. Path traversal is blocked.
- **`.git` protection** — deleting `.git` is permanently forbidden.
- **Shell safety** — catastrophic patterns (`rm -rf /`, `mkfs`, etc.) are hard-blocked before execution.
- **No secret leakage** — API keys stay in `~/.pollinations/config.json` and are never written to project files.
- **MCP credential isolation** — each MCP server only receives the env vars explicitly listed for it.

---

## Project Structure

```
bin/
  pollinations.js        CLI entry point and command routing
src/
  commands/
    assist.js            Pollina swarm agent entry point
    chat.js              Interactive chat with session save
    sessions.js          session / continue commands
    auth.js              Login (BYOP + manual)
    text.js / image.js / audio.js / video.js / batch.js
    history.js / template.js / models.js / profile.js
  lib/
    agent/
      orchestrator.js    Multi-role loop, compression, researcher, critic
      tool-manager.js    Local tools with path hardening and ghost runtime
      mcp-manager.js     MCP connections with env injection
    api.js               Axios client with API key auth
    config-store.js      Config persistence (~/.pollinations/)
    sessions.js          Session save/load/list (~/.pollinations/sessions.json)
  utils/
    history.js           Command history and gallery
AGENTS.md               Project-level agent configuration
```

---

## Data Storage

| File | Contents |
|---|---|
| `~/.pollinations/config.json` | API key and settings |
| `~/.pollinations/history.jsonl` | Last 50 command operations |
| `~/.pollinations/sessions.json` | Saved chat and assist sessions |
| `~/.pollinations_history.json` | Batch gallery log |
