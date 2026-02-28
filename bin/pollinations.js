#!/usr/bin/env node
import { program } from 'commander';
import { textAction } from '../src/commands/text.js';
import { imageAction } from '../src/commands/image.js';
import { listModels } from '../src/commands/models.js';
import { config } from '../src/lib/config-store.js';
import chalk from 'chalk';

program
  .name('pollinations')
  .version('1.0.0');

program.command('login <key>')
  .action((key) => {
    config.set('apiKey', key);
    console.log(chalk.green('✔ API Key stored.'));
  });

program.command('text [prompt]')
  .option('-m, --model <model>', 'Model name', 'openai')
  .option('-s, --stream', 'Stream output')
  .action(textAction);

program.command('image <prompt>')
  .option('-o, --output <path>', 'Output file')
  .option('-w, --width <width>', 'Width', '1024')
  .option('-h, --height <height>', 'Height', '1024')
  .option('-m, --model <model>', 'Model', 'flux')
  .action(imageAction);

program.command('models')
  .action(listModels);

program.parse();
