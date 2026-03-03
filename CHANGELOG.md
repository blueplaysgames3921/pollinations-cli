# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

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
