#!/usr/bin/env node
import { program } from 'commander';
import { textAction } from '../src/commands/text.js';
import { imageAction } from '../src/commands/image.js';
import { listModels } from '../src/commands/models.js';
import { batchAction } from '../src/commands/batch.js';
import { profileAction } from '../src/commands/profile.js';
import { historyAction, replayAction } from '../src/commands/history.js';
import { templateSave, templateRun } from '../src/commands/template.js';
import { config } from '../src/lib/config-store.js';
import chalk from 'chalk';

program.name('pollinations').version('1.1.0');

program.command('login <key>')
  .action((key) => {
    config.set('apiKey', key);
    console.log(chalk.green('✔ API Key stored in ~/.pollinations/config.json'));
  });

program.command('text [prompt]')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'Model ID', 'openai')
  .option('-s, --stream', 'Stream output')
  .action(textAction);

program.command('image <prompt>')
  .option('-o, --output <path>', 'Output file')
  .option('-m, --model <model>', 'Model (flux, turbo, etc)', 'flux')
  .option('-w, --width <number>', 'Width', '1024')
  .option('-h, --height <number>', 'Height', '1024')
  .action(imageAction);

program.command('models')
  .option('-t, --type <type>', 'Filter (text/image/video/audio)')
  .action(listModels);

program.command('batch <file>')
  .option('-p, --parallel <number>', 'Parallel tasks', '5')
  .option('-d, --output-dir <dir>', 'Output directory', './results')
  .action(batchAction);

program.command('history').action(historyAction);
program.command('replay <id>').action(replayAction);

program.command('profile')
  .description('View your Pollen balance and account details')
  .action(profileAction);

const template = program.command('template');
template.command('save <name> <content>').action(templateSave);
template.command('run <name>')
  .option('--topic <value>', 'Template variable')
  .action(templateRun);

program.command('config').action(() => console.log(config.store));

program.parse();
