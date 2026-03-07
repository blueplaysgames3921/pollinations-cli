import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import inquirer from 'inquirer';
import open from 'open';
import http from 'http';
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
      message: 'Select Authentication Method:',
      choices: [
        { 
          name: `${chalk.yellow('Option 1:')} Login via Browser ${chalk.cyan('(BYOP - Recommended)')}`, 
          value: 'byop' 
        },
        { 
          name: `${chalk.yellow('Option 2:')} Manual API Key Entry`, 
          value: 'manual' 
        }
      ]
    }
  ]);

  if (method === 'byop') {
    const authUrl = new URL('https://enter.pollinations.ai/authorize');
    authUrl.searchParams.set('redirect_url', 'https://pollinations-cli-web.vercel.app/auth');
    authUrl.searchParams.set('app_key', 'pk_y3LE9V9R0kOBlPBp');

    // Start Local Listener
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const key = url.searchParams.get('key');

      if (key) {
        saveKey(key);
        res.end('Authenticated. You can close this window.');
        server.close(); // Kill server after success
        process.exit(0); // Optional: close process if this was a standalone login call
      }
    });

    server.listen(9999);

    console.log(`\n${chalk.blue('ℹ')} Opening the Swarm Gateway in your browser...`);
    await open(authUrl.toString());

    console.log(chalk.yellow('⌛ Waiting for browser authorization...'));
    console.log(chalk.dim('(If it fails, press Ctrl+C and use Manual Entry)\n'));

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
