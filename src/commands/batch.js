import fs from 'fs-extra';
import pLimit from 'p-limit';
import { imageAction } from './image.js';
import chalk from 'chalk';

export async function batchAction(file, options) {
  const lines = (await fs.readFile(file, 'utf8')).split('\n').filter(l => l.trim());
  const limit = pLimit(parseInt(options.parallel));
  await fs.ensureDir(options.outputDir);

  console.log(chalk.yellow(`Processing ${lines.length} prompts...`));
  
  const tasks = lines.map((line, i) => limit(() => 
    imageAction(line, { output: `${options.outputDir}/batch_${i}.png`, model: 'flux', width: 1024, height: 1024 })
  ));

  await Promise.all(tasks);
  console.log(chalk.green('✔ Batch complete.'));
}

