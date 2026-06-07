# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

## [1.4.2] - 2026-06-07

### Fixed

- **Critical CLI Launch Crash** — Fixed an unclosed string template literal (`const DEFAULT_SEARCH_MODEL = 'perplexity-fast;`) in `src/commands/search.js` that caused a `SyntaxError: Invalid or unexpected token` and completely blocked the CLI from executing any commands.

---

## [1.4.1] - 2026-05-12

### Added

- **`pollinations template list`** — table view of all saved templates with name, variables, description, and content preview.
- **`pollinations template show <name>`** — prints the full content of a saved template and its variables.
- **`pollinations template delete <name>`** — removes a saved template with confirmation prompt.
- **`src/utils/format.js`** — new shared utilities module (`truncate`, `fmtDate`, `fmtCost`) used by `usage.js`, `history.js`, and `sessions.js`.

### Changed

- **Templates** — variable syntax corrected from `{{var}}` to `{var}`. Missing variables are now prompted interactively at run time instead of requiring all flags upfront. `template save` supports `--description` and `--force`. `template run` now uses a dedicated variable namespace to avoid colliding with reserved CLI flag names (`model`, `stream`, `key`).
- **Sessions** — `pollinations session` display rewritten: newest-first, 6-column table (ID, type, title, directory/model, save time, context dump summary). Uses `os.homedir()` instead of `process.env.HOME` (cross-platform). Schema guard prevents crash on malformed `sessions.json`. Title immutability uses strict non-empty check so empty string can't bypass it.
- **Session save** — on exit, model summarises the session in ≤8 bullet points (context dump) and auto-generates a title from the first message + directory + type. Both are shown in `pollinations session` and on resume. Base64 image data stripped before sending to avoid megabyte payloads. Array-type message content (vision messages) normalised to text for title generation.
- **`pollinations continue <id>`** — shows full context dump before resuming so you know exactly where you left off.
- **`batch.js`** — now reads default model from `defaults.image.model` setting instead of hardcoded `flux`. Checks quota before each image. Imports `getSetting` from settings system.
- **`models.js`** — type detection now uses `m.type` field from the API response instead of substring-matching model IDs. Models like `whisper`, `scribe`, `elevenlabs`, `veo`, `ltx-2` now show the correct type.
- **`history.js`** — image model fallback corrected from `flux` to `zimage`.
- **`audio.js`, `video.js`, `search.js`** — added `logHistory` calls so these commands now appear in `pollinations history`.
- **`upload.js`** — added `quota.check()` so uploads count against the local hourly cap.
- **`settings.js` SETTINGS_GROUPS** — `agent.indexer.model`, `agent.analyser.model`, `agent.executor.model` added to the Agent Roles group so they appear in `pollinations settings list`.
- **`assist.js`, `chat.js`** — removed dead `makeTitle` import (replaced by `generateTitle` in v1.4.0 but import was never cleaned up).
- **`auth.js`, `mcp-manager.js`** — hardcoded version string `v1.3.1` updated to `v1.4.1`.
- **Orchestrator system prompt** — fully restored to original instruction density. Sections stripped during v1.4.0 rewrite recovered: CONVERSATIONAL RULE with concrete greeting/task examples, all WRONG tool call format examples (code fence, shorthand, double-object), full FILE EDITING STRATEGY with all `edit_file` operations listed, QUALITY PROTOCOL steps 5–8 (verify after write, capture_asset after MCP image, SUCCESS only when confirmed), HANDLING FAILURES section for Critic FAIL / tool ERROR / max iterations.

### Fixed

- **`assist.js` syntax error** — `buildDefaultAgentsMd` template literal was duplicated, producing a stray string literal that Node rejected. Removed duplicate.
- **Duplicate utility functions** — `truncate()` defined in 3 files, `fmtDate()` in 2 files, `fmtCost()` in 2 files. All consolidated into `src/utils/format.js`.
- **`batch.js` ignored settings** — hardcoded `model: 'flux'` and no quota check.
- **`models.js` type detection** — ID substring matching (`includes('audio')`) misclassified most audio and video models as text/image.
- **Template path traversal** — template names were used directly in `path.join` with no validation. A name like `../../../etc/passwd` resolved outside `TEMPLATE_DIR`. `validateName()` now enforces `/^[\w-]+$/`.
- **Template stale `vars` array** — saved `vars: []` (falsy for length) meant new vars added by editing the template content were never detected. Changed to `vars?.length` check.
- **Template reserved var names** — vars named `model`, `stream`, or `key` silently picked up the flag value instead of being prompted. Now warned on save and always prompted interactively.
- **`generateTitle` crash on vision messages** — first user message content could be an array. `.slice(0, 200)` on an array returns an array; template interpolation gave `[object Object]`. Normalised to text.
- **`generateContextDump` megabyte payloads** — messages with base64 image data bloated the JSON to megabytes. Stripped to `[image omitted]` before sending.
- **Session title empty-string bypass** — `existing.title || data.title` allowed an empty title to be overwritten. Changed to `!= null && !== ''` strict check.
- **`sessions.json` schema crash** — valid JSON with wrong schema (e.g. plain array from an old version) caused `.push()` on undefined to throw. Added schema guard on `load()`.
- **`fmtDir` Windows incompatibility** — `process.env.HOME` is undefined on Windows. Replaced with `os.homedir()`.
- **Executor infinite retry loop** — `iteration--` refunded Coder budget on Executor failure but with no cap, a persistently broken environment looped forever. Added `executorRetries` counter capped at 3.
- **All relative imports verified** — `node --check` run across all 28 JS files. All relative import paths verified to resolve to real files. All named imports verified to match actual exports.

---

## [1.4.0] - 2026-05-11

### Added

#### New CLI Commands

- **`pollinations transcribe <file>`** — Speech-to-text from any local audio file (mp3, mp4, wav, webm, ogg, flac, m4a). Defaults to `whisper`. Validates model against known STT list and prompts to switch, proceed, or cancel if unrecognised. Supports `--language`, `--output`, `--key`.

- **`pollinations upload <file>`** — Upload local files to `media.pollinations.ai`. Content-addressed, 14-day TTL. Validates before spinner starts. `--copy` sends URL to clipboard. URL pipes into `--image` on other commands.

- **`pollinations search <query>`** — Web search via `gemini-search` by default. `--raw` for minimal output. Only models with verified `hasSearch: true` are listed.

- **`pollinations qr <text>`** — Local QR code generation via `qrcode` npm package. Zero API calls, zero Pollen. PNG/SVG/TXT output. `--print` shows ASCII in terminal.

- **`pollinations remove-bg <file>`** — Uploads image then processes through `p-image-edit`. Outputs transparent PNG.

- **`pollinations diagram <description>`** — AI-generated Mermaid diagrams. 10 types. Saves as `.mmd`, `.md`, or `.svg`. Path-safe extension replacement.

- **`pollinations keys list|create|revoke`** — Full API key management requiring `account:keys` permission. Interactive wizard or non-interactive flags. Key shown once on creation. Revoke handles 400/404/403 specifically. Expiry calculated from `expiresAt` directly, not the unreliable `expiresIn`.

- **`pollinations usage`** — Per-request log with model, type, billing source, cost, response time. Requires `account:usage`.

- **`pollinations usage-daily`** — Daily spend bar chart. `--breakdown` adds top-15 model cost table.

- **`pollinations settings list|get|set|reset|wizard|export|import`** — Full settings system persisted in `~/.pollinations/`. Covers all defaults, agent role models, upload behaviour, display preferences.

- **`pollinations quota [limit]`** — Local hourly call cap, independent of Pollen balance.

- **`pollinations template list|save|run|show|delete`** — Rewritten template system with `{variable}` substitution (not `{{}}`). Missing variables prompted interactively. `list` shows table with variables/description/preview. `show` prints full content. `delete` confirms before removing. Path traversal protection on template names. Reserved CLI flag names (`model`, `stream`, `key`) warned on save and excluded from flag-based resolution. Stale empty `vars` array falls back to live extraction from content.

#### New Agent Capabilities

- **Indexer agent** (`src/lib/agent/indexer.js`) — Runs on startup, reads manifests and entry points, produces structured project summary injected into Coder's system prompt. Uses `chokidar` for file-change watching. Diff-aware partial re-index: only changed files re-read, existing summary patched. Bails if a full index is already running to prevent race conditions.

- **Analyser agent** (`src/lib/agent/analyser.js`) — Intercepts file paths in user messages. Processes files in parallel via `Promise.allSettled` (one failure doesn't abort the rest). Images downscaled to 512px first; retries at full resolution if model responds `NEEDS_FULL_RESOLUTION`. Vision fallback to `openai-fast` on 400/422 is call-local — never mutates instance state. Single summary line emitted after all files settle (avoids stdout interleaving). `match[1]` used exclusively in path extraction (avoids leading comma in match[0]).

- **Executor agent** (`src/lib/agent/executor.js`) — Triggered on Coder completion signal + user confirmation. Detects 16 project types. Installs deps, lints, tests, runs/previews. Web servers: finds free port, starts in background, prints clickable terminal hyperlink. Bots: watches stdout for connection confirmation. APKs: gradle build, reports APK path.

- **Auto-Architect trigger** — Complex tasks (2+ keywords or 25+ words) invoke Architect before Coder. `architectCalled` flag prevents double-trigger. `'complete'` removed from keyword list to avoid collision with completion detection.

- **Decisions-only context compression** — Compressor extracts only files changed, commands run, errors resolved, decisions made. Reasoning discarded. Compression skipped when last system message is an Executor failure.

- **`.env` parsing** — Read on startup, injected into every `shell_exec`. Supports `export VAR=val` syntax. Key names (not values) logged to confirm loading.

- **Post-run file summary** — After each agent run: `Created: app.js · Edited: config.js · Deleted: old.js`. File existence checked before tool call (not after) so created vs edited is always correct.

- **Destructive command warnings** — `rm -rf`, `mkfs`, `wipefs` etc. prompt user before execution.

- **Executor retry cap** — Executor failures refund Coder iteration budget (`iteration--`) but are independently capped at 3 retries. Prevents infinite loop when build environment is broken.

#### Session improvements

- **AI-generated session titles** — On save, `openai-fast` names the session from the first user message + directory + type (e.g. "Discord bot rate limiter"). Title is immutable after first set — strict non-empty check prevents empty-string bypass.

- **Context dump on save** — Model summarises the session in ≤8 bullet points: goal, files changed, decisions, current state. Base64 image data stripped from messages before sending to avoid megabyte payloads.

- **`pollinations session` display** — Clean table, newest-first, 6 columns: ID, type, title, directory/model, save time, first line of context dump. Uses `os.homedir()` not `process.env.HOME` (cross-platform). Schema guard prevents crash on malformed sessions.json.

- **Context dump shown on resume** — `pollinations continue <id>` shows the full context dump before the session starts so you know exactly where you left off.

#### Infrastructure

- **API resilience layer** (`src/lib/api-resilience.js`) — 3-attempt retry, exponential backoff. Per-model fallback map (real model IDs only) then global type default on 402. `audio` and `audio-stt` split as separate type keys. One fallback max.

- **Settings system** (`src/lib/settings.js`) — Central defaults with type coercion. Covers all command defaults and agent role models.

- **Quota manager** (`src/lib/quota-manager.js`) — Local call counter + `fetchBalance()` returning real three-bucket Pollen balance.

- **Ghost runtime lint pass** — `quickLint` runs on `write_file` and `test_syntax`. Checks unused variables/imports (RegExp-escaped names, so `$`/`.` don't throw), unreachable code. Dead `used` Set and `usageCode` loop removed.

- **Export change detection** — `write_file` and `edit_file` snapshot exports before/after. Warns if any named exports are removed.

- **`shell_exec` exit code always shown on failure** — Non-zero exit codes appended even when stdout is present.

- **`--image <url>`** on `text`, `image`, `video` — Vision messages, img2img, animate-from-image. Content sent as array (never JSON-stringified).

- **`--upload`** on `image`, `video` — Post-generation upload hook controlled by settings.

- **`--key <key>`** on all commands — Per-request API key override.

- **System prompt restored** — `buildSystemPrompt` fully restored: CONVERSATIONAL RULE with concrete examples, all WRONG tool call format examples, full FILE EDITING STRATEGY with all edit_file operations, QUALITY PROTOCOL steps 5-8, HANDLING FAILURES section for Critic FAIL / tool ERROR / max iterations.

- **`chokidar`, `qrcode`, `form-data`** added to dependencies. `sharp` and `clipboardy` moved to `optionalDependencies`.

### Changed

- **`pollinations audio`** — `--instrumental` removed. Model choice determines TTS vs music. Defaults to `defaults.audio.model`.
- **`pollinations image`** — Default corrected to `zimage`. Added `--image`, `--upload`.
- **`pollinations video`** — Endpoint corrected to `/video/{prompt}`. Added `--image`, `--upload`.
- **`pollinations text`** — Added `--image` for vision. Content sent as array not JSON string.
- **`pollinations profile`** — Three-bucket balance from `/account/balance`. Tier bar with real grant amounts. Unknown tier warns. Reset time from `nextResetAt`.
- **`pollinations quota`** — Clarified as local call cap, not Pollen tracker.
- **All generation commands** — Read from settings, pass `type` to resilientCall, quota check/increment.
- **`AGENTS.md` template** — Includes `indexer`, `analyser`, `executor` roles with descriptions.
- **Orchestrator** — Integrates all three new agents. `cleanup()` stops watcher and kills Executor process. Greeting check before analyser (prevents orphaned system messages). User message pushed before analyser context (correct history order). Auto-Architect fires once (architectCalled flag). Compression skips on fresh Executor failure.

### Fixed

- Video endpoint was `/image/{prompt}` → `/video/{prompt}`
- Image default `flux` → `zimage`
- STT default `whisper-large-v3` (nonexistent) → `whisper`
- Free fallback map had invented model IDs → rebuilt from official list
- `gemini-fast` listed as search-capable → removed
- `remove-bg.js` resilientCall ignored `m` param → fixed
- `qr.js` / `remove-bg.js` unused imports → removed
- `diagram.js` SVG fallback `str.replace('.svg')` → `path.extname` based
- `profile.js` unknown tier showed silent 0/0 bar → warns
- `settings.js` coercion applied `Number()` to string fields → fixed
- `resetAllSettings` mutated config during iteration → collect first
- `image.js`/`video.js` width/height strings from commander → `parseInt()`
- `text.js` vision content `JSON.stringify`-ed → array sent directly
- `keys.js` `fmtExpiry` used `expiresIn` (not in list response) → `expiresAt`
- `profile.js` negative reset time → "resetting now" guard
- `upload.js` spinner before validation → validation moved first
- `quota-manager.js` corrupted (settings content appended) → restored
- `transcribe.js` missing `options.key` → fixed
- `resilientCall` infinite fallback loop on 402 → `usedFallback` flag
- Balance bar used invented tier grants → real values
- `quickLint` RegExp unescaped → `$`/`.` in names threw
- `runChanges` `fs.pathExists` after write → always "edited" → moved before
- `_loadDotEnv` ignored `export VAR=val` → strip prefix added
- Dead `used` Set + `usageCode` loop in quickLint → removed
- **O1** Analyser before greeting check → orphaned system messages → greeting first
- **O2** Analyser context before user message → wrong history order → user first
- **O3** Auto-Architect double-triggered → `architectCalled` flag
- **O5** Executor failure burned iteration budget → `iteration--`
- **O6** Compression swallowed Executor failure → guarded
- **O7** `'complete'` in both keyword and completion lists → removed from keywords
- **T5** `shell_exec` dropped exit code when output present → always appended
- **A1** Vision fallback mutated `this.model` permanently → call-local `modelOverride`
- **A2** Parallel analyser stdout interleaved → single summary line
- **A3** `extractPaths` used `match[0]` with leading commas → `match[1]` only
- **I1** `_partialReindex` raced with `index()` → bails if `_indexing`
- **T2** Template vars collide with reserved flag names → warned + excluded
- **T4** Template names unsanitised → path traversal → `validateName` regex guard
- **T5** Stale empty `vars` array ignored new vars in content → `vars?.length` check
- **S1** `generateTitle` crashed on array content (vision messages) → normalised
- **S2** `generateContextDump` sent base64 image data → stripped before API call
- **S3** Empty string title was falsy → allowed immutability bypass → strict check
- **S4** Malformed sessions.json schema caused crashes → schema guard on load
- **SC1** `fmtDir` used `process.env.HOME` → undefined on Windows → `os.homedir()`
- **O2b** Executor infinite retry loop → `executorRetries` counter capped at 3
- System prompt stripped to third of original → fully restored with all sections

---


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


