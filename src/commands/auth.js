import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import inquirer from 'inquirer';
import open from 'open';
import http from 'http';
import { config } from '../lib/config-store.js';

const beeGradient = gradient(['#facc15', '#eab308', '#22c55e', '#3b82f6']);
const hiveTheme = gradient(['#adff2f', '#fbbf24', '#facc15']);
const highlight = chalk.bold.yellow;

export async function authAction() {
  console.clear();

  // Header UI with ASCII Bees
  console.log(beeGradient(figlet.textSync('> POLLINATIONS', { font: 'ANSI Shadow' })));
  console.log(hiveTheme(`
          _  _
        _/ \\/ \\_
       /   \\_   \\    Welcome to the Hive
       \\_ _/ \\_ _/    ${chalk.white('v1.2.2')}
         / \\_/ \\
         \\_/ \\_/     ${chalk.dim('Created by: blueplaysgames3921')}
  `));

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
      message: chalk.bold('Select Authentication Method:'),
      choices: [
        { 
          name: `${chalk.yellow('Option 1 [BYOP]:')} Login via Pollinations Gateway ${chalk.cyan('(Recommended)')}`, 
          value: 'byop' 
        },
        { 
          name: `${chalk.yellow('Option 2 [MANUAL]:')} Enter API Key Manually`, 
          value: 'manual' 
        }
      ]
    }
  ]);

  // VALIDATION: Strict check for the method
  if (method === 'byop') {
    const authUrl = new URL('https://enter.pollinations.ai/authorize');
    authUrl.searchParams.set('redirect_url', 'https://pollinations-cli-web.vercel.app/auth');
    authUrl.searchParams.set('app_key', 'pk_y3LE9V9R0kOBlPBp');

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const key = url.searchParams.get('key');

      if (key) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('AUTHORIZED'); 
        
        saveKey(key);
        
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 500);
      }
    });

    server.listen(9999);

    console.log(`\n${chalk.blue('ℹ')} ${chalk.bold('METHOD [BYOP]:')} Redirecting to Pollinations Browser Auth...`);
    console.log(chalk.dim(`Gateway: ${authUrl.toString()}\n`));
    
    await open(authUrl.toString());

    console.log(chalk.yellow('⌛ Waiting for the Hive handshake...'));
    console.log(chalk.dim('Press Ctrl+C to abort and use Manual Entry if the browser fails.\n'));

  } else if (method === 'manual') {
    console.log(`\n${chalk.blue('ℹ')} ${chalk.bold('METHOD [MANUAL]:')} Direct Key Entry`);
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Paste your Pollinations API Key:',
        mask: '🐝',
        validate: (input) => {
            if (input.length < 10) return 'Invalid Key: Too short.';
            return true;
        }
      }
    ]);
    saveKey(key);
  } else {
    // Catch-all for invalid logic
    console.log(`\n${chalk.red('✘')} ${chalk.bold('ERROR:')} NOT A VALID AUTHENTICATION METHOD.`);
    process.exit(1);
  }
}

function saveKey(key) {
  if (key && key.startsWith('sk-') || key.length > 10) {
    config.set('apiKey', key);
    console.log(`\n${chalk.green('✔')} ${chalk.bold('Welcome to the Swarm.')} Your key is securely stored.`);
    console.log(chalk.dim('The terminal is now synchronized with your Pollen balance.\n'));
    console.log(chalk.cyan('Run "pollinations --help" to begin.\n'));
  } else {
    console.log(`\n${chalk.red('✘')} Invalid Key. Handshake rejected.`);
  }
}
