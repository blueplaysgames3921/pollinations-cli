import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import inquirer from 'inquirer';
import open from 'open';
import { config } from '../lib/config-store.js';

const beeGradient = gradient(['#facc15', '#eab308', '#22c55e', '#3b82f6']);
const highlight = chalk.bold.yellow;

export async function authAction() {
  console.clear();

  // Header UI
  console.log(beeGradient(figlet.textSync('> POLLINATIONS', { font: 'ANSI Shadow' })));
  console.log(chalk.dim(`  v1.2.2 | Created by: blueplaysgames3921 | Infrastructure: pollinations.ai\n`));

  // Tips Box
  console.log(chalk.cyan('┌── Tips for the Garden ──────────────────────────────────────────┐'));
  console.log(`│ ${highlight('• Text:')} Use ${chalk.green('--stream')} for real-time AI responses.          │`);
  console.log(`│ ${highlight('• Pixels:')} Generate images with ${chalk.green('pollinations image "prompt"')}  │`);
  console.log(`│ ${highlight('• Motion:')} Try the ${chalk.green('video')} command for cinematic loops.       │`);
  console.log(`│ ${highlight('• Swarm:')} Create ${chalk.green('AGENTS.md')} to give Pollina project context.   │`);
  console.log(`│ ${highlight('• Pipes:')} Use ${chalk.dim('cat logs.txt | pollinations text')} to summarize.  │`);
  console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────┘\n'));

  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'Choose your authentication method:',
      choices: [
        { name: '1. Login with Pollinations (BYOP - Recommended)', value: 'byop' },
        { name: '2. Enter API Key Manually', value: 'manual' }
      ]
    }
  ]);

  if (method === 'byop') {
    const authUrl = new URL('https://enter.pollinations.ai/authorize');
    authUrl.searchParams.set('redirect_url', 'https://pollinations-cli-web.vercel.app');
    authUrl.searchParams.set('app_key', 'pk_dI8YPBNjXO3BddSA');

    console.log(`\n${chalk.blue('ℹ')} Opening your browser for secure authentication...`);
    console.log(chalk.dim(`URL: ${authUrl.toString()}\n`));
    
    await open(authUrl.toString());

    console.log(chalk.yellow('⚠  Once you have your key from the website, come back here.'));
    
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Paste the API Key from the browser:',
        mask: '🐝'
      }
    ]);
    saveKey(key);

  } else {
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Enter your Pollinations API Key:',
        mask: '🐝'
      }
    ]);
    saveKey(key);
  }
}

function saveKey(key) {
  if (key && key.length > 10) {
    config.set('apiKey', key);
    console.log(`\n${chalk.green('✔')} ${chalk.bold('Welcome to the Swarm.')} Your key is securely stored.`);
    console.log(chalk.dim('Run "pollinations --help" to see all available tools.\n'));
  } else {
    console.log(`\n${chalk.red('✘')} Invalid key. Garden access denied.`);
  }
}
