import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import Table from 'cli-table3';

const DATA_PATH = path.join(os.homedir(), '.pollinations_history.json');

export async function saveToGallery(prompt, fileName, type = 'batch') {
  try {
    let history = [];
    if (await fs.pathExists(DATA_PATH)) {
      history = await fs.readJson(DATA_PATH);
    }
    history.push({
      timestamp: new Date().toLocaleString(),
      prompt: prompt.trim(),
      file: fileName,
      type: type
    });
    if (history.length > 100) history.shift();
    await fs.writeJson(DATA_PATH, history, { spaces: 2 });
  } catch (err) {
    console.error(chalk.red(`Failed to save history: ${err.message}`));
  }
}

export async function galleryAction() {
  if (!(await fs.pathExists(DATA_PATH))) {
    console.log(chalk.red("No history found. Run a batch first!"));
    return;
  }
  const history = await fs.readJson(DATA_PATH);
  const table = new Table({
    head: [chalk.cyan('Date'), chalk.cyan('Prompt'), chalk.cyan('File')],
    colWidths: [22, 50, 30],
    wordWrap: true
  });
  history.forEach(item => table.push([item.timestamp, item.prompt, item.file]));
  console.log(chalk.bold.yellow('\n🖼️  POLLINATIONS BATCH GALLERY\n'));
  console.log(table.toString());
}

