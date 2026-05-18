#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { textAction }                                    from '../src/commands/text.js';
import { imageAction }                                   from '../src/commands/image.js';
import { audioAction }                                   from '../src/commands/audio.js';
import { videoAction }                                   from '../src/commands/video.js';
import { transcribeAction }                              from '../src/commands/transcribe.js';
import { uploadAction }                                  from '../src/commands/upload.js';
import { qrAction }                                       from '../src/commands/qr.js';
import { removeBgAction }                                 from '../src/commands/remove-bg.js';
import { diagramAction }                                  from '../src/commands/diagram.js';
import { searchAction }                                   from '../src/commands/search.js';
import { listModels }                                    from '../src/commands/models.js';
import { batchAction }                                   from '../src/commands/batch.js';
import { assistAction }                                  from '../src/commands/assist.js';
import { profileAction }                                 from '../src/commands/profile.js';
import { usageHistoryAction, usageDailyAction }          from '../src/commands/usage.js';
import { keysListAction, keysCreateAction, keysRevokeAction } from '../src/commands/keys.js';
import { galleryAction }                                 from '../src/utils/history.js';
import { chatAction }                                    from '../src/commands/chat.js';
import { authAction }                                    from '../src/commands/auth.js';
import { historyAction, replayAction }                   from '../src/commands/history.js';
import { templateSave, templateRun, templateList, templateDelete, templateShow } from '../src/commands/template.js';
import { sessionAction, continueAction }                 from '../src/commands/sessions.js';
import {
  settingsListAction, settingsGetAction, settingsSetAction,
  settingsResetAction, settingsWizardAction,
  settingsExportAction, settingsImportAction,
}                                                        from '../src/commands/settings.js';
import { config }                                        from '../src/lib/config-store.js';
import { quota }                                         from '../src/lib/quota-manager.js';

program.name('pollinations').version('1.4.0');

// ── Auth ──────────────────────────────────────────────────────────────────────

program.command('login')
  .description('Authenticate with Pollinations. Opens the Hive browser gateway or lets you paste an API key manually. Run this once before using any other commands.')
  .action(authAction);

// ── Generation ────────────────────────────────────────────────────────────────

program.command('text [prompt]')
  .description('Generate a text response from an AI model. Accepts a prompt as an argument, from a file with --file, or piped via stdin. Pass --image <url> to send a media URL for vision tasks (pipe from "pollinations upload").')
  .option('-f, --file <path>',   'Read the prompt from a text file instead of stdin or argument')
  .option('-m, --model <model>', 'Model to use. Overrides defaults.text.model setting. Run "pollinations models --type text" to see options.')
  .option('-s, --stream',        'Stream the response token-by-token. Overrides the text.stream setting.')
  .option('--image <url>',       'Attach a media URL for vision tasks. Use a URL from "pollinations upload" or any public image URL.')
  .option('-k, --key <key>',     'Override your registered API key for this request only')
  .action(textAction);

program.command('image <prompt>')
  .description('Generate an image from a text prompt and save it locally. After generation, optionally upload it to media.pollinations.ai with --upload. Use --image <url> for image-to-image tasks by passing a reference image URL.')
  .option('-o, --output <path>',   'Where to save the image (default: img_<timestamp>.png)')
  .option('-m, --model <model>',   'Image model to use. Overrides defaults.image.model setting.')
  .option('-w, --width <number>',  'Output width in pixels. Overrides defaults.image.width setting.')
  .option('-h, --height <number>', 'Output height in pixels. Overrides defaults.image.height setting.')
  .option('--seed <number>',       'Seed for reproducible output. Omit for a random result.')
  .option('--image <url>',         'Reference image URL for image-to-image generation. Accepts a media.pollinations.ai URL from "pollinations upload".')
  .option('--upload',              'Upload the generated image to media.pollinations.ai and print the URL.')
  .option('-k, --key <key>',       'Override your registered API key for this request only')
  .action(imageAction);

program.command('audio <prompt>')
  .description('Generate speech or music from a text prompt. Without --model, uses your defaults.audio.model setting (factory default: elevenlabs). To generate music, pass a music-capable model with --model.')
  .option('-o, --output <path>',  'Where to save the audio file (default: audio_<timestamp>.mp3)')
  .option('-m, --model <model>',  'Audio model to use. Overrides defaults.audio.model setting.')
  .option('--voice <id>',          'Voice ID for TTS models. Overrides defaults.audio.voice setting.')
  .option('--speed <number>',      'Playback speed multiplier, 0.25 to 4.0 (default: 1)')
  .option('--duration <number>',   'Maximum output duration in seconds (default: 30)')
  .option('-k, --key <key>',       'Override your registered API key for this request only')
  .action(audioAction);

program.command('transcribe <file>')
  .description('Transcribe a local audio file to text. Supports mp3, mp4, wav, webm, ogg, flac, m4a. Defaults to whisper-large-v3. If the model you choose is not an STT model, you will be prompted to switch, proceed, or cancel.')
  .option('-m, --model <model>',   'STT model to use (default: whisper). Options: whisper, universal-2, scribe, universal-3-pro.')
  .option('-l, --language <lang>', 'Language hint to improve accuracy (e.g. en, fr, es). Auto-detected if omitted.')
  .option('-o, --output <path>',   'Save the transcript to a file instead of printing to stdout')
  .option('-k, --key <key>',       'Override your registered API key for this request only')
  .action(transcribeAction);

program.command('video <prompt>')
  .description('Generate a video clip from a text prompt. Use --image <url> to animate a reference image. After generation, optionally upload it to media.pollinations.ai with --upload.')
  .option('-o, --output <path>',   'Where to save the video (default: video_<timestamp>.mp4)')
  .option('-m, --model <model>',   'Video model to use. Overrides defaults.video.model setting.')
  .option('-w, --width <number>',  'Output width in pixels. Overrides defaults.video.width setting.')
  .option('-h, --height <number>', 'Output height in pixels. Overrides defaults.video.height setting.')
  .option('--duration <number>',   'Clip duration in seconds. Overrides defaults.video.duration setting.')
  .option('--seed <number>',       'Seed for reproducible output. Omit for a random result.')
  .option('--image <url>',         'Animate a reference image. Pass a media.pollinations.ai URL from "pollinations upload".')
  .option('--upload',              'Upload the generated video to media.pollinations.ai and print the URL.')
  .option('-k, --key <key>',       'Override your registered API key for this request only')
  .action(videoAction);

// ── Upload ────────────────────────────────────────────────────────────────────

program.command('upload <file>')
  .description('Upload a local file to media.pollinations.ai and get back a permanent URL. Files are content-addressed and cached for 14 days (TTL resets on re-upload). The returned URL can be piped directly into --image on the text, image, and video commands.')
  .option('--copy',          'Copy the returned URL to your clipboard after upload')
  .option('-k, --key <key>', 'Override your registered API key for this request only')
  .action(uploadAction);

program.command('search <query>')
  .description('Search the web using a search-capable AI model and get a cited, formatted answer. Uses gemini-search by default which has native web access.')
  .option('-m, --model <model>', `Search-capable model to use (default: gemini-search). Options: gemini-search, perplexity-fast, perplexity-reasoning, gemini, gemini-large.`)
  .option('--raw',               'Return a minimal answer without extra formatting')
  .option('-k, --key <key>',     'Override your registered API key for this request only')
  .action(searchAction);

program.command('qr <text>')
  .description('Generate a QR code from any text or URL and save it locally. Runs entirely offline — no API call, no Pollen cost.')
  .option('-o, --output <path>',  'Output file path. Extension determines format: .png (default), .svg, or .txt')
  .option('-s, --size <pixels>',  'Width/height of the QR image in pixels (default: 300)')
  .option('--margin <number>',    'Quiet zone margin around the QR code (default: 2)')
  .option('--dark <hex>',         'Dark module colour as hex (default: #000000)')
  .option('--light <hex>',        'Light module colour as hex (default: #ffffff)')
  .option('--error <level>',      'Error correction level: L, M (default), Q, or H')
  .option('--print',              'Also print the QR code as ASCII in the terminal')
  .action(qrAction);

program.command('remove-bg <file>')
  .description('Remove the background from a local image. Uploads the image first to get a URL, then sends it to the background removal model. Output is a PNG with a transparent background.')
  .option('-o, --output <path>',  'Output file path (default: <filename>_nobg.png)')
  .option('-m, --model <model>',  'Image model to use for background removal (default: p-image-edit)')
  .option('-k, --key <key>',      'Override your registered API key for this request only')
  .action(removeBgAction);

program.command('diagram <description>')
  .description('Generate a Mermaid diagram from a plain English description using an AI model. Saves as a .mmd file by default which you can paste into mermaid.live, or use --format svg to render directly.')
  .option('-t, --type <type>',    `Diagram type (default: flowchart). Options: ${['flowchart','sequence','class','er','gantt','pie','mindmap','timeline','gitgraph','state'].join(', ')}`)
  .option('-f, --format <fmt>',   'Output format: mmd (default), svg, or md (Markdown with fenced code block)')
  .option('-o, --output <path>',  'Output file path')
  .option('-m, --model <model>',  'Text model to use for generation. Overrides defaults.text.model setting.')
  .option('--print',              'Print the generated Mermaid syntax to the terminal')
  .option('-k, --key <key>',      'Override your registered API key for this request only')
  .action(diagramAction);

// ── Agent ─────────────────────────────────────────────────────────────────────

program.command('assist')
  .alias('pollina')
  .description('Launch the Pollina autonomous swarm agent. Give it a task in plain English — it will plan, write code, run shell commands, search the web, and generate media on its own. Create an AGENTS.md in your project root to give it persistent context.')
  .action(() => assistAction());

// ── Chat ──────────────────────────────────────────────────────────────────────

program.command('chat')
  .description('Start an interactive multi-turn chat session. The conversation is saved automatically and can be resumed with "pollinations continue <id>".')
  .option('-m, --model <model>',   'Model to chat with. Overrides defaults.text.model setting.')
  .option('-s, --system <prompt>', 'System prompt that sets the AI behaviour for the whole session.')
  .action(opts => chatAction(opts));

// ── Models ────────────────────────────────────────────────────────────────────

program.command('models')
  .description('List all models available on Pollinations. Filter by type to find valid model IDs to pass to --model on other commands.')
  .option('-t, --type <type>', 'Filter by type: text, image, video, audio')
  .action(listModels);

// ── Batch ─────────────────────────────────────────────────────────────────────

program.command('batch <file>')
  .description('Generate multiple images in parallel from a file of prompts (one prompt per line). Results are saved to the output directory with sequentially numbered filenames.')
  .option('-o, --outputDir <dir>',   'Directory to save generated images (default: ./outputs)')
  .option('-p, --parallel <number>', 'Number of requests to run in parallel (default: 3). Increase with caution — too many parallel requests may hit rate limits.')
  .option('-k, --key <key>',         'Override your registered API key for this batch only')
  .action(batchAction);

// ── History & sessions ────────────────────────────────────────────────────────

program.command('history')
  .description('Show a log of your recent commands — text, image, audio, and video requests — with timestamps and the model used for each.')
  .action(historyAction);

program.command('replay <id>')
  .description('Re-run a command from your history by its ID (shown in "pollinations history"). Useful for regenerating output with the same prompt and settings.')
  .action(replayAction);

program.command('gallery')
  .description('View a visual summary of your recent batch image generation runs.')
  .action(galleryAction);

program.command('session')
  .description('List all saved chat and assist sessions with their IDs, timestamps, and model used. Use the session ID with "pollinations continue" to resume.')
  .action(sessionAction);

program.command('continue <id>')
  .description('Resume a previously saved chat or assist session by its ID. The full conversation history is restored so the model has full context.')
  .action(continueAction);

// ── Templates ─────────────────────────────────────────────────────────────────

const template = program.command('template')
  .description('Save and run reusable prompt templates with {variable} substitution. Variables are filled interactively if not passed as flags.');

template.command('list')
  .description('List all saved templates with their variables, description, and a content preview.')
  .action(templateList);

template.command('save <name> <content>')
  .description('Save a prompt template. Use {variable} placeholders for dynamic values (e.g. "Review this {lang} code: {code}"). Prompts for confirmation before overwriting.')
  .option('-d, --description <text>', 'Optional description shown in the template list')
  .option('-f, --force',              'Overwrite existing template without confirmation')
  .action(templateSave);

template.command('run <name>')
  .description('Run a saved template. Missing variables are prompted interactively. Pass variables as flags (e.g. --lang javascript --code "...") to skip prompts.')
  .option('-m, --model <model>',  'Model to use for this run. Overrides defaults.text.model setting.')
  .option('-s, --stream',         'Stream the response token-by-token.')
  .action(templateRun);

template.command('show <name>')
  .description('Show the full content of a saved template and its variables.')
  .action(templateShow);

template.command('delete <name>')
  .description('Delete a saved template. Prompts for confirmation.')
  .action(templateDelete);

// ── Account ───────────────────────────────────────────────────────────────────

program.command('profile')
  .description('Show your Pollinations account: tier, Pollen balance with a visual bar, time until next hourly reset, and API key details.')
  .option('-k, --key <key>', 'Override your registered API key for this request only')
  .action(profileAction);

program.command('usage')
  .description('Show a per-request usage log with model, type, billing source (tier vs purchased credits), cost in USD, and response time. Requires account:usage permission on your key.')
  .option('-d, --days <number>',  'Number of days of history to show (default: 7, max: 90)')
  .option('-l, --limit <number>', 'Max number of records to display (default: 25)')
  .option('-k, --key <key>',      'Override your registered API key for this request only')
  .action(usageHistoryAction);

program.command('usage-daily')
  .description('Show a daily bar chart of Pollen spend and request counts. Use --breakdown to also see a cost breakdown by model. Requires account:usage permission.')
  .option('-d, --days <number>', 'Number of days to show (default: 14, max: 90)')
  .option('--breakdown',         'Also show a cost breakdown by model')
  .option('-k, --key <key>',     'Override your registered API key for this request only')
  .action(usageDailyAction);

// ── Keys ──────────────────────────────────────────────────────────────────────

const keys = program.command('keys')
  .description('Manage your Pollinations API keys. Requires the account:keys permission on a secret (sk_) key.');

keys.command('list')
  .description('List all API keys on your account, showing name, type, permissions, Pollen budget, allowed models, and expiry.')
  .option('-k, --key <key>', 'Override your registered API key for this request only')
  .action(keysListAction);

keys.command('create')
  .description('Create a new API key via an interactive wizard. Pass all flags together to skip the wizard and create non-interactively.')
  .option('-n, --name <name>',     'Key name (1–253 characters)')
  .option('-t, --type <type>',     'Key type: secret (sk_, server-side) or publishable (pk_, client-side OAuth). Default: secret.')
  .option('-e, --expires <days>',  'Expire the key after this many days (1–365). Omit for no expiry.')
  .option('-b, --budget <pollen>', 'Pollen budget cap for this key. Omit for unlimited.')
  .option('-p, --perms <scopes>',  'Comma-separated account permissions to grant: usage, keys, profile')
  .option('-m, --models <ids>',    'Comma-separated model IDs this key can access. Omit to allow all.')
  .option('-r, --redirect <uris>', 'Comma-separated OAuth redirect URIs. Required for publishable keys.')
  .option('-k, --key <key>',       'Override your registered API key for this request only')
  .action(keysCreateAction);

keys.command('revoke <id>')
  .description('Permanently revoke an API key by its ID. Run "pollinations keys list" to find key IDs. You cannot revoke the key you are currently authenticated with.')
  .option('-y, --yes',       'Skip the confirmation prompt')
  .option('-k, --key <key>', 'Override your registered API key for this request only')
  .action(keysRevokeAction);

// ── Settings ──────────────────────────────────────────────────────────────────

const settings = program.command('settings')
  .description('View and manage CLI settings: default models, output dimensions, upload behaviour, confirmation prompts, display preferences, and more. Changes are saved locally and persist across sessions.');

settings.command('list')
  .description('List all settings with their current values and defaults. Green dot = customized, grey dot = using default. Use --filter to search by key name.')
  .option('-f, --filter <text>', 'Filter settings by key name (e.g. --filter model)')
  .option('-c, --changed',       'Show only settings that have been customized from their defaults')
  .action(settingsListAction);

settings.command('get <key>')
  .description('Show the current value, default, and status of a single setting (e.g. pollinations settings get defaults.image.model).')
  .action(settingsGetAction);

settings.command('set <key> <value>')
  .description('Change a setting value. The change is saved immediately and persists across sessions. Run "pollinations settings list" to see all valid keys and their expected types.')
  .action(settingsSetAction);

settings.command('reset [key]')
  .description('Reset a single setting to its default by passing its key, or reset ALL settings to defaults by omitting the key. Prompts for confirmation unless --yes is passed.')
  .option('-y, --yes', 'Skip the confirmation prompt when resetting all settings')
  .action(settingsResetAction);

settings.command('wizard')
  .description('Walk through all settings interactively in a guided wizard. Press Enter to keep the current value for any setting.')
  .action(settingsWizardAction);

settings.command('export')
  .description('Print all current settings as JSON, or save to a file with --output. Useful for sharing settings across machines or backing them up.')
  .option('-o, --output <path>', 'Save settings JSON to a file instead of printing to stdout')
  .action(settingsExportAction);

settings.command('import <file>')
  .description('Load settings from a JSON file previously exported with "pollinations settings export". Unknown keys are skipped.')
  .action(settingsImportAction);

// ── Quota ─────────────────────────────────────────────────────────────────────

program.command('quota')
  .description('Show or set a local hourly call cap. This is a local safeguard you set yourself — separate from your actual Pollen balance. At 80% of the cap you get a warning; at 100% commands are blocked until the hour resets. Pass 0 to remove the cap entirely.')
  .argument('[limit]', 'Max API calls allowed per hour. Pass 0 to remove the cap.')
  .action((limit) => {
    if (limit !== undefined) {
      const n = parseInt(limit);
      if (isNaN(n) || n < 0) {
        console.error(chalk.red('  ✖ Limit must be a non-negative integer.'));
        return;
      }
      quota.setLimit(n === 0 ? null : n);
      console.log(chalk.green(`  ✔ Hourly quota set to ${n === 0 ? 'unlimited' : n + ' calls/hour'}.`));
    } else {
      console.log(quota.status());
    }
  });

program.command('config')
  .description('Print the full raw configuration store as JSON. For a friendlier view of CLI settings, use "pollinations settings list" instead.')
  .action(() => console.log(JSON.stringify(config.store, null, 2)));

program.parse();
