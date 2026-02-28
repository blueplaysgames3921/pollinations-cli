import { getApi } from '../lib/api.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

export async function profileAction() {
  const spinner = ora('Fetching profile data...').start();
  const api = getApi();

  try {
    // 1. Get Balance & Tier
    // Endpoint: GET /account/balance
    const balanceRes = await api.get('/account/balance');
    
    // 2. Get Profile Info (Email, Tier Name)
    // Endpoint: GET /account/profile
    const profileRes = await api.get('/account/profile');

    // 3. Get Specific Key Details (Permissions, Expiry)
    // Endpoint: GET /account/key
    const keyRes = await api.get('/account/key');

    spinner.stop();

    console.log(chalk.bold.cyan('\n👤 POLLINATIONS PROFILE'));
    console.log(`${chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);

    // Basic Info Table
    const infoTable = new Table({
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 0, 'padding-right': 2 }
    });

    infoTable.push(
      [chalk.yellow('User:'), profileRes.data.email || 'Anonymous'],
      [chalk.yellow('Tier:'), chalk.green(profileRes.data.tierName || 'Seed')],
      [chalk.yellow('Balance:'), `${chalk.bold(balanceRes.data.balance)} Pollen`]
    );
    console.log(infoTable.toString());

    // API Key Details
    console.log(chalk.bold.magenta('\n🔑 KEY DETAILS'));
    const keyTable = new Table({ head: [chalk.gray('Name'), chalk.gray('Permissions'), chalk.gray('Expires')] });
    
    const permissions = keyRes.data.permissions?.account?.join(', ') || 'Full Access';
    const expiry = keyRes.data.expiresAt ? new Date(keyRes.data.expiresAt).toLocaleDateString() : 'Never';

    keyTable.push([
      keyRes.data.name || 'Default Key',
      permissions,
      expiry
    ]);

    console.log(keyTable.toString());
    console.log('\n');

  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch profile.'));
    if (err.response?.status === 403) {
      console.log(chalk.red('Error: Your API key lacks "account:balance" permissions.'));
    } else {
      console.error(chalk.gray(err.message));
    }
  }
}
