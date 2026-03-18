import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import inquirer from 'inquirer';
import open from 'open';
import http from 'http';
import { config } from '../lib/config-store.js';

const beeGradient = gradient(['#facc15', '#eab308', '#22c55e', '#3b82f6']);

const grassTheme = gradient(['#22c55e', '#16a34a', '#15803d']);
const highlight = chalk.bold.yellow;

export async function authAction() {
  console.clear();

  console.log(beeGradient(figlet.textSync('POLLINATIONS', { font: 'ANSI Shadow' })));
  

  console.log(chalk.white('  VERSION: ') + chalk.bold.yellow('v1.3.0'));
  console.log(chalk.white('  CREATOR: ') + chalk.bold.cyan('blueplaysgames3921'));
  console.log(chalk.white('  INFRASTRUCTURE:   ') + chalk.bold.green('pollinations.ai'));
  console.log('\n' + grassTheme('☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘') + '\n');

  console.log(chalk.cyan('┌── Tips for the Garden ──────────────────────────────────────────┐'));
  console.log(`│ ${highlight('• Text:')} Use ${chalk.green('--stream')} for real-time AI responses.          │`);
  console.log(`│ ${highlight('• Pixels:')} Generate images with ${chalk.green('pollinations image "prompt"')}  │`);
  console.log(`│ ${highlight('• Motion:')} Try the ${chalk.green('video')} command for cinematic loops.       │`);
  console.log(`│ ${highlight('• Swarm:')} Create ${chalk.green('AGENTS.md')} to give Pollina project context.   │`);
  console.log(`│ ${highlight('• Pipes:')} Use ${chalk.dim('cat logs.txt | pollinations text')} to summarize.  │`);
  console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────┘\n'));

  console.log(chalk.yellow('╔════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('║') + chalk.white('  [1] Login via Pollinations Gateway (input: byop) [RECOMMENDED]                  ') + chalk.yellow('║'));
  console.log(chalk.yellow('╠════════════════════════════════════════════════════════════════╣'));
  console.log(chalk.yellow('║') + chalk.white('  [2] Enter API Key Manually (input: manual)                                ') + chalk.yellow('║'));
  console.log(chalk.yellow('╚════════════════════════════════════════════════════════════════╝\n'));

  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: chalk.bold.white('SELECT AUTHENTICATION METHOD:'),
      choices: [
        { 
          name: `🐝 ${chalk.yellow('Option 1 [BYOP]:')} Login via Pollinations Gateway`, 
          value: 'byop' 
        },
        { 
          name: `🔑 ${chalk.yellow('Option 2 [MANUAL]:')} Enter API Key Manually`, 
          value: 'manual' 
        }
      ]
    }
  ]);

  if (method === 'byop') {
    // Bridge page — checks if the user is already logged in on the web app.
    // If a key exists in the browser it gets sent straight to port 9999 here.
    // If not, the bridge redirects them through SSO which lands back on /auth,
    // which also hits port 9999 to complete the handshake.
    const bridgeUrl = 'https://pollinations-cli-web.vercel.app/auth/cli';

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

    server.listen(9999, () => {
      console.log(`\n${chalk.blue('ℹ')} ${chalk.bold('METHOD [BYOP]:')} Opening Hive bridge...`);
    });

    await open(bridgeUrl);

    console.log(chalk.yellow('⌛ Waiting for the Hive handshake...'));
    console.log(chalk.dim('  • Already logged in on the web? Your key will be injected instantly.'));
    console.log(chalk.dim('  • Not logged in? Complete the sign-in in the browser window.'));
    console.log(chalk.dim('\nPress Ctrl+C to abort and use Manual Entry.\n'));

  } else if (method === 'manual') {
    console.log(`\n${chalk.blue('ℹ')} ${chalk.bold('METHOD [MANUAL]:')} Direct Key Entry`);
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Paste your Pollinations API Key:',
        mask: '🐝',
        validate: (input) => {
            if (input.length < 10) return 'Key too short.';
            return true;
        }
      }
    ]);
    saveKey(key);
  } else {
    console.log(`\n${chalk.red('✘')} ${chalk.bold('ERROR:')} NOT A VALID AUTHENTICATION METHOD.`);
    process.exit(1);
  }
}

function saveKey(key) {
  if (key && key.length >= 10) {
    config.set('apiKey', key);
    console.log(`\n${chalk.green('✔')} ${chalk.bold('Welcome to the Swarm.')} Your key is securely stored.`);
    console.log(chalk.dim('Terminal synchronized.\n'));
  } else {
    console.log(`\n${chalk.red('✘')} Invalid Key. Handshake rejected.`);
  }
}
