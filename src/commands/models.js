import { getApi } from '../lib/api.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export async function listModels(options) {
  const api = getApi();
  try {
    const { data } = await api.get('/v1/models');
    const table = new Table({ head: [chalk.green('ID'), chalk.green('Type'), chalk.green('Access')] });

    data.data.forEach(m => {
      let type = 'text/image';
      if (m.id.toLowerCase().includes('video')) type = 'video';
      if (m.id.toLowerCase().includes('audio') || m.id.toLowerCase().includes('voice')) type = 'audio';
      
      if (options.type && !type.includes(options.type)) return;
      table.push([m.id, type, 'Standard']);
    });

    console.log(table.toString());
  } catch (err) {
    console.error(chalk.red('Could not fetch models from gen.pollinations.ai'));
  }
}
