import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import { getSetting } from '../lib/settings.js';
import { maybeUpload } from './upload.js';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export async function videoAction(prompt, options) {
  if (!quota.check()) return;

  const model    = options.model    || getSetting('defaults.video.model');
  const width    = parseInt(options.width)    || getSetting('defaults.video.width');
  const height   = parseInt(options.height)   || getSetting('defaults.video.height');
  const duration = parseInt(options.duration) || getSetting('defaults.video.duration');
  const seed     = options.seed     || Math.floor(Math.random() * 1e9);
  const out      = options.output   || `video_${Date.now()}.mp4`;

  const spinner = ora(`Generating video with ${chalk.bold(model)}...`).start();
  const api     = getApi(options.key);

  try {
    const res = await resilientCall(
      (apiClient, m) => {
        const params = new URLSearchParams({ model: m, width, height, seed, duration, nologo: true });
        // Support --image for video from image (pipeable from upload)
        if (options.image) params.set('image', options.image);
        return apiClient.get(`/video/${encodeURIComponent(prompt)}?${params}`, { responseType: 'stream' });
      },
      api,
      model
    );

    const writer = fs.createWriteStream(out);
    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    spinner.succeed(chalk.green(`  ✔ Saved: ${out}`));
    quota.increment();

    await maybeUpload(out, options.key, options);

  } catch (err) {
    spinner.fail(chalk.red('Video generation failed.'));
    console.log(chalk.red(`  ${formatError(err)}`));
  }
}
