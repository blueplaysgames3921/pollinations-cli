import fs from 'fs-extra';
import pLimit from 'p-limit';
import { imageAction } from './image.js';
import { saveToGallery } from '../utils/history.js'; // Adjust path to where you put saveToGallery
import chalk from 'chalk';
import path from 'path';

export async function batchAction(file, options) {
  const content = await fs.readFile(file, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const limit = pLimit(parseInt(options.parallel || 3));
  
  await fs.ensureDir(options.outputDir);

  console.log(chalk.yellow(`🚀 Processing ${lines.length} prompts in batch...`));
  
  const tasks = lines.map((line, i) => limit(async () => {
    const fileName = `batch_${Date.now()}_${i}.png`;
    const outputPath = path.join(options.outputDir, fileName);
    
    try {
      // Run the image generation
      await imageAction(line, { 
        output: outputPath, 
        model: 'flux', 
        width: 1024, 
        height: 1024 
      });

      // Log it to our gallery database
      saveToGallery(line, fileName, 'batch');
      
      console.log(chalk.gray(`  ✔ Generated: ${fileName}`));
    } catch (err) {
      console.log(chalk.red(`  ✘ Failed: ${line.substring(0, 20)}...`));
    }
  }));

  await Promise.all(tasks);
  console.log(chalk.bold.green('\n✔ All batch tasks finished. Type "pollinations gallery" to see the log!'));
}
