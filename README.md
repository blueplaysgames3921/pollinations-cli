# Pollinations CLI

A high-performance command line interface for Pollinations.ai. This tool provides a unified bridge to text, image, audio, and video models via the gen.pollinations.ai infrastructure.

## Installation

### Option 1: Global (After NPM Publish)
If the package is published to npm, install it globally:
```bash
npm install -g pollinations-cli
```
### Option 2: Local Development (Unpublished)
To run the project from source (e.g., in Termux or a cloned repo):
```bash
git clone https://github.com/blueplaysgames3921/pollinations-cli.git
cd pollinations-cli
npm install
npm link --force
```
## Configuration
Set your API key to enable high-rate limits and account features. Keys are stored locally in ~/.pollinations/config.json.
```bash
pollinations login <your_api_key>
```
**Verify your current settings and storage path:**
```bash
pollinations config
```
## Core Commands
### Text Generation
Uses the OpenAI-compatible /v1/chat/completions endpoint.
 * Standard: `pollinations text "Explain quantum entanglement"`
 * Stream: `pollinations text "Write a technical brief" --stream`
 * Model Selection: `pollinations text "Code a landing page" --model qwen-coder`
 * File Input: `pollinations text -f context.txt`
 * Piping: `cat logs.txt | pollinations text "Summarize these errors"`
### Image Generation
Uses the /image/{prompt} endpoint with direct buffer streaming.
 * Basic: `pollinations image "High-contrast architectural photography"`
 * Advanced: `pollinations image "Logo design" --model flux --width 1024 --height 1024 --output result.png`
### Audio & Video
* Speech: `pollinations audio "Hello, how are you today?" --output hello.mp3`
* Video: `pollinations video "A futuristic space station orbiting Saturn"`
### Account and Models
 * Profile: `pollinations profile` (Displays Pollen balance, Tier, and Key permissions)
 * Model List: `pollinations models`
 * Filtered List: `pollinations models --type image`
## Power Features
### Batch Processing
Run multiple image prompts from a newline-delimited text file.
`pollinations batch prompts.txt --parallel 5 --output-dir ./outputs`
### History and Replay
The CLI maintains an append-only log of the last 50 operations in ~/.pollinations/history.jsonl.
 * View History:`pollinations history`
 * Rerun Command: `pollinations replay <id>`
### Templates
Save reusable prompt structures with variable placeholders.
 * Save: `pollinations template save review "Analyze this {language} code for security: {code}"`
 * Run: `pollinations template run review --language javascript`
### Project Structure
 * bin/: Entry point and command routing.
 * src/commands/: Individual logic for API interactions.
 * src/lib/: Configuration management and API client setup.
 * ~/.pollinations/: Local data persistence for history and keys.
<!-- end list -->

