import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import Table from 'cli-table3';
import { textAction } from './text.js';
import { imageAction } from './image.js';

const histPath = path.join(os.homedir(), '.pollinations', 'history.jsonl');
const HISTORY_LIMIT = 50;

export async function logHistory(cmd, params) {
  await fs.ensureDir(path.dirname(histPath));
  const entry = JSON.stringify({ id: Date.now(), cmd, params }) + '\n';
  await fs.appendFile(histPath, entry);
}

function truncate(str, len) {
  if (!str) return chalk.dim('(empty)');
  const s = str.replace(/\n/g, ' ').trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}

export async function historyAction() {
  if (!(await fs.pathExists(histPath))) return console.log(chalk.yellow('No history yet.'));

  // Both display and replay work from the same slice
  const raw   = (await fs.readFile(histPath, 'utf8')).trim().split('\n').filter(Boolean);
  const lines = raw.slice(-HISTORY_LIMIT);

  const textEntries  = [];
  const imageEntries = [];

  lines.forEach((l, i) => {
    try {
      const data = JSON.parse(l);
      const entry = { idx: i, data };
      if (data.cmd === 'image') imageEntries.push(entry);
      else                      textEntries.push(entry);
    } catch { /* skip malformed entries */ }
  });

  if (textEntries.length) {
    console.log(chalk.bold.cyan('\n  TEXT HISTORY'));
    const t = new Table({
      head: [chalk.gray('#'), chalk.gray('Model'), chalk.gray('Prompt')],
      colWidths: [5, 14, 60],
      wordWrap: false,
      style: { head: [], border: [] }
    });
    for (const { idx, data } of textEntries) {
      t.push([
        chalk.yellow(String(idx)),
        chalk.dim(data.params.model || 'openai'),
        truncate(data.params.content, 55)
      ]);
    }
    console.log(t.toString());
  }

  if (imageEntries.length) {
    console.log(chalk.bold.magenta('\n  IMAGE HISTORY'));
    const t = new Table({
      head: [chalk.gray('#'), chalk.gray('Model'), chalk.gray('Prompt')],
      colWidths: [5, 14, 60],
      wordWrap: false,
      style: { head: [], border: [] }
    });
    for (const { idx, data } of imageEntries) {
      t.push([
        chalk.yellow(String(idx)),
        chalk.dim(data.params.options?.model || 'flux'),
        truncate(data.params.prompt, 55)
      ]);
    }
    console.log(t.toString());
  }

  if (!textEntries.length && !imageEntries.length) {
    console.log(chalk.yellow('No history yet.'));
    return;
  }

  console.log(chalk.dim(`\n  Showing last ${lines.length} entries. Replay with: pollinations replay <#>\n`));
}

export async function replayAction(idArg) {
  const id = parseInt(idArg, 10);

  if (isNaN(id) || id < 0) {
    console.log(chalk.red(`  ✖ Invalid history ID: "${idArg}". Run "pollinations history" to see valid indices.`));
    process.exit(1);
  }

  if (!(await fs.pathExists(histPath))) {
    console.log(chalk.red('  ✖ No history file found.'));
    process.exit(1);
  }

  // Use the same slice as historyAction so indices always match what's displayed
  const raw   = (await fs.readFile(histPath, 'utf8')).trim().split('\n').filter(Boolean);
  const lines = raw.slice(-HISTORY_LIMIT);

  if (id >= lines.length) {
    console.log(chalk.red(`  ✖ Index #${id} is out of range (0–${lines.length - 1}). Run "pollinations history" to see valid indices.`));
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(lines[id]);
  } catch {
    console.log(chalk.red(`  ✖ History entry #${id} is malformed and cannot be replayed.`));
    process.exit(1);
  }

  console.log(chalk.dim(`  Replaying #${id} [${data.cmd}]…\n`));
  if (data.cmd === 'text') await textAction(data.params.content, data.params);
  else                     await imageAction(data.params.prompt, data.params.options);
}

