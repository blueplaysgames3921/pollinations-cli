#!/usr/bin/env node
import { program } from 'commander';
import { textAction } from '../src/commands/text.js';
import { imageAction } from '../src/commands/image.js';
import { listModels } from '../src/commands/models.js';
import { batchAction } from '../src/commands/batch.js';
import { profileAction } from '../src/commands/profile.js';
import { videoAction } from '../src/commands/video.js';
import { audioAction } from '../src/commands/audio.js';
import { galleryAction } from '../src/utils/history.js';
import { chatAction } from '../src/commands/chat.js';
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

program.command('audio <prompt>')
  .description('Generate high-fidelity music/speech')
  .option('-o, --output <path>', 'Output file path')
  .option('-m, --model <model>', 'Audio model', 'elevenlabs')
  .option('--voice <name>', 'Voice ID (e.g., rachel, alloy)', 'rachel')
  .option('--speed <number>', 'Speed (0.25 to 4.0)', '1')
  .option('--duration <number>', 'Seconds (max 30)', '30')
  .option('--instrumental <bool>', 'Music only (true/false)', 'false')
  .action(audioAction);

program.command('video <prompt>')
  .description('Generate video using GET /video/{prompt}')
  .option('-o, --output <path>', 'Output file path')
  .option('-m, --model <model>', 'Video model (veo, seedance)', 'seedance')
  .option('-w, --width <number>', 'Width', '1024')
  .option('-h, --height <number>', 'Height', '576')
  .option('--duration <number>', 'Duration in seconds (4, 6, 8)', '4')
  .option('--audio <bool>', 'Include audio cues', 'true')
  .option('--seed <number>', 'Manual seed')
  .action(videoAction);


program.command('models')
  .option('-t, --type <type>', 'Filter (text/image/video/audio)')
  .action(listModels);

program
  .command('batch <file>')
  .description('Generate multiple images from a file')
  .option('-o, --outputDir <dir>', 'Output directory', './outputs')
  .option('-p, --parallel <number>', 'Parallel requests', '3')
  .action(batchAction);
program
  .command('chat')
  .description('Start an interactive chat session')
  .option('-m, --model <model>', 'Model to use', 'openai')
  .option('-s, --system <prompt>', 'System message', 'You are a helpful assistant.')
  .action(chatAction);
program
  .command('gallery')
  .description('View batch generation history')
  .action(galleryAction);

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
