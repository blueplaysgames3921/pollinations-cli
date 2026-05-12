# Pollinations CLI

A high-performance command line interface for [Pollinations.ai](https://pollinations.ai). Unified access to text, image, audio, video, and media generation — plus **Pollina**, a full multi-agent autonomous swarm that can write code, build projects, run and preview them, and take action.

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

**Optional dependencies** — install for extra features:
```bash
npm install sharp      # image downscaling in the Analyser agent (saves tokens)
npm install clipboardy # --copy flag on pollinations upload
```

---

## Authentication

```bash
pollinations login
```

Two methods:
- **BYOP (recommended)** — opens your browser, grabs the key from your existing Pollinations session
- **Manual** — paste your API key directly

Keys are stored in `~/.pollinations/config.json` and forwarded automatically to MCP servers.

```bash
pollinations config    # show raw config
pollinations profile   # Pollen balance, tier, key details
pollinations quota     # show or set local hourly call cap
```

---

## Core Commands

All generation commands accept `-k, --key <key>` to override your stored API key for a single request.

### Text
```bash
pollinations text "Explain quantum entanglement"
pollinations text "Refactor this" --model qwen-coder --stream
pollinations text -f context.txt
cat logs.txt | pollinations text "Summarize these errors"

# Vision — attach any image URL
pollinations text "What's in this image?" --image https://media.pollinations.ai/<hash>
```

### Image
```bash
pollinations image "High-contrast architectural photography"
pollinations image "Logo" --model zimage --width 1024 --height 1024 --output logo.png

# Image-to-image
pollinations image "Make it look like a painting" --image https://media.pollinations.ai/<hash>

# Upload result immediately after generation
pollinations image "Sunset" --upload
```

### Audio
```bash
# TTS — defaults to elevenlabs
pollinations audio "A calm narration about space" --voice rachel
pollinations audio "Welcome" --model qwen-tts

# Music — pick a music model
pollinations audio "Ambient lo-fi beat" --model elevenmusic
```

### Transcribe
```bash
pollinations transcribe recording.mp3
pollinations transcribe interview.webm --model scribe --language en
pollinations transcribe podcast.mp4 --output transcript.txt

# Valid STT models: whisper (default), universal-2, scribe, universal-3-pro
```

If you pass a non-STT model you'll be prompted to switch, proceed, or cancel.

### Video
```bash
pollinations video "A futuristic spacecraft landing" --width 1280 --height 720

# Animate from a reference image
pollinations video "Camera slowly pans right" --image https://media.pollinations.ai/<hash>

pollinations video "Ocean waves" --upload
```

### Upload
```bash
# Upload to media.pollinations.ai (14-day TTL, content-addressed)
pollinations upload photo.png
pollinations upload clip.mp4 --copy   # also copies URL to clipboard

# Pipe the URL into other commands
pollinations image "Add a rainbow" --image <returned-url>
pollinations text "Describe this" --image <returned-url>
```

### Search
```bash
pollinations search "latest developments in fusion energy"
pollinations search "current BTC price" --model perplexity-fast
pollinations search "who won the championship" --raw

# Search-capable models: gemini-search (default), perplexity-fast,
# perplexity-reasoning, gemini, gemini-large
```

### QR Code
```bash
# Local generation — zero API cost, zero Pollen
pollinations qr "https://pollinations.ai"
pollinations qr "Hello" --output code.svg
pollinations qr "wifi-password" --size 400 --error H --print

# Formats: .png (default), .svg, .txt
```

### Remove Background
```bash
pollinations remove-bg photo.jpg
pollinations remove-bg product.png --output product_transparent.png
```

### Diagram
```bash
pollinations diagram "User authentication flow with OAuth"
pollinations diagram "Database schema for e-commerce" --type er
pollinations diagram "CI/CD pipeline" --format svg --print

# Types: flowchart, sequence, class, er, gantt, pie, mindmap, timeline, gitgraph, state
# Formats: mmd (default), svg, md
```

### Interactive Chat
```bash
pollinations chat
pollinations chat --model openai
pollinations chat --system "You are a senior web developer"
```

Type `clear` to reset memory, `exit` to end (with save prompt).

### Models
```bash
pollinations models
pollinations models --type image
pollinations models --type audio
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

## Account & Balance

```bash
pollinations profile        # tier, 3-bucket balance breakdown, key details
pollinations usage          # per-request log with cost and response time
pollinations usage-daily    # daily bar chart of spend and request counts
pollinations usage-daily --breakdown   # also shows cost by model
```

### Balance buckets

Pollen is split into three buckets, deducted in this order:

| Bucket | Source | Hourly max |
|---|---|---|
| `tierBalance` | Free hourly grant | spore: 0.01 · seed: 0.15 · flower: 0.4 · nectar: 0.8 |
| `cryptoBalance` | Purchased via crypto | No limit |
| `packBalance` | Purchased via pack | No limit |

---

## API Key Management

```bash
pollinations keys list
pollinations keys create                        # interactive wizard
pollinations keys create --name "CI" --expires 30 --perms usage
pollinations keys revoke <id>
pollinations keys revoke <id> --yes             # skip confirmation
```

Requires `account:keys` on a secret (`sk_`) key. Full key value shown once on creation only.

---

## Settings

All defaults persist across sessions. Flags always override for a single run.

```bash
pollinations settings list                      # all settings with current values
pollinations settings list --filter model       # filter by keyword
pollinations settings list --changed            # only customised settings
pollinations settings get defaults.image.model
pollinations settings set defaults.image.model flux
pollinations settings set upload.auto true
pollinations settings reset defaults.image.model
pollinations settings reset --yes               # reset everything
pollinations settings wizard                    # guided walkthrough
pollinations settings export --output settings.json
pollinations settings import settings.json
```

### Key settings

| Key | Default | Description |
|---|---|---|
| `defaults.text.model` | `openai` | Default text model |
| `defaults.image.model` | `zimage` | Default image model |
| `defaults.audio.model` | `elevenlabs` | Default audio model |
| `defaults.video.model` | `veo` | Default video model |
| `defaults.transcribe.model` | `whisper` | Default STT model |
| `defaults.audio.voice` | `rachel` | Default TTS voice |
| `defaults.image.width` | `1024` | Default image width |
| `defaults.image.height` | `1024` | Default image height |
| `upload.auto` | `false` | Auto-upload generated images/videos |
| `upload.confirm` | `true` | Ask before auto-uploading |
| `upload.saveUrl` | `true` | Print media URL after upload |
| `text.stream` | `false` | Stream text by default |
| `agent.indexer.model` | `mistral` | Model for the Indexer agent |
| `agent.analyser.model` | `llama-scout` | Model for the Analyser agent |
| `agent.executor.model` | `openai` | Model for the Executor agent |

---

## Local Call Quota

```bash
pollinations quota           # show current usage and cap
pollinations quota 50        # set cap to 50 calls/hour
pollinations quota 0         # remove cap (unlimited)
```

A local safeguard separate from Pollen balance. Warns at 80%, blocks at 100%, resets on the hour.

---

## Resilience & Fallbacks

Every API call is wrapped with:
- **Retries** — 3 attempts, exponential backoff (1s → 2s → 4s)
- **No retry** on 400, 401, 403, 404, 422
- **Free fallback on 402** — switches to cheapest equivalent model for the command type, retries once
- **Global type default** if no specific fallback: `openai` / `flux` / `qwen-tts` / `whisper` / `ltx-2`
- **Readable errors** — every HTTP and network error translated to plain English

---

## Sessions

```bash
pollinations session          # list saved sessions
pollinations continue 3       # resume session #3
```

Saves full conversation history. Resuming restores complete context.

---

## Pollina — Autonomous Swarm Agent

```bash
pollinations assist
# alias:
pollinations pollina
```

Pollina is a multi-role autonomous swarm that writes code, runs commands, generates media, searches the web, and — when done — installs dependencies, lints, tests, and runs a live preview of your project.

### Agent roles

| Role | Default model | Job |
|---|---|---|
| Coder | `qwen-coder` | Executes tasks, writes files, runs commands |
| Architect | `mistral` | Blueprints multi-file plans before coding |
| Critic | `openai` | Validates every write/exec before it lands on disk |
| Researcher | `gemini-search` | Grounded web search for current API/library info |
| **Indexer** | `mistral` | Reads the project on startup, feeds structured context to Coder |
| **Analyser** | `llama-scout` | Reads files/images mentioned in chat, describes them for Coder |
| **Executor** | `openai` | Installs deps, lints, tests, and runs/previews on task complete |

### How the swarm works

```
User input
    │
    ├─ Greeting? → short reply, no tools
    │
    ├─ Analyser reads any file paths mentioned in message
    │
    ├─ Complex task? → Architect plans first (auto-triggered)
    │
    ▼
Coder (qwen-coder)
    │
    ├─ consult_architect  → Architect    structured blueprint
    ├─ consult_researcher → Researcher   grounded web search
    ├─ write_file / edit_file
    │       ├─ Ghost runtime: syntax check + lint pass
    │       └─ Export change detection (warns if exports removed)
    ├─ shell_exec         → runs with .env vars injected
    │       └─ Destructive commands (rm -rf etc.) → user confirmation
    │
    └─ Any tool result → Critic validates → FAIL loops back to Coder
    │
    ├─ "Task is complete" → user confirmation
    │
    ▼
Executor
    ├─ Detects project type (16 types)
    ├─ Installs all dependencies
    ├─ Lints (eslint / pylint / clippy / go vet)
    ├─ Runs tests
    └─ Runs/previews: web server → clickable localhost URL
                      bot → watches for "connected" confirmation
                      APK → gradle build → reports APK path
                      Docker → docker compose up
```

### Indexer

Runs on startup, reads all project files, and produces a structured technical summary covering project type, framework, entry points, key dependencies, build/run commands, and architecture. Injected into Coder's system prompt every turn.

Uses `chokidar` to watch for file changes. When files change, only the modified files are re-read and the existing summary is patched (not rebuilt). The Coder receives a "Files changed since last index: ..." message so it knows what changed.

### Analyser

Intercepts every user message and detects file paths. Processes all found files in parallel:
- **Images** — downscaled to 512px (saves tokens), sent as vision messages. Full resolution retried if model signals it can't see enough detail.
- **Code/config/text** — structurally summarised: exports, imports, key functions, config values (secrets masked), issues.

Uses `llama-scout` by default. Falls back to `openai-fast` if the model doesn't support vision — fallback is call-local and never changes the configured model.

### Executor

Triggered when Coder signals task completion and user confirms. Detects project type from the filesystem, installs all dependencies, lints, runs tests, then:

| Project type | Preview |
|---|---|
| Web (React, Next, Vite, Express…) | Starts dev server, finds free port, prints clickable URL |
| Python web (Flask, FastAPI, Django) | Starts server, prints URL |
| Discord / Telegram / Slack bot | Starts bot, watches stdout for connection confirmation |
| Android | `./gradlew assembleDebug`, reports APK path |
| Go / Rust | `go build` / `cargo build --release` |
| Docker | `docker compose up -d` |

If lint or tests fail, results are fed back to the Coder for a fix pass without consuming iteration budget.

### Attaching files in chat

You don't need flags. Just mention file paths naturally in your message:

```
check ./src/app.js for the bug
what does this screenshot show? /tmp/error.png
review "config/database.yml" and suggest improvements
```

The Analyser picks them up automatically.

### .env support

On startup, Pollina reads `.env` from the project root and injects all variables into every shell command. Key names (not values) are printed to confirm they loaded. Supports `export VAR=value` syntax, quoted values, and comments.

---

## AGENTS.md

Pollina reads `AGENTS.md` from your project root. Created automatically if absent.

```yaml
roles:
  architect: "mistral"      # blueprints multi-file plans
  coder:     "qwen-coder"   # executes tasks, writes files
  critic:    "openai"       # validates before code hits disk
  artist:    "flux"         # image generation model
  indexer:   "mistral"      # project indexing on startup
  analyser:  "llama-scout"  # file/image analysis in chat
  executor:  "openai"       # install, lint, test, preview

researcher:
  model:   "gemini-search"
  enabled: true

constraints:
  - "Never delete the .git folder"
  - "Always use ESM (import/export)"
  - "Never hardcode API keys"

mcp_servers:
  - name:    "pollinations"
    command: "npx"
    args:    ["-y", "@pollinations_ai/mcp"]

context: "Node.js ESM project"
```

---

## MCP Servers

MCP servers extend Pollina with new capabilities. Connected at startup, tools appear automatically in Pollina's tool list.

Your Pollinations API key is automatically forwarded as `POLLINATIONS_API_KEY`. For other credentials:

```yaml
mcp_servers:
  - name:    "github"
    command: "npx"
    args:    ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

```bash
export GITHUB_TOKEN="ghp_yourtoken"
pollinations assist
```

### Available MCP servers (examples)

| Server | Package | Capability |
|---|---|---|
| Pollinations | `@pollinations_ai/mcp` | Richer image generation |
| GitHub | `@modelcontextprotocol/server-github` | PRs, commits, issues |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Query and manage databases |
| Slack | `@modelcontextprotocol/server-slack` | Send messages, read channels |
| Filesystem | `@modelcontextprotocol/server-filesystem` | Extended file operations |

---

## Available Agent Tools

| Tool | Description | Critic? |
|---|---|---|
| `read_file` | Read file content | No |
| `write_file` | Create or overwrite. Runs lint + export change detection. | Yes |
| `edit_file` | Surgical edits. Runs export change detection. | Yes |
| `move_file` | Move or rename | No |
| `delete_file` | Delete (.git blocked) | No |
| `list_files` | List directory | No |
| `shell_exec` | Run shell command (.env vars injected, exit code always shown) | Yes |
| `test_syntax` | Validate JS/JSON syntax + lint without writing | No |
| `generate_image` | Generate image via Pollinations API | Yes |
| `capture_asset` | Download remote URL to disk | No |
| `consult_architect` | Get a technical blueprint | — |
| `consult_researcher` | Grounded web search | — |

---

## Security

- **Path hardening** — all file operations resolve against `process.cwd()`. Path traversal is blocked.
- **`.git` protection** — deleting `.git` is permanently forbidden.
- **Destructive command warnings** — `rm -rf`, `mkfs`, `dd if=`, `wipefs`, `shred` and similar require user confirmation before execution.
- **Shell exit codes** — always shown on failure so the Coder knows commands failed.
- **No secret leakage** — API keys stay in `~/.pollinations/config.json` and are never written to project files. `.env` values are injected into shell but never logged.
- **MCP credential isolation** — each MCP server only receives the env vars explicitly listed for it.

---

## Project Structure

```
bin/
  pollinations.js           CLI entry point and command routing
src/
  commands/
    assist.js               Pollina swarm agent entry point
    chat.js                 Interactive chat with session save
    sessions.js             session / continue commands
    auth.js                 Login (BYOP + manual)
    text.js                 Text generation
    image.js                Image generation
    audio.js                TTS and music generation
    video.js                Video generation
    transcribe.js           Speech-to-text transcription
    upload.js               File upload to media.pollinations.ai
    search.js               Web search via AI
    qr.js                   QR code generation (local, no API cost)
    remove-bg.js            Background removal
    diagram.js              Mermaid diagram generation
    keys.js                 API key management
    usage.js                Usage history and daily charts
    profile.js              Account profile and balance
    settings.js             CLI settings management
    batch.js                Parallel image batch generation
    history.js              Command history and replay
    template.js             Prompt templates
    models.js               Model listing
  lib/
    agent/
      orchestrator.js       Multi-role loop, compression, auto-Architect
      tool-manager.js       Local tools with lint, export detection, .env
      mcp-manager.js        MCP connections with env injection
      indexer.js            Project indexer with diff-aware re-index
      analyser.js           File/image analyser with parallel processing
      executor.js           Install, lint, test, run/preview
    api.js                  Axios client with key override support
    api-resilience.js       Retry, fallback, and error translation
    config-store.js         Config persistence (~/.pollinations/)
    quota-manager.js        Local call cap + live balance fetcher
    settings.js             Settings system with defaults and coercion
    sessions.js             Session save/load/list
  utils/
    history.js              Command history and gallery
AGENTS.md                   Project-level agent configuration
CHANGELOG.md                Version history
```

---

## Data Storage

| File | Contents |
|---|---|
| `~/.pollinations/config.json` | API key, settings, local quota state |
| `~/.pollinations/history.jsonl` | Last 50 command operations |
| `~/.pollinations/sessions.json` | Saved chat and assist sessions |
| `~/.pollinations_history.json` | Batch gallery log |

