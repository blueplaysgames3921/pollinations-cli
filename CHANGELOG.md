# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

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
