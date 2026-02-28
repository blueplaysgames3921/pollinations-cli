import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { textAction } from './text.js';
import { imageAction } from './image.js';

const histPath = path.join(os.homedir(), '.pollinations', 'history.jsonl');

export async function logHistory(cmd, params) {
  await fs.ensureDir(path.dirname(histPath));
  const entry = JSON.stringify({ id: Date.now(), cmd, params }) + '\n';
  await fs.appendFile(histPath, entry);
}

export async function historyAction() {
  if (!(await fs.pathExists(histPath))) return console.log('No history.');
  const lines = (await fs.readFile(histPath, 'utf8')).trim().split('\n').slice(-50);
  lines.forEach((l, i) => {
    const data = JSON.parse(l);
    console.log(`${chalk.yellow('#' + i)} [${data.cmd}] ${data.params.content || data.params.prompt}`);
  });
}

export async function replayAction(id) {
  const lines = (await fs.readFile(histPath, 'utf8')).trim().split('\n');
  const data = JSON.parse(lines[parseInt(id)]);
  if (data.cmd === 'text') await textAction(data.params.content, data.params);
  else await imageAction(data.params.prompt, data.params.options);
}

