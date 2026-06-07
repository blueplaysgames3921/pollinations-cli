import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import { getSetting } from '../lib/settings.js';
import fs from 'fs-extra';
import { logHistory } from './history.js';
import chalk from 'chalk';
import ora from 'ora';

export async function audioAction(prompt, options) {
  if (!quota.check()) return;

  const model      = options.model || getSetting('defaults.audio.model');
  const voice      = options.voice || getSetting('defaults.audio.voice');
  const format     = getSetting('defaults.audio.format');
  const usingDefault = !options.model;

  if (usingDefault) {
    console.log(chalk.dim(`  No model specified — using default: ${model}`));
    console.log(chalk.dim(`  Set a permanent default: pollinations settings set defaults.audio.model <id>\n`));
  }

  await logHistory('audio', { prompt, model });

  const spinner = ora(`Generating audio with ${chalk.bold(model)}...`).start();
  const api     = getApi(options.key);

  try {
    const res = await resilientCall(
      async (apiClient, currentModel) => apiClient.post('/v1/audio/speech', {
        model:           currentModel,
        input:           prompt,
        voice,
        response_format: format,
        speed:           parseFloat(options.speed) || 1,
        duration:        parseInt(options.duration) || 30,
      }, { responseType: 'stream' }),
      api,
      model,
      { maxRetries: 3, type: 'audio' }
    );

    const out    = options.output || `audio_${Date.now()}.${format}`;
    const writer = fs.createWriteStream(out);
    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    spinner.succeed(chalk.green(`  ✔ Saved: ${out}`));
    quota.increment();

  } catch (err) {
    spinner.fail(chalk.red('Audio generation failed.'));
    console.log(chalk.red(`  ${formatError(err)}`));

    const message = err.message?.toLowerCase() || '';
    if (err.status === 400 && (message.includes('audio') || message.includes('speech'))) {
      console.log(chalk.dim(`\n  Hint: '${model}' may not support this type of audio generation.`));
      console.log(chalk.dim(`  Run 'pollinations models --type audio' to see available models.`));
    }
  }
}
