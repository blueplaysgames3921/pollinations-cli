import { getApi } from '../lib/api.js';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export async function videoAction(prompt, options) {
  const spinner = ora('Generating Video...').start();
  const api = getApi();
  const seed = options.seed || Math.floor(Math.random() * 1e9);

  // Correct GET endpoint for video generation
  const url = `/image/${encodeURIComponent(prompt)}?model=${options.model || 'veo'}&width=${options.width || 1024}&height=${options.height || 576}&seed=${seed}&duration=${options.duration || 4}&audio=${options.audio || 'true'}&nologo=true`;

  try {
    const res = await api.get(url, { responseType: 'stream' });
    const out = options.output || `video_${Date.now()}.mp4`;
    const writer = fs.createWriteStream(out);

    res.data.pipe(writer);
    writer.on('finish', () => spinner.succeed(chalk.green(`✔ Saved: ${out}`)));
  } catch (err) {
    spinner.fail(chalk.red('Video Error: ' + (err.response?.data?.error || err.message)));
  }
}

