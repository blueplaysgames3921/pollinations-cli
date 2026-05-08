import { getApi } from '../lib/api.js';
import { formatError } from '../lib/api-resilience.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import inquirer from 'inquirer';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtExpiry(expiresAt) {
  if (!expiresAt) return chalk.dim('Never');
  const date = new Date(expiresAt);
  const days = Math.ceil((date - Date.now()) / 86400000);
  const dateStr = date.toLocaleDateString();
  if (days < 0)  return chalk.red(`${dateStr} (expired)`);
  if (days === 0) return chalk.yellow(`${dateStr} (today)`);
  return `${dateStr} ${chalk.dim(`(${days}d)`)}`;
}

function fmtBudget(pollenBudget) {
  if (pollenBudget == null) return chalk.dim('Unlimited');
  return pollenBudget > 0
    ? chalk.yellow(`${pollenBudget} Pollen`)
    : chalk.red('Exhausted');
}

function fmtModels(allowedModels) {
  if (!allowedModels || allowedModels.length === 0) return chalk.dim('All');
  if (allowedModels.length <= 3) return allowedModels.join(', ');
  return `${allowedModels.slice(0, 3).join(', ')} +${allowedModels.length - 3}`;
}

function fmtPerms(permissions) {
  if (!permissions?.account || permissions.account.length === 0) return chalk.dim('None');
  return permissions.account.join(', ');
}

function typeLabel(type) {
  return type === 'publishable'
    ? chalk.cyan('pk_')
    : chalk.magenta('sk_');
}

function permissionNotice() {
  console.log(chalk.yellow('\n  ⚠ This command requires the account:keys permission on a secret key (sk_).'));
  console.log(chalk.dim('  If you\'re using a publishable key or a key without this scope, it will be denied.\n'));
}

// ── List Keys ─────────────────────────────────────────────────────────────────

export async function keysListAction(options = {}) {
  const spinner = ora('Fetching API keys...').start();
  const api     = getApi(options.key);

  try {
    const res  = await api.get('/account/keys');
    spinner.stop();

    const keys = res.data?.keys || res.data || [];

    if (!keys.length) {
      console.log(chalk.dim('\n  No API keys found.\n'));
      return;
    }

    console.log(chalk.bold.cyan(`\n🔑 API KEYS  `) + chalk.dim(`${keys.length} total`));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    const table = new Table({
      head: [
        chalk.gray('ID'),
        chalk.gray('Name'),
        chalk.gray('Type'),
        chalk.gray('Permissions'),
        chalk.gray('Budget'),
        chalk.gray('Models'),
        chalk.gray('Expires'),
      ],
      colWidths: [14, 20, 6, 16, 14, 16, 22],
      wordWrap: true,
    });

    for (const k of keys) {
      table.push([
        chalk.dim(k.id?.slice(0, 12) + '…' || '—'),
        chalk.bold(k.name || 'Unnamed'),
        typeLabel(k.type),
        fmtPerms(k.permissions),
        fmtBudget(k.pollenBudget),
        fmtModels(k.permissions?.models),
        fmtExpiry(k.expiresAt),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim(`\n  To revoke a key: pollinations keys revoke <id>`));
    console.log(chalk.dim(`  To create a key: pollinations keys create\n`));

  } catch (err) {
    spinner.fail(chalk.red('Failed to list keys.'));
    const status = err.response?.status;
    if (status === 403 || status === 401) {
      permissionNotice();
    } else {
      console.log(chalk.red(`  ${formatError(err)}`));
    }
  }
}

// ── Create Key ────────────────────────────────────────────────────────────────

export async function keysCreateAction(options = {}) {
  const api = getApi(options.key);

  // If all options are passed as flags, skip the interactive flow
  const isNonInteractive = options.name && options.type;

  let params = {};

  if (isNonInteractive) {
    params = {
      name:               options.name,
      type:               options.type || 'secret',
      expiresIn:          options.expires ? parseInt(options.expires) * 86400 : undefined,
      pollenBudget:       options.budget  ? parseFloat(options.budget)         : undefined,
      allowedModels:      options.models  ? options.models.split(',').map(s => s.trim()) : undefined,
      accountPermissions: options.perms   ? options.perms.split(',').map(s => s.trim())  : undefined,
      redirectUris:       options.redirect ? options.redirect.split(',').map(s => s.trim()) : undefined,
    };
  } else {
    // Interactive wizard
    console.log(chalk.bold.cyan('\n🔑 CREATE API KEY\n'));

    const answers = await inquirer.prompt([
      {
        type:     'input',
        name:     'name',
        message:  'Key name:',
        default:  options.name || 'My Key',
        validate: v => v.trim().length >= 1 && v.trim().length <= 253
          ? true : 'Name must be 1–253 characters.',
      },
      {
        type:    'list',
        name:    'type',
        message: 'Key type:',
        default: options.type || 'secret',
        choices: [
          { name: 'Secret (sk_) — server-side, no rate limits',            value: 'secret' },
          { name: 'Publishable (pk_) — client-side, for BYOP OAuth flows', value: 'publishable' },
        ],
      },
      {
        type:    'input',
        name:    'expires',
        message: 'Expires in how many days? (leave blank = never, max 365):',
        default: '',
        validate: v => {
          if (!v) return true;
          const n = parseInt(v);
          return (!isNaN(n) && n >= 1 && n <= 365) ? true : 'Enter a number between 1 and 365, or leave blank.';
        },
      },
      {
        type:    'input',
        name:    'budget',
        message: 'Pollen budget cap? (leave blank = unlimited):',
        default: '',
        validate: v => {
          if (!v) return true;
          const n = parseFloat(v);
          return !isNaN(n) && n >= 0 ? true : 'Enter a non-negative number or leave blank.';
        },
      },
      {
        type:    'checkbox',
        name:    'perms',
        message: 'Account permissions to grant (optional):',
        choices: [
          { name: 'usage  — read usage history',    value: 'usage'   },
          { name: 'keys   — manage API keys',        value: 'keys'    },
          { name: 'profile — read profile & email',  value: 'profile' },
        ],
      },
      {
        type:    'input',
        name:    'models',
        message: 'Restrict to specific models? (comma-separated, blank = all):',
        default: '',
      },
      {
        type:    'input',
        name:    'redirect',
        when:    a => a.type === 'publishable',
        message: 'Redirect URIs for OAuth (comma-separated, required for pk_):',
        default: '',
      },
    ]);

    params = {
      name:               answers.name.trim(),
      type:               answers.type,
      expiresIn:          answers.expires ? parseInt(answers.expires) * 86400 : undefined,
      pollenBudget:       answers.budget  ? parseFloat(answers.budget)         : undefined,
      accountPermissions: answers.perms?.length ? answers.perms : undefined,
      allowedModels:      answers.models  ? answers.models.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      redirectUris:       answers.redirect ? answers.redirect.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    };
  }

  // Strip undefined fields
  Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

  const spinner = ora('Creating key...').start();

  try {
    const res = await api.post('/account/keys', params);
    spinner.stop();

    const key = res.data;

    console.log(chalk.bold.green('\n  ✔ Key created successfully!\n'));

    console.log(chalk.bold('  Name:    ') + key.name);
    console.log(chalk.bold('  Type:    ') + typeLabel(key.type) + key.type);
    console.log(chalk.bold('  ID:      ') + chalk.dim(key.id));

    // The full key value is returned only once
    if (key.key || key.secret || key.value) {
      const fullKey = key.key || key.secret || key.value;
      console.log('\n' + chalk.bgYellow.black.bold('  ⚠ COPY THIS KEY NOW — it will not be shown again  '));
      console.log('\n  ' + chalk.bold.white(fullKey) + '\n');
    }

    if (key.expiresAt) {
      console.log(chalk.bold('  Expires: ') + new Date(key.expiresAt).toLocaleDateString());
    }
    if (key.pollenBudget != null) {
      console.log(chalk.bold('  Budget:  ') + fmtBudget(key.pollenBudget));
    }
    if (key.permissions?.account?.length) {
      console.log(chalk.bold('  Perms:   ') + key.permissions.account.join(', '));
    }
    if (key.permissions?.models?.length) {
      console.log(chalk.bold('  Models:  ') + fmtModels(key.permissions.models));
    }

    console.log('');

  } catch (err) {
    spinner.fail(chalk.red('Failed to create key.'));
    const status = err.response?.status;
    if (status === 403 || status === 401) {
      permissionNotice();
    } else {
      console.log(chalk.red(`  ${formatError(err)}`));
    }
  }
}

// ── Revoke Key ────────────────────────────────────────────────────────────────

export async function keysRevokeAction(id, options = {}) {
  const api = getApi(options.key);

  if (!id) {
    console.error(chalk.red('  ✖ Key ID is required. Run "pollinations keys list" to see your keys.'));
    return;
  }

  // Confirm unless --yes flag
  if (!options.yes) {
    const { confirmed } = await inquirer.prompt([{
      type:    'confirm',
      name:    'confirmed',
      message: chalk.yellow(`Revoke key ${chalk.bold(id)}? This cannot be undone.`),
      default: false,
    }]);
    if (!confirmed) {
      console.log(chalk.dim('  Cancelled.'));
      return;
    }
  }

  const spinner = ora(`Revoking key ${id}...`).start();

  try {
    await api.delete(`/account/keys/${id}`);
    spinner.succeed(chalk.green(`  ✔ Key ${chalk.bold(id)} revoked.`));
  } catch (err) {
    spinner.fail(chalk.red('Failed to revoke key.'));
    const status = err.response?.status;
    if (status === 400) {
      console.log(chalk.red('  Cannot revoke the key you are currently authenticated with.'));
    } else if (status === 404) {
      console.log(chalk.red(`  Key '${id}' not found.`));
    } else if (status === 403 || status === 401) {
      permissionNotice();
    } else {
      console.log(chalk.red(`  ${formatError(err)}`));
    }
  }
}

