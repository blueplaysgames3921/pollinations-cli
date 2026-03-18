import chalk from 'chalk';
import Table from 'cli-table3';
import { listSessions, getSession } from '../lib/sessions.js';
import { chatAction } from './chat.js';
import { assistAction } from './assist.js';

export async function sessionAction() {
  const sessions = await listSessions();

  if (!sessions.length) {
    console.log(chalk.yellow('\n  No saved sessions yet.'));
    console.log(chalk.dim('  Sessions are saved when you type "exit" inside pollinations chat or pollinations assist.\n'));
    return;
  }

  console.log(chalk.bold.yellow('\n  SAVED SESSIONS\n'));

  const table = new Table({
    head: [chalk.cyan('#'), chalk.cyan('Type'), chalk.cyan('Saved'), chalk.cyan('Info'), chalk.cyan('Title')],
    colWidths: [5, 8, 22, 30, 40],
    wordWrap: true,
    style: { head: [], border: [] }
  });

  for (const s of sessions) {
    const type = s.type === 'chat'
      ? chalk.magenta('chat')
      : chalk.green('assist');

    const info = s.type === 'chat'
      ? chalk.dim(`model: ${s.model || 'openai'}`)
      : chalk.dim((s.directory || '(no dir)').replace(process.env.HOME || '', '~'));

    table.push([
      chalk.yellow(String(s.id)),
      type,
      chalk.dim(s.savedAt),
      info,
      s.title || chalk.dim('(untitled)')
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

  console.log(chalk.blue(`\n  ↩ Resuming session #${id} [${session.type}] — ${session.title}\n`));

  if (session.type === 'chat') {
    await chatAction({}, session);
  } else if (session.type === 'assist') {
    await assistAction(session);
  } else {
    console.log(chalk.red(`  ✖ Unknown session type: "${session.type}"`));
    process.exit(1);
  }
}

