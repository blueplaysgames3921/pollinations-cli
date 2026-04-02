import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import inquirer from 'inquirer';
import open from 'open';
import http from 'http';
import { config } from '../lib/config-store.js';

const beeGradient = gradient(['#facc15', '#eab308', '#22c55e', '#3b82f6']);
const grassTheme  = gradient(['#22c55e', '#16a34a', '#15803d']);
const highlight   = chalk.bold.yellow;

export async function authAction() {
  console.clear();

  console.log(beeGradient(figlet.textSync('> POLLINATIONS', { font: 'ANSI Shadow' })));

  console.log(chalk.white('  VERSION: ') + chalk.bold.yellow('v1.3.1'));
  console.log(chalk.white('  CREATOR: ') + chalk.bold.cyan('blueplaysgames3921'));
  console.log(chalk.white('  INFRASTRUCTURE:   ') + chalk.bold.green('pollinations.ai'));
  console.log('\n' + grassTheme('☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘☘') + '\n');

  console.log(chalk.cyan('┌── Tips for the Garden ──────────────────────────────────────────┐'));
  console.log(`│ ${highlight('• Text:')} Use ${chalk.green('--stream')} for real-time AI responses.          │`);
  console.log(`│ ${highlight('• Pixels:')} Generate images with ${chalk.green('pollinations image "prompt"')}  │`);
  console.log(`│ ${highlight('• Motion:')} Try the ${chalk.green('video')} command for cinematic loops.       │`);
  console.log(`│ ${highlight('• Swarm:')} Create ${chalk.green('AGENTS.md')} to give Pollina project context.│`);
  console.log(`│ ${highlight('• Pipes:')} Use ${chalk.dim('cat logs.txt | pollinations text')} to summarize.│`);
  console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────┘\n'));

  console.log(chalk.yellow('╔════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('║') + chalk.white('  [1] Login via Pollinations Gateway (BYOP) [RECOMMENDED]      ') + chalk.yellow('║'));
  console.log(chalk.yellow('╠════════════════════════════════════════════════════════════════╣'));
  console.log(chalk.yellow('║') + chalk.white('  [2] Enter API Key Manually                                    ') + chalk.yellow('║'));
  console.log(chalk.yellow('╚════════════════════════════════════════════════════════════════╝\n'));

  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: chalk.bold.white('SELECT AUTHENTICATION METHOD:'),
      choices: [
        { name: `🐝 ${chalk.yellow('Option 1 [BYOP]:')} Login via Pollinations Gateway`, value: 'byop' },
        { name: `🔑 ${chalk.yellow('Option 2 [MANUAL]:')} Enter API Key Manually`,        value: 'manual' }
      ]
    }
  ]);

  if (method === 'byop') {
    await runByopFlow();
  } else {
    console.log(`\n${chalk.blue('ℹ')} ${chalk.bold('METHOD [MANUAL]:')} Direct Key Entry`);
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Paste your Pollinations API Key:',
        mask: '🐝',
        validate: (input) => {
          if (!input || input.trim().length < 10) return 'Key too short — must be at least 10 characters.';
          return true;
        }
      }
    ]);
    saveKey(key.trim());
  }
}

/**
 * Fixes vs original:
 *  1. CORS headers on every response — required since web pages now use cors-mode fetch.
 *  2. Explicit 127.0.0.1 bind — prevents IPv4/IPv6 localhost resolution mismatches.
 *  3. EADDRINUSE handler — clear error instead of unhandled exception crash.
 *  4. server.close(callback) before process.exit — clean shutdown.
 *  5. open() wrapped in try/catch — prints URL if browser can't be launched.
 *  6. SIGINT handled — Ctrl+C cleans up gracefully.
 */
async function runByopFlow() {
  const bridgeUrl = 'https://pollinations-cli-web.vercel.app/auth/cli';

  return new Promise((resolve) => {
    let settled = false;

    const done = (exitCode = 0) => {
      if (settled) return;
      settled = true;
      server.close(() => { resolve(); process.exit(exitCode); });
    };

    const server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }

      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1:9999');
      } catch {
        res.writeHead(400, corsHeaders());
        res.end('Bad Request');
        return;
      }

      const key = url.searchParams.get('key');

      if (url.pathname === '/token' && key) {
        res.writeHead(200, { 'Content-Type': 'text/plain', ...corsHeaders() });
        res.end('AUTHORIZED');
        saveKey(key);
        setTimeout(() => done(0), 200);
      } else {
        res.writeHead(204, corsHeaders());
        res.end();
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `\n${chalk.red('✘')} ${chalk.bold('Port 9999 is already in use.')}\n` +
          chalk.dim('  Kill it with: ') + chalk.cyan('fuser -k 9999/tcp') +
          chalk.dim(' or ') + chalk.cyan('lsof -ti:9999 | xargs kill') +
          chalk.dim('\n  Then run ') + chalk.cyan('pollinations login') + chalk.dim(' again.\n')
        );
      } else {
        console.error(`\n${chalk.red('✘')} Server error: ${err.message}\n`);
      }
      done(1);
    });

    server.listen(9999, '127.0.0.1', async () => {
      console.log(`\n${chalk.blue('ℹ')} ${chalk.bold('METHOD [BYOP]:')} Opening Hive bridge...`);
      console.log(chalk.yellow('⌛ Waiting for the Hive handshake...'));
      console.log(chalk.dim('  • Already logged in on the web? Your key will be injected instantly.'));
      console.log(chalk.dim('  • Not logged in? Complete the sign-in in your browser.'));
      console.log(chalk.dim('\nPress Ctrl+C to abort and use Manual Entry.\n'));

      try {
        await open(bridgeUrl);
      } catch {
        console.log(chalk.yellow('  ⚠  Could not open a browser automatically.\n'));
        console.log(chalk.dim('  Open this URL manually:\n'));
        console.log(chalk.cyan(`  ${bridgeUrl}\n`));
      }
    });

    process.once('SIGINT', () => {
      console.log(chalk.dim('\n\nAborted. Use Manual Entry if needed.\n'));
      done(0);
    });
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function saveKey(key) {
  const trimmed = (key || '').trim();
  if (trimmed.length >= 10) {
    config.set('apiKey', trimmed);
    console.log(`\n${chalk.green('✔')} ${chalk.bold('Welcome to the Swarm.')} Your key is securely stored.`);
    console.log(chalk.dim('Terminal synchronized.\n'));
  } else {
    console.log(`\n${chalk.red('✘')} Invalid key — too short. Handshake rejected.\n`);
    process.exit(1);
  }
}

