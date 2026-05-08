import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import FormData from 'form-data';

const DEFAULT_STT_MODEL = 'whisper-large-v3';

// Known STT models per the API spec
const KNOWN_STT_MODELS = new Set([
  'whisper-large-v3',
  'whisper-1',
  'scribe',
  'universal-2',
  'universal-3-pro',
]);

const SUPPORTED_FORMATS = new Set([
  'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'
]);

export async function transcribeAction(filePath, options = {}) {
  if (!quota.check()) return;

  // ── Validate file exists ──────────────────────────────────────────────────
  const resolved = path.resolve(filePath);
  if (!await fs.pathExists(resolved)) {
    console.error(chalk.red(`  ✖ File not found: ${resolved}`));
    return;
  }

  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    console.error(
      chalk.red(`  ✖ Unsupported format: .${ext}`) +
      chalk.dim(`\n    Supported: ${[...SUPPORTED_FORMATS].join(', ')}`)
    );
    return;
  }

  // Bug fix: pass options.key to getApi
  const api          = getApi(options.key);
  let chosenModel    = options.model || DEFAULT_STT_MODEL;
  const usingDefault = !options.model;

  // ── Model validation ──────────────────────────────────────────────────────
  if (!usingDefault) {
    const isKnownStt = KNOWN_STT_MODELS.has(chosenModel);

    if (!isKnownStt) {
      console.log(chalk.yellow(`\n  ⚠ '${chosenModel}' is not a recognized STT model.`));
      console.log(chalk.dim(`  Known STT models: ${[...KNOWN_STT_MODELS].join(', ')}`));
      console.log('');

      const { action } = await inquirer.prompt([{
        type:    'list',
        name:    'action',
        message: chalk.bold('What would you like to do?'),
        choices: [
          { name: `Switch to default STT model (${DEFAULT_STT_MODEL})`, value: 'default' },
          { name: `Proceed anyway with '${chosenModel}'`,                value: 'proceed' },
          { name: 'Cancel',                                               value: 'cancel'  },
        ],
      }]);

      if (action === 'cancel') {
        console.log(chalk.dim('  Cancelled.'));
        return;
      }
      if (action === 'default') {
        chosenModel = DEFAULT_STT_MODEL;
        console.log(chalk.dim(`  → Using model: ${chosenModel}\n`));
      } else {
        console.log(chalk.dim(`  → Proceeding with '${chosenModel}'. If it fails, it is not an STT model.\n`));
      }
    }
  }

  // ── Run transcription ─────────────────────────────────────────────────────
  const fileName = path.basename(resolved);
  const spinner  = ora(`Transcribing ${chalk.bold(fileName)} with ${chalk.bold(chosenModel)}...`).start();

  try {
    const result = await resilientCall(
      async (apiClient, model) => {
        const form = new FormData();
        form.append('file', fs.createReadStream(resolved), {
          filename:    fileName,
          contentType: `audio/${ext === 'mp3' ? 'mpeg' : ext}`,
        });
        form.append('model', model);
        if (options.language) form.append('language', options.language);

        return apiClient.post('/v1/audio/transcriptions', form, {
          headers: form.getHeaders(),
        });
      },
      api,
      chosenModel,
      { maxRetries: 3 }
    );

    spinner.stop();
    quota.increment();

    const transcript = result.data?.text || result.data;

    if (options.output) {
      await fs.writeFile(path.resolve(options.output), transcript);
      console.log(chalk.green(`  ✔ Transcript saved: ${options.output}`));
    } else {
      console.log(chalk.bold.cyan('\n  Transcript:\n'));
      console.log(chalk.white(transcript));
      console.log('');
    }

  } catch (err) {
    spinner.fail(chalk.red('Transcription failed.'));

    const message = formatError(err);

    // Error-based STT detection: 400 from wrong model type
    const isWrongModelType =
      err.status === 400 &&
      (message.toLowerCase().includes('audio') ||
       message.toLowerCase().includes('transcri') ||
       message.toLowerCase().includes('unsupported'));

    if (isWrongModelType && chosenModel !== DEFAULT_STT_MODEL) {
      console.log(chalk.yellow(`\n  ⚠ '${chosenModel}' doesn't appear to support transcription.`));
      console.log(chalk.dim(`  Valid STT models: ${[...KNOWN_STT_MODELS].join(', ')}`));
      console.log(chalk.dim(`  Try: pollinations transcribe ${filePath} --model ${DEFAULT_STT_MODEL}`));
    } else {
      console.log(chalk.red(`  ${message}`));
    }
  }
}

