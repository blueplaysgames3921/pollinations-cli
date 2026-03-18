#!/usr/bin/env node
import { program } from 'commander';
import { textAction } from '../src/commands/text.js';
import { imageAction } from '../src/commands/image.js';
import { listModels } from '../src/commands/models.js';
import { batchAction } from '../src/commands/batch.js';
import { assistAction } from '../src/commands/assist.js';
import { profileAction } from '../src/commands/profile.js';
import { videoAction } from '../src/commands/video.js';
import { audioAction } from '../src/commands/audio.js';
import { galleryAction } from '../src/utils/history.js';
import { chatAction } from '../src/commands/chat.js';
import { authAction } from '../src/commands/auth.js';
import { historyAction, replayAction } from '../src/commands/history.js';
import { templateSave, templateRun } from '../src/commands/template.js';
import { sessionAction, continueAction } from '../src/commands/sessions.js';
import { config } from '../src/lib/config-store.js';

program.name('pollinations').version('1.3.0');

program.command('login')
  .description('Set your Pollinations API key')
  .action(authAction);

program.command('text [prompt]')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'Model ID', 'openai')
  .option('-s, --stream', 'Stream output')
  .action(textAction);

program.command('image <prompt>')
  .option('-o, --output <path>', 'Output file')
  .option('-m, --model <model>', 'Model', 'flux')
  .option('-w, --width <number>', 'Width', '1024')
  .option('-h, --height <number>', 'Height', '1024')
  .action(imageAction);

program.command('audio <prompt>')
  .description('Generate speech or music')
  .option('-o, --output <path>', 'Output file path')
  .option('-m, --model <model>', 'Audio model', 'elevenlabs')
  .option('--voice <n>', 'Voice ID', 'rachel')
  .option('--speed <number>', 'Speed (0.25–4.0)', '1')
  .option('--duration <number>', 'Seconds (max 30)', '30')
  .option('--instrumental <bool>', 'Music only', 'false')
  .action(audioAction);

program.command('video <prompt>')
  .description('Generate video')
  .option('-o, --output <path>', 'Output file path')
  .option('-m, --model <model>', 'Video model', 'seedance')
  .option('-w, --width <number>', 'Width', '1024')
  .option('-h, --height <number>', 'Height', '576')
  .option('--duration <number>', 'Duration in seconds', '4')
  .option('--audio <bool>', 'Include audio', 'true')
  .option('--seed <number>', 'Manual seed')
  .action(videoAction);

program.command('assist')
  .alias('pollina')
  .description('Start the autonomous Pollina swarm agent')
  .action(() => assistAction());

program.command('models')
  .option('-t, --type <type>', 'Filter: text, image, video, audio')
  .action(listModels);

program.command('batch <file>')
  .description('Generate multiple images from a prompt file')
  .option('-o, --outputDir <dir>', 'Output directory', './outputs')
  .option('-p, --parallel <number>', 'Parallel requests', '3')
  .action(batchAction);

program.command('chat')
  .description('Start an interactive chat session')
  .option('-m, --model <model>', 'Model to use', 'openai')
  .option('-s, --system <prompt>', 'System message', 'You are a helpful assistant.')
  .action(opts => chatAction(opts));

program.command('gallery')
  .description('View batch generation history')
  .action(galleryAction);

program.command('history')
  .description('View recent command history')
  .action(historyAction);

program.command('replay <id>')
  .description('Replay a command from history')
  .action(replayAction);

program.command('profile')
  .description('View your Pollen balance and account details')
  .action(profileAction);

program.command('session')
  .description('List all saved chat and assist sessions')
  .action(sessionAction);

program.command('continue <id>')
  .description('Resume a saved session by its number (see: pollinations session)')
  .action(continueAction);

const template = program.command('template');
template.command('save <n> <content>').action(templateSave);
template.command('run <n>')
  .option('--topic <value>', 'Template variable')
  .action(templateRun);

program.command('config')
  .description('Show current configuration')
  .action(() => console.log(config.store));

program.parse();

