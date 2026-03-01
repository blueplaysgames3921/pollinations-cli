# Changelog

All notable changes to the Pollinations CLI will be documented in this file.

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
