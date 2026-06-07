import { getApi } from '../lib/api.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export async function listModels(options) {
  const api = getApi();
  try {
    const { data } = await api.get('/v1/models');
    const models   = data.data || [];

    const table = new Table({
      head: [chalk.green('ID'), chalk.green('Name'), chalk.green('Type'), chalk.green('Access')],
      colWidths: [28, 34, 8, 10],
      wordWrap: false,
    });

    for (const m of models) {
      // Fix 6+7: use m.type field from API, not ID string matching
      const type   = m.type || 'text';
      const access = m.isPaidOnly ? chalk.yellow('paid') : chalk.green('free');

      if (options.type && type !== options.type) continue;

      table.push([
        chalk.bold(m.id),
        chalk.dim(m.name || m.id),
        chalk.cyan(type),
        access,
      ]);
    }

    console.log('\n' + table.toString() + '\n');
  } catch (err) {
    console.error(chalk.red('  ✖ Could not fetch models from Pollinations API.'));
    console.error(chalk.dim(`  ${err.message}`));
  }
}
