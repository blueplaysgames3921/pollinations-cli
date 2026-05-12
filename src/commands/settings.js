import {
  getSetting, setSetting, resetSetting, resetAllSettings,
  getAllSettings, isCustomized, SETTINGS_DEFAULTS, SETTINGS_GROUPS,
} from '../lib/settings.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtValue(key, value) {
  if (value === null)           return chalk.dim('unlimited');
  if (typeof value === 'boolean') return value ? chalk.green('true') : chalk.red('false');
  if (typeof value === 'number')  return chalk.yellow(String(value));
  return chalk.cyan(String(value));
}

function fmtDefault(key) {
  const def = SETTINGS_DEFAULTS[key];
  if (def === null)           return chalk.dim('null');
  if (typeof def === 'boolean') return chalk.dim(String(def));
  return chalk.dim(String(def));
}

// ── List all settings ─────────────────────────────────────────────────────────

export function settingsListAction(options = {}) {
  const filter   = options.filter?.toLowerCase();
  const showOnly = options.changed;

  console.log(chalk.bold.cyan('\n⚙  POLLINATIONS SETTINGS\n'));

  for (const group of SETTINGS_GROUPS) {
    const rows = group.keys
      .filter(k => !filter || k.toLowerCase().includes(filter))
      .filter(k => !showOnly || isCustomized(k))
      .map(k => {
        const val       = getSetting(k);
        const changed   = isCustomized(k);
        const keyLabel  = changed ? chalk.bold(k) : chalk.dim(k);
        const indicator = changed ? chalk.green('●') : chalk.dim('○');
        return [indicator, keyLabel, fmtValue(k, val), fmtDefault(k)];
      });

    if (!rows.length) continue;

    console.log(chalk.bold.white(`  ${group.label}`));

    const table = new Table({
      head: [chalk.gray(''), chalk.gray('Key'), chalk.gray('Value'), chalk.gray('Default')],
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2 },
    });

    for (const r of rows) table.push(r);
    console.log(table.toString());
    console.log('');
  }

  console.log(chalk.dim('  ● = customized   ○ = using default'));
  console.log(chalk.dim('  pollinations settings set <key> <value>   to change a setting'));
  console.log(chalk.dim('  pollinations settings reset               to restore all defaults\n'));
}

// ── Get one setting ───────────────────────────────────────────────────────────

export function settingsGetAction(key) {
  if (!key) {
    console.error(chalk.red('  ✖ Provide a setting key. Run "pollinations settings list" to see all.'));
    return;
  }
  if (!(key in SETTINGS_DEFAULTS)) {
    console.error(chalk.red(`  ✖ Unknown setting: '${key}'`));
    _didYouMean(key);
    return;
  }
  const val     = getSetting(key);
  const changed = isCustomized(key);
  console.log('');
  console.log(chalk.bold(`  ${key}`));
  console.log(`  Value:   ${fmtValue(key, val)}`);
  console.log(`  Default: ${fmtDefault(key)}`);
  console.log(`  Status:  ${changed ? chalk.green('customized') : chalk.dim('using default')}`);
  console.log('');
}

// ── Set a setting ─────────────────────────────────────────────────────────────

export function settingsSetAction(key, value) {
  if (!key || value === undefined) {
    console.error(chalk.red('  ✖ Usage: pollinations settings set <key> <value>'));
    return;
  }
  if (!(key in SETTINGS_DEFAULTS)) {
    console.error(chalk.red(`  ✖ Unknown setting: '${key}'`));
    _didYouMean(key);
    return;
  }
  const ok = setSetting(key, value);
  if (!ok) {
    const def = SETTINGS_DEFAULTS[key];
    console.error(chalk.red(`  ✖ Invalid value for '${key}'. Expected ${typeof def === 'boolean' ? 'true/false' : typeof def}.`));
    return;
  }
  console.log(chalk.green(`  ✔ ${key} = ${fmtValue(key, getSetting(key))}`));
}

// ── Reset one or all settings ─────────────────────────────────────────────────

export async function settingsResetAction(key, options = {}) {
  if (key) {
    // Reset single key
    if (!(key in SETTINGS_DEFAULTS)) {
      console.error(chalk.red(`  ✖ Unknown setting: '${key}'`));
      return;
    }
    resetSetting(key);
    console.log(chalk.green(`  ✔ '${key}' reset to default: ${fmtDefault(key)}`));
    return;
  }

  // Reset all — confirm first
  if (!options.yes) {
    const { confirmed } = await inquirer.prompt([{
      type:    'confirm',
      name:    'confirmed',
      message: chalk.yellow('Reset ALL settings to defaults? This cannot be undone.'),
      default: false,
    }]);
    if (!confirmed) { console.log(chalk.dim('  Cancelled.')); return; }
  }

  resetAllSettings();
  console.log(chalk.green('  ✔ All settings reset to defaults.'));
}

// ── Interactive wizard ────────────────────────────────────────────────────────

export async function settingsWizardAction() {
  console.log(chalk.bold.cyan('\n⚙  SETTINGS WIZARD\n'));
  console.log(chalk.dim('  Walk through all settings interactively. Press Enter to keep the current value.\n'));

  for (const group of SETTINGS_GROUPS) {
    console.log(chalk.bold.white(`  ── ${group.label} ──`));

    for (const key of group.keys) {
      const current = getSetting(key);
      const def     = SETTINGS_DEFAULTS[key];

      let answer;

      if (typeof def === 'boolean') {
        const { val } = await inquirer.prompt([{
          type:    'confirm',
          name:    'val',
          message: `${key}:`,
          default: current,
        }]);
        answer = val;
      } else {
        const { val } = await inquirer.prompt([{
          type:    'input',
          name:    'val',
          message: `${key}:`,
          default: current === null ? '' : String(current),
        }]);
        answer = val === '' ? null : val;
      }

      if (answer !== current) {
        const ok = setSetting(key, answer);
        console.log(ok
          ? chalk.green(`  ✔ ${key} = ${fmtValue(key, getSetting(key))}`)
          : chalk.red(`  ✖ Invalid value for '${key}' — skipped.`)
        );
      }
    }
    console.log('');
  }

  console.log(chalk.bold.green('  Settings saved.\n'));
}

// ── Export / Import ───────────────────────────────────────────────────────────

export async function settingsExportAction(options = {}) {
  const all  = getAllSettings();
  const json = JSON.stringify(all, null, 2);

  if (options.output) {
    const { default: fs } = await import('fs-extra');
    await fs.writeFile(options.output, json);
    console.log(chalk.green(`  ✔ Settings exported to ${options.output}`));
  } else {
    console.log(json);
  }
}

export async function settingsImportAction(filePath) {
  if (!filePath) {
    console.error(chalk.red('  ✖ Provide a file path. Usage: pollinations settings import <file.json>'));
    return;
  }

  const { default: fs } = await import('fs-extra');
  if (!await fs.pathExists(filePath)) {
    console.error(chalk.red(`  ✖ File not found: ${filePath}`));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    console.error(chalk.red('  ✖ Invalid JSON file.'));
    return;
  }

  let applied = 0, skipped = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (key in SETTINGS_DEFAULTS) {
      setSetting(key, value);
      applied++;
    } else {
      skipped++;
    }
  }

  console.log(chalk.green(`  ✔ Imported ${applied} settings.`) + (skipped ? chalk.dim(` (${skipped} unknown keys skipped)`) : ''));
}

// ── Fuzzy "did you mean" hint ─────────────────────────────────────────────────

function _didYouMean(key) {
  const all   = Object.keys(SETTINGS_DEFAULTS);
  const close = all.filter(k => k.includes(key.split('.').pop()) || key.includes(k.split('.').pop()));
  if (close.length) {
    console.log(chalk.dim(`  Did you mean: ${close.slice(0, 3).join(', ')}?`));
  }
  console.log(chalk.dim(`  Run 'pollinations settings list' to see all valid keys.`));
}

