#!/usr/bin/env node
import { program } from 'commander';
import { textAction } from '../src/commands/text.js';
import { imageAction } from '../src/commands/image.js';
import { listModels } from '../src/commands/models.js';
import { config } from '../src/lib/config-store.js';
import chalk from 'chalk';

program
  .name('pollinations')
  .description('Pro-grade CLI for Pollinations.ai')
  .version('1.0.0');

// AUTH
program.command('login <key>')
  .description('Store your API key')
  .action((key) => {
    config.set('apiKey', key);
    console.log(chalk.green('✔ API Key saved to ~/.pollinations/config.json'));
  });

// TEXT
program.command('text [prompt]')
  .description('Generate text or code')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'Model name', 'openai')
  .option('-s, --stream', 'Stream output live')
  .action(textAction);

// IMAGE
program.command('image <prompt>')
  .description('Generate AI art')
  .option('-o, --output <path>', 'Output file path')
  .option('-w, --width <number>', 'Image width', '1024')
  .option('-h, --height <number>', 'Image height', '1024')
  .option('-m, --model <model>', 'Model (flux, turbo, etc)', 'flux')
  .action(imageAction);

// MODELS
program.command('models')
  .description('List available models')
  .option('-t, --type <type>', 'Filter by type (text/image)')
  .action(listModels);

// CONFIG
program.command('config')
  .description('Show current settings')
  .action(() => {
    console.log(chalk.yellow('Current Config:'));
    console.log(config.store);
  });

program.parse();

