import fs from 'fs-extra';
import pLimit from 'p-limit';
import { imageAction } from './image.js';
import { saveToGallery } from '../utils/history.js';
import { getSetting } from '../lib/settings.js';
import { quota } from '../lib/quota-manager.js';
import chalk from 'chalk';
import path from 'path';

export async function batchAction(file, options) {
  const content = await fs.readFile(file, 'utf8');
  const lines   = content.split('\n').filter(l => l.trim());

  // Fix 3+4+5: use settings for model default, check quota
  const model      = options.model || getSetting('defaults.image.model');
  const width      = parseInt(options.width)  || getSetting('defaults.image.width');
  const height     = parseInt(options.height) || getSetting('defaults.image.height');
  const parallel   = parseInt(options.parallel) || 3;
  const outputDir  = options.outputDir || './outputs';
  const limit      = pLimit(parallel);

  await fs.ensureDir(outputDir);
  console.log(chalk.yellow(`Processing ${lines.length} prompts with model '${model}'...`));

  const tasks = lines.map((line, i) => limit(async () => {
    // Check quota before each image
    if (!quota.check()) return;

    const fileName   = `batch_${Date.now()}_${i}.png`;
    const outputPath = path.join(outputDir, fileName);
    try {
      await imageAction(line, {
        output: outputPath, model, width, height,
        key: options.key,
      });
      await saveToGallery(line, fileName, 'batch');
      console.log(chalk.green(`  ✔ Saved: ${fileName}`));
    } catch (err) {
      console.log(chalk.red(`  ✘ Error on "${line.substring(0, 30)}…": ${err.message}`));
    }
  }));

  await Promise.all(tasks);
  console.log(chalk.bold.green('\n  ✔ Batch complete. View with: pollinations gallery\n'));
}
