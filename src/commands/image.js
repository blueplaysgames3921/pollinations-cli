import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import { getSetting } from '../lib/settings.js';
import { maybeUpload } from './upload.js';
import { logHistory } from './history.js';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export async function imageAction(prompt, options) {
  if (!quota.check()) return;

  const model  = options.model  || getSetting('defaults.image.model');
  const width  = parseInt(options.width)  || getSetting('defaults.image.width');
  const height = parseInt(options.height) || getSetting('defaults.image.height');
  const seed   = options.seed   || Math.floor(Math.random() * 1e9);
  const out    = options.output || `img_${Date.now()}.png`;

  const spinner = ora(`Generating image with ${chalk.bold(model)}...`).start();
  const api     = getApi(options.key);

  await logHistory('image', { prompt, model, width, height, seed });

  try {
    const res = await resilientCall(
      (apiClient, m) => {
        const params = new URLSearchParams({ model: m, width, height, seed, nologo: true });
        // Support --image flag for image-to-image (pipeable from upload)
        if (options.image) params.set('image', options.image);
        return apiClient.get(`/image/${encodeURIComponent(prompt)}?${params}`, { responseType: 'stream' });
      },
      api,
      model,
      { type: 'image' }
    );

    const writer = fs.createWriteStream(out);
    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    spinner.succeed(chalk.green(`  ✔ Saved: ${out}`));
    quota.increment();

    // Post-generation upload hook
    await maybeUpload(out, options.key, options);

  } catch (err) {
    spinner.fail(chalk.red('Image generation failed.'));
    console.log(chalk.red(`  ${formatError(err)}`));
  }
}
