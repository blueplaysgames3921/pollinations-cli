# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

## [1.4.0] - 2026-05-11

### Added

#### New CLI Commands

- **`pollinations transcribe <file>`** — Speech-to-text from any local audio file (mp3, mp4, wav, webm, ogg, flac, m4a). Defaults to `whisper`. Validates the chosen model against the known STT list (`whisper`, `universal-2`, `scribe`, `universal-3-pro`) and prompts to switch, proceed, or cancel if unrecognised. Error-based detection catches wrong model types post-request. Supports `--language`, `--output`, `--key`.

- **`pollinations upload <file>`** — Upload local files to `media.pollinations.ai`. Content-addressed, 14-day TTL, resets on re-upload. Validates file existence and extension before the spinner starts. `--copy` sends the returned URL to clipboard. URL pipes directly into `--image` on text, image, and video commands.

- **`pollinations search <query>`** — Web search via search-capable AI models. Defaults to `gemini-search`. Warns if chosen model lacks `hasSearch`. `--raw` for minimal output.

- **`pollinations qr <text>`** — QR code generation. Fully local via `qrcode` npm package — zero API calls, zero Pollen cost. Outputs PNG (default), SVG, or TXT. `--print` shows ASCII art in terminal. Configurable size, margin, colours, error correction level.

- **`pollinations remove-bg <file>`** — Background removal. Uploads source image first, then sends through `p-image-edit`. Output is a transparent PNG.

- **`pollinations diagram <description>`** — Mermaid diagram generation via AI. 10 diagram types. Saves as `.mmd`, `.md`, or `.svg` (via mermaid-cli, falls back gracefully with install hint). `--print` outputs syntax to terminal.

- **`pollinations keys list|create|revoke`** — Full API key management. Requires `account:keys` on a secret key. `create` runs an interactive wizard or skips it if all flags are passed. Full key value shown once on creation. `revoke` handles 400 (self-revoke), 404 (not found), 403 (no permission).

- **`pollinations usage`** — Per-request usage log with model, type, billing source (tier/crypto/pack colour-coded), cost in USD, response time. Requires `account:usage`.

- **`pollinations usage-daily`** — Daily bar chart of spend and request counts. Bar colour shifts green→yellow→red. `--breakdown` adds top-15 model cost table.

- **`pollinations settings list|get|set|reset|wizard|export|import`** — Full CLI settings system persisted in `~/.pollinations/`. Covers default models, output dimensions, audio voice/format, upload behaviour, confirmation toggles, display preferences, stream mode, agent role models.

- **`pollinations quota [limit]`** — Local hourly call cap, separate from Pollen balance. Warns at 80%, blocks at 100%, shows exact reset time. Pass `0` to remove cap.

#### New Agent Capabilities

- **Indexer agent** (`src/lib/agent/indexer.js`) — Runs on `pollinations assist` startup. Walks project tree (6 levels deep, ignores `node_modules`, `.git`, `dist`, etc.), reads manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `Dockerfile`, etc.) and entry point files, calls the indexer model (default `mistral`) for a structured technical summary. Summary is injected into Coder's system prompt every turn. Uses `chokidar` for file-change watching with diff-aware partial re-index: only changed files are re-read and the existing summary is patched, not rebuilt from scratch. `_partialReindex` bails if a full index is already running to prevent race conditions.

- **Analyser agent** (`src/lib/agent/analyser.js`) — Intercepts every user message and detects file paths (quoted, relative `./`, and absolute). Images sent as base64 vision messages (downscaled to 512px first; retries at full resolution if model responds `NEEDS_FULL_RESOLUTION`). Code/config/text files structurally summarised. Uses `llama-scout` by default. Vision fallback to `openai-fast` on 400/422 is call-local — never mutates instance state. All files processed in parallel via `Promise.allSettled` (one failure doesn't abort the rest). Greeting messages skip the analyser entirely. Analyser output pushed after the user message in history, not before.

- **Executor agent** (`src/lib/agent/executor.js`) — Triggered when Coder signals task completion (natural language detection) and user confirms. Detects project type from filesystem (16 types: web-framework, web-vite, web-frontend, web-server, node-generic, bot-discord, bot-telegram, bot-slack, electron, react-native, android, ios, python-generic, web-server-py, go-generic, rust-generic, docker). Installs all dependencies for the detected stack (npm/yarn/pnpm/pip/go/cargo, auto-detects lockfile). Lints (eslint/pylint/clippy/go vet). Runs tests if detected. Runs/previews: web servers find a free port, start in background, wait for port to open, print a clickable terminal hyperlink. Bots watch stdout for connection confirmation. APKs run `./gradlew assembleDebug`, report APK path. Executor failures fed back to Coder for a fix pass without consuming Coder's iteration budget (`iteration--`).

- **Auto-Architect trigger** — Tasks scoring 2+ complexity keywords or 25+ words automatically invoke the Architect before the Coder starts. `architectCalled` flag prevents double-trigger if Coder also manually calls `consult_architect`. `'complete'` removed from the keyword list to prevent collision with completion detection.

- **Decisions-only context compression** — The session compressor now extracts only: files created/edited/deleted, commands run, errors resolved, key decisions, current state. Reasoning and explanation are explicitly discarded, keeping history lean without losing facts. Compression is skipped when the most recent system message is an Executor failure, preventing it from being swallowed before the Coder can act.

- **`.env` parsing** — `.env` file in the project root is read on `pollinations assist` startup. Key-value pairs (including `export VAR=val` syntax, quoted values, comments) are injected into every `shell_exec` call. Key names (not values) are printed to confirm they loaded.

- **Post-run summary** — After each agent run, a one-line summary is printed: `Created: app.js · Edited: config.js · Deleted: old.js`. File existence is checked before the tool call so new vs. edited is correctly determined.

- **Destructive command warnings** — Shell commands matching patterns (`rm -rf`, `mkfs`, `dd if=`, `wipefs`, `shred`, etc.) prompt the user before execution. Non-destructive commands run uninterrupted.

#### Infrastructure

- **API resilience layer** (`src/lib/api-resilience.js`) — 3-attempt retry with exponential backoff (1s → 2s → 4s). Skips retry on 400/401/403/404/422. On 402 tries per-model fallback (built from the official model list), then global type default (`openai`/`flux`/`qwen-tts`/`whisper`/`ltx-2`). `audio` and `audio-stt` are separate type keys. One fallback attempt maximum. Every HTTP and network error translated to a human-readable message.

- **Settings system** (`src/lib/settings.js`) — Central store with automatic type coercion on write. Covers default models for all commands, output dimensions, audio voice/format, upload behaviour, confirmation toggles, display, stream mode, agent role models (indexer, analyser, executor).

- **Quota manager** (`src/lib/quota-manager.js`) — Local hourly call counter using `floor(epoch / 3600000)`. Also exports `fetchBalance()` which hits `/account/balance` and returns the three real Pollen buckets (`tierBalance`, `cryptoBalance`, `packBalance`).

- **Ghost runtime lint pass** — `test_syntax` and `write_file` both run `quickLint`: unused variables/imports (via per-name regex with proper RegExp escaping for `$` and `.` in names), unreachable code after `return`/`throw`. Results appended to tool output so Coder can self-correct.

- **Export change detection** — `write_file` and `edit_file` snapshot named exports before and after. If any export is removed, the result message warns: `⚠ Export change detected: removed [foo, bar] — other files importing these will break.`

- **`shell_exec` exit code visibility** — Non-zero exit codes are always appended to output even when stdout/stderr is present, so the Coder can distinguish a passing command with output from a failing one.

- **`--image <url>`** on `text`, `image`, `video` — Accepts any public URL or `media.pollinations.ai` URL. Vision message on `text`, reference image for img2img/animate on `image`/`video`.

- **`--upload`** on `image`, `video` — Post-generation upload hook. Controlled by `upload.auto`, `upload.confirm`, `upload.saveUrl` settings.

- **`--key <key>`** on all generation and account commands — Per-request API key override.

- **`chokidar`, `qrcode`, `form-data`** added to `package.json` dependencies.

### Changed

- **`pollinations audio`** — Removed `--instrumental` flag. Model choice determines TTS vs music. Defaults to `defaults.audio.model` setting (factory: `elevenlabs`).
- **`pollinations image`** — Default model corrected to `zimage`. Added `--image` and `--upload`.
- **`pollinations video`** — Endpoint corrected to `/video/{prompt}`. Added `--image` and `--upload`.
- **`pollinations text`** — Added `--image` for vision. Content sent as array (not JSON string).
- **`pollinations profile`** — Rebuilt with real `/account/balance` three-bucket display. Tier grant bar scaled to real hourly maxes. Unknown tier warns. Reset time from API's `nextResetAt`.
- **`pollinations quota`** — Clarified as a local call cap, not a Pollen tracker.
- **All generation commands** — Read defaults from settings, pass `type` to `resilientCall`, run quota check/increment.
- **`AGENTS.md` template** — Updated with `indexer`, `analyser`, `executor` role entries.
- **`DEFAULT_CONFIG`** — Includes `indexer`, `analyser`, `executor` role models.
- **`src/lib/api.js`** — `getApi()` accepts optional `keyOverride`.
- **Orchestrator** — Integrates Indexer, Analyser, Executor. `cleanup()` stops watcher and kills Executor process on exit. System prompt includes Indexer context block.

### Fixed

- Video endpoint was `/image/{prompt}` — corrected to `/video/{prompt}`
- Image default model was `flux` — corrected to `zimage`
- STT default was `whisper-large-v3` (doesn't exist) — corrected to `whisper`
- Free fallback map had invented model IDs — rebuilt from official model list
- `gemini-fast` listed as search-capable — removed (no `hasSearch`)
- `remove-bg.js` `resilientCall` ignored the `m` param — fallback never worked
- `qr.js` had unused `getSetting`/`formatError` imports
- `remove-bg.js` had unused `axios` import
- `diagram.js` SVG fallback used `str.replace('.svg')` — breaks on paths with dots
- `profile.js` unknown tier showed 0/0 bar silently — now warns
- `settings.js` coercion applied `Number()` to string fields — fixed with explicit string branch
- `resetAllSettings` mutated config during iteration — collect keys first
- `image.js`/`video.js` width/height from commander are strings — wrapped in `parseInt()`
- `text.js` vision content was `JSON.stringify`-ed — API requires actual array
- `keys.js` `fmtExpiry` relied on `expiresIn` (not in list response) — recalculated from `expiresAt`
- `profile.js` showed negative reset time — guarded with "resetting now"
- `upload.js` spinner started before file validation — moved validation first
- `quota-manager.js` was corrupted (settings content appended) — restored
- `transcribe.js` missing `options.key` in `getApi()` — fixed
- `resilientCall` infinite fallback loop on repeated 402 — `usedFallback` flag added
- Balance bar used invented tier grant amounts — corrected to real values
- `quickLint` RegExp not escaped — names with `$`/`.` threw — escaped with `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
- `runChanges` `fs.pathExists` checked after write — always returned true — moved before tool call
- `_loadDotEnv` didn't handle `export VAR=val` syntax — added strip
- Dead `used` Set in `quickLint` — removed along with `usageCode` loop that fed it
- **O1** Analyser ran before greeting check — orphaned system messages in history — greeting check now first
- **O2** Analyser context pushed before user message — wrong history order — user message pushed first
- **O3** Auto-Architect double-triggered if Coder also called `consult_architect` — `architectCalled` flag
- **O5** Executor failure burned Coder's iteration budget — `iteration--` on retry
- **O6** Compression swallowed Executor failure before Coder read it — compression guarded
- **O7** `'complete'` in both COMPLEX_KEYWORDS and COMPLETION_PATTERNS — removed from keywords
- **T5** `shell_exec` silently dropped exit code when output was present — always appended on failure
- **A1** Vision fallback permanently mutated `this.model` — fallback is now call-local via `modelOverride`
- **A2** Parallel analyser stdout interleaved — removed per-file logging, single summary line after settle
- **A3** `extractPaths` used `match[0]` fallback which included leading commas — `match[1]` only
- **I1** `_partialReindex` raced with `index()` — both writing `this.summary` concurrently — bails if `_indexing`

---


- **`pollinations audio`** — Removed `--instrumental` flag. Model choice alone determines TTS vs music. No API flag distinguishes them. Defaults to `defaults.audio.model` setting (factory: `elevenlabs`) with a hint to set a permanent default via settings.

- **`pollinations image`** — Default model corrected from `flux` to `zimage` per the official model list. Added `--image` flag for image-to-image. Added `--upload` flag.

- **`pollinations video`** — Endpoint corrected from `/image/{prompt}` to `/video/{prompt}` per the official API spec. Added `--image` flag for animate-from-image. Added `--upload` flag.

- **`pollinations text`** — Added `--image` for vision tasks. Vision content is now sent as an array (`[{type: 'image_url', ...}, {type: 'text', ...}]`) — not JSON-stringified.

- **`pollinations profile`** — Rebuilt to use the real `/account/balance` response (`tierBalance`, `cryptoBalance`, `packBalance`). Tier grant bar is now scaled to the correct hourly maxes (microbe: 0, spore: 0.01, seed: 0.15, flower: 0.4, nectar: 0.8). Unknown tier warns instead of silently showing 0. Deduction order noted (`tier → crypto → pack`). Reset time sourced from API's `nextResetAt` — guards against negative minutes (shows "resetting now").

- **`pollinations quota`** — Description and behaviour clarified: this is a local call cap the user sets themselves, not a Pollen tracker.

- **All generation commands** — Now read defaults from the settings system. Pass `type` to `resilientCall` for correct global fallback. Run `quota.check()` before execution and `quota.increment()` on success.

- **`src/lib/api.js`** — `getApi()` now accepts an optional `keyOverride` parameter used by every command that supports `--key`.

- **`AGENTS.md` template** — Updated to include `indexer`, `analyser`, and `executor` role definitions with inline descriptions of what each agent does. `context` field now includes the project directory.

- **`DEFAULT_CONFIG` in `assist.js`** — Updated to include `indexer: 'mistral'`, `analyser: 'llama-scout'`, `executor: 'openai'` in the roles object.

- **Orchestrator** — Integrates Indexer (startup + watch), Analyser (every message), Executor (completion + confirmation). `cleanup()` method stops the file watcher and kills any Executor-spawned process on exit. System prompt now includes the Indexer context block.

- **All command and option descriptions** — Rewritten as full sentences explaining defaults, related settings, and cross-command piping patterns.

### Fixed

- **Video endpoint was `/image/{prompt}`** — Corrected to `/video/{prompt}` per the official API spec.
- **Image default model was `flux`** — Corrected to `zimage` per the official model list.
- **STT default was `whisper-large-v3`** — Model ID doesn't exist. Corrected to `whisper`.
- **STT model `whisper-1` doesn't exist** — Removed from all references.
- **Free fallback map had invented model IDs** — `flux-schnell`, `openai-tts`, `claude-sonnet`, etc. don't exist. Entire map rebuilt from the official TypeScript model list.
- **`gemini-fast` listed as search-capable** — `hasSearch` is false for this model. Removed from search model list.
- **`remove-bg.js` resilientCall ignored the `m` param** — The apiFn was closing over `options.model` instead of using the model passed by resilientCall, so fallback model substitution never actually worked.
- **`qr.js` had unused `getSetting` and `formatError` imports** — Removed.
- **`remove-bg.js` had unused `axios` import** — Removed.
- **`diagram.js` SVG fallback used `str.replace('.svg', '.mmd')`** — Breaks on paths with dots elsewhere. Fixed with `path.extname`.
- **`profile.js` unknown tier silently showed 0/0 balance bar** — Now shows a warning message instead.
- **`settings.js` coercion applied `Number()` to string fields** — `safety.mode` and similar string settings would fail to save. Fixed with an explicit `else { coerced = String(value) }` branch.
- **`resetAllSettings` mutated config during iteration** — Fixed by collecting matching keys into an array first.
- **`image.js`/`video.js` width/height/duration were strings from commander** — Wrapped in `parseInt()`.
- **`text.js` vision content was `JSON.stringify`-ed** — The API requires the actual array, not a JSON string.
- **`keys.js` `fmtExpiry` relied on `expiresIn`** — This field is not returned by the list endpoint. Rewritten to calculate days remaining from `expiresAt` vs `Date.now()`.
- **`profile.js` showed negative reset time if `nextResetAt` had just passed** — Guarded with "resetting now".
- **`upload.js` spinner started before file validation** — Moved validation (path exists, extension supported) before `ora` starts.
- **`quota-manager.js` had `settings.js` content appended to it** — File was corrupted. Restored as a clean standalone.
- **`transcribe.js` did not pass `options.key` to `getApi()`** — Fixed.
- **`resilientCall` could loop infinitely if fallback model also returned 402** — Added `usedFallback` flag; fallback is attempted exactly once.
- **Balance bar tier grants were invented** — `microbe: 10`, `spore: 50`, etc. were not real values. Corrected to actual hourly grant amounts from the platform documentation.

---

## [1.3.1] - 2026-04-03

### Fixed

- **BYOP auth flow broken on all platforms** — Web pages used `fetch` with `mode: "no-cors"` which silently swallows `ECONNREFUSED`, so the browser always reported success even when the CLI never received the key. Switched to `mode: "cors"` with a 5-second timeout so real failures surface correctly.
- **Key in browser still failed** — CLI server parsed `req.url` using `req.headers.host` as the base, which is undefined on some systems, silently breaking the key handler. Fixed with a hardcoded `127.0.0.1:9999` base URL.
- **IPv4/IPv6 localhost mismatch** — Server bound to `::1` on some systems while the browser hit `127.0.0.1`, causing `ECONNREFUSED` despite the server running. Now binds explicitly to `127.0.0.1`.
- **Port conflict crashed with no useful message** — `EADDRINUSE` was unhandled, producing a raw Node exception. Now catches it and prints a clear message with the command to free the port.
- **`pollina_key` never saved after SSO login** — `/auth` sent the key to the CLI and called `login()` but never wrote to `localStorage`, causing an infinite SSO loop on subsequent logins. Key is now persisted immediately.
- **Key corrupted in transit** — API keys were interpolated into fetch URLs without `encodeURIComponent`. Tokens containing `+`, `=`, or `&` would arrive malformed.
- **Pollinations MCP never connected without `AGENTS.md`** — `DEFAULT_CONFIG.mcp_servers` was `[]`. The agent now ships with the Pollinations MCP server in the default config so `pollinations assist` works out of the box.
- **`AGENTS.md` YAML ignored on Windows** — CRLF line endings caused silent parse failures, falling back to defaults. Line endings are now normalised before parsing.
- **`permission denied` on all commands after install (including Termux)** — `npm install -g` did not reliably mark the binary as executable. Added a `prepare` script to `package.json` that `chmod 755`s the bin file automatically on install, fixing the issue on Linux, macOS, and Termux mobile environments.

### Changed

- **`src/commands/auth.js`** — BYOP server now has CORS headers on all responses, OPTIONS preflight handling, `EADDRINUSE` handler, explicit `127.0.0.1` bind, graceful SIGINT, and `open()` fallback that prints the URL if no browser is available.
- **`src/commands/assist.js`** — Default config includes Pollinations MCP, CRLF normalisation in `loadConfig()`, and config reloads immediately after a new `AGENTS.md` is created.
- **`package.json`** — Added `prepare` script for post-install bin permissions. Bumped version to `1.3.1`.

---

## [1.3.0] - 2026-03-18

### Added

- **Session persistence** (`pollinations session`, `pollinations continue <id>`) — Every `chat` and `assist` session can now be saved on exit and resumed later. Sessions are stored in `~/.pollinations/sessions.json` with sequential IDs, type, timestamp, and title. `pollinations session` shows a formatted table; `pollinations continue 3` restores session #3 exactly.
- **Chat session resume** — When continuing a saved chat, the last 10 messages are printed on screen so the conversation is immediately visible, and the full message history is kept in context for the model.
- **Assist session resume with directory restoration** — Pollina is summoned back into the exact working directory she was in when the session was saved, regardless of the user's current directory. If that directory was deleted, she falls back to the current directory with a warning.
- **Session update on re-exit** — Exiting a resumed session asks "Save this session?" and, if confirmed, updates the existing session record rather than creating a duplicate.
- **`edit_file` tool** — Surgical file editing without rewriting the whole file. Supports five operations: `insert_after`, `insert_before`, `delete_lines`, `replace_lines`, `replace_text`. Reduces token usage and Critic noise for small changes.
- **`test_syntax` tool (Ghost Runtime)** — Validates JS/JSON code via `node --check` in a temp file before `write_file` executes. Syntax errors block the write and feed directly back to the Coder.
- **`capture_asset` tool** — Downloads transient remote URLs (e.g. MCP image generation results) to local disk immediately, preventing asset loss.
- **Researcher role** — Embedded in the orchestrator loop (not a separate file). Uses the Pollinations API with a configurable grounded search model (`gemini-search` by default) to fetch current technical information. Findings are injected into the Critic's next validation prompt (Truth Injection protocol).
- **Configurable researcher model** — Set `researcher.model` in AGENTS.md to swap the search model. Uses your Pollinations API key automatically.
- **Context compression** — When the session history exceeds 26 messages, older entries are summarised into a compact state snapshot by the Architect model, keeping the 8 most recent messages verbatim. Prevents performance degradation in long sessions.
- **MCP environment variable injection** — The Pollinations API key (`POLLINATIONS_API_KEY`) is automatically forwarded to every MCP subprocess. Per-server `env:` blocks in AGENTS.md support `${VAR_NAME}` placeholders resolved from the host environment at runtime.
- **Multi-MCP support** — AGENTS.md now supports any number of MCP servers (Pollinations, GitHub, PostgreSQL, Slack, Filesystem, etc.) with commented-out examples in the generated template.

### Changed

- **Critic no longer fires on read-only tools** — `list_files`, `read_file`, `test_syntax`, `delete_file`, `move_file`, and `capture_asset` skip the Critic entirely. This eliminates false rejections where the Critic would demand source code from a directory listing.
- **Critic output on terminal** — Only the `REJECTED` marker and the specific reason are shown. Passing validation produces no terminal output. Full verdict text is still injected into the Coder's history.
- **Critic prompt hardened** — Now explicitly told: do not request more files, do not reject because output looks brief, validate only the specific action provided. Recent tool results are included as project context.
- **Greeting detection** — Short casual inputs (`hi`, `sup`, `thanks`, `ok`, `what can you do`, etc.) are detected by a regex pre-flight check and handled with a single lightweight API call, bypassing the full tool-enabled agent loop entirely.
- **System prompt restructured** — Added explicit "CONVERSATIONAL RULE" section at the top, "HANDLING FAILURES" section with actionable steps after Critic FAIL, tool error, or max iterations. Made the no-tools-on-greetings rule the first thing the model reads.
- **`write_file` vs `edit_file` guidance** — System prompt now explicitly steers the agent toward `edit_file` for targeted changes and `write_file` only for new files or complete rewrites.
- **`move_file` now included in tool definitions** — Was implemented but missing from `getToolDefinitions()` in previous versions.
- **AGENTS.md template updated** — Generated template now includes `researcher` block, updated MCP examples with `env:` credential syntax, and revised constraints.
- **`chat.js` session save** — Asking to save is now triggered reliably on `exit`. `rl.resume()` is called before `rl.question()` to fix a readline pause bug that silently dropped the Y/n answer.
- **`assist.js`** — Same readline fix. Added `busy` flag to prevent concurrent `orchestrator.run()` calls from fast typing. Added `exiting` guard to block new input while the save dialog is open.
- **`bin/pollinations.js`** — Updated version to `1.3.0`. Added `session` and `continue <id>` commands.
- **`parseAction` rewritten** — Now scans all JSON candidates in a response in order, skipping non-tool objects, instead of only trying the first `{"` match. Handles `{ "tool":` (space after brace) format from some models.

### Fixed

- `rl.pause()` before `rl.question()` in exit handler caused save dialog input to be silently dropped. Fixed by calling `rl.resume()` first.
- Fast typing during async agent processing could spawn multiple parallel `orchestrator.run()` calls. Fixed with a `busy` flag.
- `parseAction` would silently fail if the model wrote reasoning JSON (e.g. `{"plan": "..."}`) before the tool call JSON. Fixed by scanning all candidates.
- Path traversal via `../` sequences is blocked in `safePath()` with a proper root+separator check.
- Chat error handler now removes the user message from history on API failure, preventing the history from desynchronising.

---

## [1.2.4] - 2026-03-12

### Added
- **Repository Metadata**: Added the official GitHub repository link to `package.json` to enable the repository sidebar and links on the npm registry.

---

## [1.2.3] - 2026-03-12

### Added
- **BYOP Auto-Login Bridge** (`/auth/cli`): When selecting BYOP login, the CLI now opens a bridge page on the web app first. If the user is already logged in on `pollinations-cli-web.vercel.app`, their Pollen key is grabbed from the browser and injected into the local CLI listener (port 9999) instantly — no SSO redirect or sign-in flow required. The browser tab closes itself automatically on success.
- If no session is found in the browser, the bridge silently forwards to the Pollinations SSO (`enter.pollinations.ai/authorize`) as before.

### Changed
- **`src/commands/auth.js`**: BYOP flow now opens `https://pollinations-cli-web.vercel.app/auth/cli` instead of the authorize URL directly. The port 9999 listener and key saving logic are unchanged.
- Terminal output for BYOP now clarifies both paths (already logged in vs. complete sign-in in browser).

---

## [1.2.2] - 2026-03-07
### Added
- **BYOP (Bring Your Own Pollen)**: Integrated a new authentication flow allowing users to log in via `enter.pollinations.ai` to use their own pollen.
- **Hybrid Login**: Added a branching UI to the `login` command, offering a choice between secure Web Auth (BYOP) and manual API key entry.
- **Enhanced Browser Integration**: Added `open` dependency to automatically launch the Pollinations authorization dashboard from the terminal.
- **File System Tooling**: Added `move_file` capability to the autonomous agent (Pollina), allowing for advanced project reorganization and file renaming with automatic directory creation.

### Changed
- **Modular Architecture**: Refactored the authentication logic out of the main executable into `src/commands/auth.js` for better maintainability.
- **UI Refresh**: Updated the login sequence with themed gradients and a streamlined "Tips for the Garden" interface.

---

## [1.2.1] - 2026-03-05
### Fixed
- **Image Path Context**: Fixed a bug where generated images were being dropped in the CLI root instead of the project subfolders.
- **Critic "Blindness"**: Updated `validateAction` to pass tool arguments directly to the Critic.
- **Agent Behavior**: Added "Conversation Mode" to the system prompt to prevent Pollina from triggering tools during simple greetings.
- **Terminal Noise Reduction**: Silenced internal Architect and Critic reasoning from the main terminal output.
- **Improved JSON Extraction**: Enhanced the bracket-counting logic to handle both Object and Array JSON payloads.

---

## [1.2.0] - 2026-03-05
### Added
- **Swarm Agent Orchestrator**: Added `pollinations assist` to launch Pollina, an autonomous agent capable of using local and remote tools.
- **AGENTS.md Support**: Implemented local project configuration via YAML-in-Markdown.
- **Model Context Protocol (MCP)**: Integrated MCP for external tool support.
- **Multi-Agent Logic**: Added internal roles for Architect, Coder, Critic, and Artist.
- **Auto-Initialization**: CLI detects missing configurations and offers to generate a standard AGENTS.md template.

---

## [1.1.1] - 2026-03-03
### Fixed
- **Chat API Authorization**: Fixed a bug where `chat` bypassed the global API configuration.
- **Response Parsing**: Fixed chat response handling to correctly parse the OpenAI-compatible data structure.

---

## [1.1.0] - 2026-03-03
### Added
- **Interactive Chat Mode**: Added `pollinations chat` for persistent AI conversations with session memory and system prompt support.
- **Batch Gallery**: Added `pollinations gallery` to view a tabular history of all batch image generations.
- **Data Persistence**: Implemented `~/.pollinations_history.json` to store gallery metadata.
- **Enhanced UI**: Integrated `cli-table3` and improved status reporting.

### Changed
- **Batch Logic**: Updated `batch` command to automatically log successful generations.
- **Filename Pattern**: Batch outputs now include timestamps to prevent overwriting.

---

## [1.0.0] - 2026-03-01
### Added
- **Core CLI Architecture**: Established command routing via `bin/` and logic separation in `src/`.
- **Multimedia Support**: `text`, `image`, `audio`, `video` generation commands.
- **Account Management**: `login`, `config`, `profile` commands with local API key storage.
- **Power User Tools**: `batch`, `history`, `replay`, `template` commands.
- **Global installation** support via `@bluegaminggm/pollinations-cli`.
- **Piping support** for log summarization and text processing.

### Security
- Implemented local safe storage for API keys in the home directory.

