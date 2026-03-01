import fs from 'fs-extra';
import pLimit from 'p-limit';
import { imageAction } from './image.js';
import { saveToGallery } from '../utils/history.js';
import chalk from 'chalk';
import path from 'path';

export async function batchAction(file, options) {
  const content = await fs.readFile(file, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const limit = pLimit(parseInt(options.parallel || 3));
  
  await fs.ensureDir(options.outputDir);
  console.log(chalk.yellow(`Processing ${lines.length} prompts...`));
  
  const tasks = lines.map((line, i) => limit(async () => {
    const fileName = `batch_${Date.now()}_${i}.png`;
    const outputPath = path.join(options.outputDir, fileName);
    try {
      await imageAction(line, { output: outputPath, model: 'flux', width: 1024, height: 1024 });
      await saveToGallery(line, fileName, 'batch');
      console.log(chalk.green(`✔ Saved: ${fileName}`));
    } catch (err) {
      console.log(chalk.red(`✘ Error on "${line.substring(0,20)}": ${err.message}`));
    }
  }));

  await Promise.all(tasks);
  console.log(chalk.bold.green('✔ Batch complete. Check "pollinations gallery"'));
}
