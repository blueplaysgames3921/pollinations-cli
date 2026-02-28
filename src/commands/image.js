import axios from 'axios';
import fs from 'fs-extra';
import chalk from 'chalk';

export async function imageAction(prompt, options) {
  const model = options.model || 'flux';
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${model}&width=${options.width}&height=${options.height}&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
  const fileName = options.output || `pollin_${Date.now()}.png`;

  try {
    console.log(chalk.yellow('Generating...'));
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    const writer = fs.createWriteStream(fileName);
    response.data.pipe(writer);
    writer.on('finish', () => console.log(chalk.green(`✔ Saved: ${fileName}`)));
  } catch (err) {
    console.error(chalk.red('Error:'), err.message);
  }
}

