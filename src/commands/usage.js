import chalk from 'chalk';
import { fmtDate } from '../utils/format.js';
import os from 'os';
import Table from 'cli-table3';
import { listSessions, getSession } from '../lib/sessions.js';
import { chatAction } from './chat.js';
import { assistAction } from './assist.js';


function fmtDir(directory) {
  if (!directory) return chalk.dim('—');
  const home  = os.homedir();
  const rel   = directory.startsWith(home) ? '~' + directory.slice(home.length) : directory;
  const parts = rel.split('/');
  return chalk.dim(parts.length > 2 ? '…/' + parts.slice(-2).join('/') : rel);
}

export async function sessionAction() {
  const sessions = await listSessions();

  if (!sessions.length) {
    console.log(chalk.yellow('\n  No saved sessions yet.'));
    console.log(chalk.dim('  Sessions are saved when you type "exit" inside pollinations chat or pollinations assist.\n'));
    return;
  }

  console.log(chalk.bold.cyan(`\n💬 SAVED SESSIONS`) + chalk.dim(`  ${sessions.length} total\n`));

  const table = new Table({
    head: [
      chalk.gray('#'),
      chalk.gray('Type'),
      chalk.gray('Title'),
      chalk.gray('Directory / Model'),
      chalk.gray('Saved'),
      chalk.gray('Summary'),
    ],
    colWidths: [4, 7, 32, 24, 18, 40],
    wordWrap: true,
    style: { head: [], border: [] },
  });

  for (const s of [...sessions].reverse()) { // newest first
    const type = s.type === 'chat'
      ? chalk.magenta('chat')
      : chalk.green('assist');

    const info = s.type === 'chat'
      ? chalk.dim(s.model || 'openai')
      : fmtDir(s.directory);

    // Show first line of context dump if available, else nothing
    const summary = s.contextDump
      ? chalk.dim(s.contextDump.split('\n')[0].replace(/^[-•*]\s*/, '').slice(0, 38))
      : chalk.dim('—');

    table.push([
      chalk.yellow(String(s.id)),
      type,
      chalk.bold(s.title || chalk.dim('(untitled)')),
      info,
      fmtDate(s.savedAt),
      summary,
    ]);
  }

  console.log(table.toString());
  console.log(chalk.dim('\n  Resume with: pollinations continue <#>\n'));
}

export async function continueAction(idArg) {
  const id = parseInt(idArg, 10);

  if (isNaN(id) || id < 1) {
    console.log(chalk.red(`\n  ✖ Invalid session ID: "${idArg}". Must be a positive number.`));
    console.log(chalk.dim('  Run "pollinations session" to see available sessions.\n'));
    process.exit(1);
  }

  const session = await getSession(id);

  if (!session) {
    console.log(chalk.red(`\n  ✖ Session #${id} not found.`));
    console.log(chalk.dim('  Run "pollinations session" to see available sessions.\n'));
    process.exit(1);
  }

  // Show context dump on resume so user knows where they left off
  if (session.contextDump) {
    console.log(chalk.bold.cyan(`\n  📋 Session #${id} — ${session.title}`));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    for (const line of session.contextDump.split('\n').slice(0, 8)) {
      console.log(chalk.dim(`  ${line}`));
    }
    console.log(chalk.gray('  ─────────────────────────────────────────────\n'));
  } else {
    console.log(chalk.blue(`\n  ↩ Resuming session #${id} [${session.type}] — ${session.title}\n`));
  }

  if (session.type === 'chat') {
    await chatAction({}, session);
  } else if (session.type === 'assist') {
    await assistAction(session);
  } else {
    console.log(chalk.red(`  ✖ Unknown session type: "${session.type}"`));
    process.exit(1);
  }
}

