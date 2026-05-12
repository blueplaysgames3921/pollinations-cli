import { getApi } from '../lib/api.js';
import { formatError } from '../lib/api-resilience.js';
import { TIER_GRANTS } from '../lib/quota-manager.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

// ── Balance bars ──────────────────────────────────────────────────────────────

function tierBar(tierBalance, tierMax) {
  // tierBalance / tierMax — the free hourly grant
  if (tierMax === 0) return chalk.dim('no grant on this tier');
  const pct    = Math.min(tierBalance / tierMax, 1);
  const filled = Math.round(pct * 16);
  const empty  = 16 - filled;
  const color  = pct > 0.5 ? chalk.green : pct > 0.2 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty)) +
    chalk.dim(` ${tierBalance.toFixed(4)} / ${tierMax} Pollen`);
}

function paidBar(amount, label) {
  if (amount <= 0) return chalk.dim('0');
  // No max for paid — just show a solid bar scaled to itself
  return chalk.cyan('█'.repeat(8)) + chalk.dim(` ${amount.toFixed(4)} Pollen (${label})`);
}

function fmtReset(nextResetAt) {
  if (!nextResetAt) return 'N/A';
  const mins = Math.ceil((new Date(nextResetAt) - Date.now()) / 60000);
  if (mins <= 0) return 'resetting now';
  return mins > 60 ? `in ${Math.ceil(mins / 60)}h` : `in ${mins}m`;
}

// ── Profile command ───────────────────────────────────────────────────────────

export async function profileAction(options = {}) {
  const spinner = ora('Fetching profile...').start();
  const api     = getApi(options.key);

  try {
    const [profileRes, balanceRes, keyRes] = await Promise.all([
      api.get('/account/profile'),
      api.get('/account/balance'),
      api.get('/account/key'),
    ]);

    spinner.stop();

    const profile = profileRes.data;
    const bal     = balanceRes.data;
    const key     = keyRes.data;
    const tier    = (profile.tier || 'spore').toLowerCase();
    const tierMax = TIER_GRANTS[tier];
    const knownTier = tierMax !== undefined;
    const resolvedTierMax = knownTier ? tierMax : 0;

    const tierBalance   = bal.tierBalance   ?? 0;
    const cryptoBalance = bal.cryptoBalance ?? 0;
    const packBalance   = bal.packBalance   ?? 0;
    const totalBalance  = tierBalance + cryptoBalance + packBalance;

    // ── Header ────────────────────────────────────────────────────────────────
    console.log(chalk.bold.cyan('\n👤 POLLINATIONS PROFILE'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    const infoTable = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 0, 'padding-right': 2 },
    });

    infoTable.push(
      [chalk.yellow('User:'),  profile.name || profile.githubUsername || 'Anonymous'],
      [chalk.yellow('Email:'), profile.email || chalk.dim('(requires account:profile permission)')],
      [chalk.yellow('Tier:'),  chalk.green(tier.charAt(0).toUpperCase() + tier.slice(1)) +
                               (knownTier
                                 ? chalk.dim(` · hourly grant: ${resolvedTierMax} Pollen`)
                                 : chalk.yellow(` · unknown tier, grant may differ`))],
    );
    console.log(infoTable.toString());

    // ── Balance breakdown ─────────────────────────────────────────────────────
    console.log(chalk.bold.yellow('\n💰 BALANCE'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    const balTable = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 0, 'padding-right': 2 },
    });

    balTable.push(
      [chalk.yellow('Tier grant:'), tierBar(tierBalance, resolvedTierMax),
       chalk.dim(`resets ${fmtReset(profile.nextResetAt)}`)],
      [chalk.yellow('Crypto:'),     cryptoBalance > 0 ? paidBar(cryptoBalance, 'crypto') : chalk.dim('0'),  ''],
      [chalk.yellow('Pack:'),       packBalance   > 0 ? paidBar(packBalance,   'pack')   : chalk.dim('0'),  ''],
      [chalk.bold.white('Total:'),  chalk.bold.white(`${totalBalance.toFixed(4)} Pollen`), ''],
    );

    console.log(balTable.toString());

    // Deduction order note
    console.log(chalk.dim('  Deducted in order: tier grant → crypto → pack\n'));

    // ── Key details ───────────────────────────────────────────────────────────
    console.log(chalk.bold.magenta('🔑 KEY DETAILS'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    const keyTable = new Table({
      head: [chalk.gray('Name'), chalk.gray('Type'), chalk.gray('Permissions'), chalk.gray('Budget'), chalk.gray('Expires')],
    });

    keyTable.push([
      key.name || 'Default Key',
      key.type || 'secret',
      key.permissions?.account?.join(', ') || 'Full Access',
      key.pollenBudget != null ? `${key.pollenBudget} Pollen` : 'Unlimited',
      key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never',
    ]);

    console.log(keyTable.toString());
    console.log('');

  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch profile.'));
    if (err.response?.status === 403) {
      console.log(chalk.red('  Your API key lacks the required account permissions.'));
      console.log(chalk.dim('  Some fields need the account:profile or account:usage scope.'));
    } else {
      console.log(chalk.red(`  ${formatError(err)}`));
    }
  }
}
