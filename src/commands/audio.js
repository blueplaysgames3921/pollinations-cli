import { getApi } from '../lib/api.js';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export async function audioAction(prompt, options) {
  const spinner = ora('Generating Audio (Lyria 3)...').start();
  const api = getApi();

  try {
    const res = await api.post('/v1/audio/speech', {
      model: options.model || 'elevenlabs',
      input: prompt,
      voice: options.voice || 'rachel',
      response_format: 'mp3',
      speed: parseFloat(options.speed) || 1,
      duration: parseInt(options.duration) || 30,
      instrumental: options.instrumental === 'true'
    }, { responseType: 'stream' });

    const out = options.output || `audio_${Date.now()}.mp3`;
    const writer = fs.createWriteStream(out);
    res.data.pipe(writer);

    writer.on('finish', () => spinner.succeed(chalk.green(`✔ Saved: ${out}`)));
  } catch (err) {
    spinner.fail(chalk.red('Audio Error: ' + (err.response?.data?.error || err.message)));
  }
}
