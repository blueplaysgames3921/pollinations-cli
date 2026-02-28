import { getApi } from '../lib/api.js';
import { logHistory } from './history.js';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export async function imageAction(prompt, options) {
  const spinner = ora('Generating...').start();
  const api = getApi();
  const seed = Math.floor(Math.random() * 1e9);
  
  // Endpoint verified: gen.pollinations.ai/image/${prompt}
  const url = `/image/${encodeURIComponent(prompt)}?model=${options.model}&width=${options.width}&height=${options.height}&seed=${seed}&nologo=true`;

  try {
    await logHistory('image', { prompt, options });
    const res = await api.get(url, { responseType: 'stream' });
    const out = options.output || `img_${Date.now()}.png`;
    const writer = fs.createWriteStream(out);
    res.data.pipe(writer);
    writer.on('finish', () => spinner.succeed(chalk.green(`Saved: ${out}`)));
  } catch (err) {
    spinner.fail(chalk.red(`Failed: ${err.message}`));
  }
}
