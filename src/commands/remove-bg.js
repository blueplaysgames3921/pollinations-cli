import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import { uploadFile } from './upload.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';

const SUPPORTED = new Set(['jpg', 'jpeg', 'png', 'webp']);

export async function removeBgAction(filePath, options = {}) {
  if (!filePath) {
    console.error(chalk.red('  ✖ Provide an image file. Usage: pollinations remove-bg <file>'));
    return;
  }

  if (!quota.check()) return;

  const resolved = path.resolve(filePath);
  if (!await fs.pathExists(resolved)) {
    console.error(chalk.red(`  ✖ File not found: ${resolved}`));
    return;
  }

  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    console.error(chalk.red(`  ✖ Unsupported format: .${ext}. Use jpg, jpeg, png, or webp.`));
    return;
  }

  // ── Step 1: Upload source image to get a URL ──────────────────────────────
  const uploadSpinner = ora('Uploading image...').start();
  let sourceUrl;
  try {
    const result = await uploadFile(resolved, options.key);
    sourceUrl = result.url;
    uploadSpinner.succeed(chalk.dim(`  ↑ Uploaded: ${sourceUrl}`));
  } catch (err) {
    uploadSpinner.fail(chalk.red('Upload failed.'));
    console.log(chalk.red(`  ${err.message}`));
    return;
  }

  // ── Step 2: Send to background removal endpoint ───────────────────────────
  const spinner = ora('Removing background...').start();
  const api     = getApi(options.key);
  const out     = options.output || `${path.basename(resolved, path.extname(resolved))}_nobg.png`;

  try {
    const res = await resilientCall(
      (apiClient, m) => apiClient.get(`/image/${encodeURIComponent('remove background')}`, {
        params: {
          model:  m,
          image:  sourceUrl,
          nologo: true,
        },
        responseType: 'stream',
      }),
      api,
      options.model || 'p-image-edit',
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
    console.log('');

  } catch (err) {
    spinner.fail(chalk.red('Background removal failed.'));
    console.log(chalk.red(`  ${formatError(err)}`));
  }
}

