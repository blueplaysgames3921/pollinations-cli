import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { textAction } from './text.js';

const tempDir = path.join(os.homedir(), '.pollinations', 'templates');

export async function templateSave(name, content) {
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, `${name}.json`), { content });
  console.log(chalk.green(`Template '${name}' saved.`));
}

export async function templateRun(name, options) {
  const temp = await fs.readJson(path.join(tempDir, `${name}.json`));
  let final = temp.content;
  for (const [key, val] of Object.entries(options)) {
    final = final.replace(`{${key}}`, val);
  }
  await textAction(final, {});
}

