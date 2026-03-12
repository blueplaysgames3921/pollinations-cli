# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

## [1.2.3] - 2026-03-12

### Added
- **BYOP Auto-Login Bridge** (`/auth/cli`): When selecting BYOP login, the CLI now opens a bridge page on the web app first. If the user is already logged in on `pollinations-cli-web.vercel.app`, their Pollen key is grabbed from the browser and injected into the local CLI listener (port 9999) instantly — no SSO redirect or sign-in flow required. The browser tab closes itself automatically on success.
- If no session is found in the browser, the bridge silently forwards to the Pollinations SSO (`enter.pollinations.ai/authorize`) as before.

### Changed
- **`src/commands/auth.js`**: BYOP flow now opens `https://pollinations-cli-web.vercel.app/auth/cli` instead of the authorize URL directly. The port 9999 listener and key saving logic are unchanged.
- **Navbar (web)**: "Enter Hive" and mobile "Login" buttons now correctly point to `enter.pollinations.ai/authorize` with the proper `app_key` and `redirect_url` params for BYOP SSO registration.
- Terminal output for BYOP now clarifies both paths ("already logged in" vs "complete sign-in in browser").

---

## [1.2.2] - 2026-03-07
### Added
- **BYOP (Bring Your Own Pollen)**: Integrated a new authentication flow allowing users to log in via `enter.pollinations.ai` to use their own pollen.
- **Hybrid Login**: Added a branching UI to the `login` command, offering a choice between secure Web Auth (BYOP) and manual API key entry.
- **Enhanced Browser Integration**: Added `open` dependency to automatically launch the Pollinations authorization dashboard from the terminal.
- **File System Tooling**: Added `move_file` capability to the autonomous agent (**Pollina**), allowing for advanced project reorganization and file renaming with automatic directory creation.

### Changed
- **Modular Architecture**: Refactored the authentication logic out of the main executable into `src/commands/auth.js` for better maintainability.
- **UI Refresh**: Updated the login sequence with themed gradients and a streamlined "Tips for the Garden" interface.

---

## [1.2.1] - 2026-03-05
### Fixed
- **Image Path Context**: Fixed a bug where generated images were being dropped in the CLI root instead of the project subfolders. The `generate_image` tool now forces absolute path resolution relative to the current working directory.
- **Critic "Blindness"**: Updated `validateAction` to pass tool arguments directly to the **Critic**. This allows the agent to verify file contents and code logic before the file is even written.
- **Agent Behavior**: Added "Conversation Mode" to the system prompt to prevent Pollina from triggered tools during simple greetings (e.g., "Hi").
- **Terminal Noise Reduction**: Silenced internal Architect and Critic reasoning from the main terminal output. Only Pollina's direct speech and tool status updates are now visible for a cleaner UI.
- **Improved JSON Extraction**: Enhanced the bracket-counting logic to handle both Object `{}` and Array `[]` JSON payloads more reliably, preventing crashes on complex tool calls.

---

## [1.2.0] - 2026-03-05
### Added
- **Swarm Agent Orchestrator**: Added `pollinations assist` to launch **Pollina**, an autonomous agent capable of using local and remote tools.
- **AGENTS.md Support**: Implemented local project configuration via YAML-in-Markdown. Features recursive directory lookup (stopping at home) to automatically load project-specific constraints and context.
- **Model Context Protocol (MCP)**: Integrated MCP for external tool support, allowing Pollina to connect to specialized servers (e.g., Google Search).
- **Multi-Agent Logic**: Added internal roles for **Architect** (planning), **Coder** (execution), **Critic** (validation) and **Artist** (asset generation).
- **Auto-Initialization**: CLI now detects missing configurations in non-home directories and offers to generate a standard `AGENTS.md` template.

### Fixed
- **Terminal UI**: Fixed JSON payload "leakage" in the terminal using a bulletproof bracket-counting extractor for cleaner agent reasoning displays.
- **Environment Awareness**: Improved path resolution to ensure the agent respects absolute/relative paths in restricted environments like Termux.

---

## [1.1.1] - 2026-03-03
### Fixed
- **Chat API Authorization**: Fixed a bug where `chat` bypassed the global API configuration. It now correctly uses `getApi()` for authorized requests to `/v1/chat/completions`.
- **Response Parsing**: Fixed chat response handling to correctly parse the OpenAI-compatible data structure.

---

## [1.1.0] - 2026-03-03
### Added
- **Interactive Chat Mode**: Added `pollinations chat` for persistent AI conversations with session memory (context) and system prompt support.
- **Batch Gallery**: Added `pollinations gallery` to view a tabular history of all batch image generations, linking prompts to their generated filenames.
- **Data Persistence**: Implemented `~/.pollinations_history.json` to store gallery metadata independently from session logs.
- **Enhanced UI**: Integrated `cli-table3` for professional terminal data visualization and `chalk` for improved status reporting.

### Changed
- **Batch Logic**: Updated `batch` command to automatically log successful generations to the new Gallery database.
- **Filename Pattern**: Batch outputs now include timestamps to prevent overwriting files during repeated runs.

---

## [1.0.0] - 2026-03-01
### Added
- **Core CLI Architecture**: Established command routing via `bin/` and logic separation in `src/`.
- **Multimedia Support**: 
  - `text`: Support for chat completions with streaming and model selection.
  - `image`: Direct buffer streaming with custom width/height/model parameters.
  - `audio/video`: Standardized generation for multimedia endpoints.
- **Account Management**: 
  - `login` & `config`: Local API key storage in `~/.pollinations/config.json`.
  - `profile`: Check Pollen balance and tier permissions.
- **Power User Tools**:
  - `batch`: Parallel processing for mass image generation from text files.
  - `history/replay`: Append-only operation logging in `history.jsonl`.
  - `template`: Save and run reusable prompt structures with placeholders.
- **System Features**:
  - Global installation support via `@bluegaminggm/pollinations-cli`.
  - Piping support for log summarization and text processing.

### Security
- Implemented local encryption/safe storage for API keys in the home directory.
