# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

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

