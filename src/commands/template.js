import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { textAction } from './text.js';

const TEMPLATE_DIR = path.join(os.homedir(), '.pollinations', 'templates');

// Reserved commander option names that must not collide with template vars
const RESERVED_OPTION_NAMES = new Set(['model', 'stream', 'key', 'help', 'version']);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Bug T4 fix: validate name is safe (no path traversal)
function validateName(name) {
  if (!name || !/^[\w-]+$/.test(name)) {
    throw new Error(
      `Invalid template name: '${name}'. Use only letters, numbers, hyphens and underscores.`
    );
  }
}

async function loadAll() {
  await fs.ensureDir(TEMPLATE_DIR);
  const files = await fs.readdir(TEMPLATE_DIR);
  const templates = [];
  for (const f of files.filter(f => f.endsWith('.json'))) {
    try {
      const data = await fs.readJson(path.join(TEMPLATE_DIR, f));
      templates.push({ name: path.basename(f, '.json'), ...data });
    } catch {}
  }
  return templates;
}

function extractVars(content) {
  return [...new Set([...content.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
}

function applyVars(content, vars) {
  let out = content;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export async function templateSave(name, content, options = {}) {
  if (!name || !content) {
    console.error(chalk.red('  ✖ Usage: pollinations template save <name> "<content>"'));
    console.log(chalk.dim('  Use {variable} placeholders for dynamic values.'));
    console.log(chalk.dim('  Example: pollinations template save review "Review this {lang} code: {code}"'));
    return;
  }

  // Bug T4 fix: validate name before use in path
  try { validateName(name); } catch (e) {
    console.error(chalk.red(`  ✖ ${e.message}`));
    return;
  }

  await fs.ensureDir(TEMPLATE_DIR);
  const filePath = path.join(TEMPLATE_DIR, `${name}.json`);
  const vars     = extractVars(content);

  // Warn if any var names collide with reserved option names
  const colliding = vars.filter(v => RESERVED_OPTION_NAMES.has(v));
  if (colliding.length) {
    console.log(chalk.yellow(`  ⚠ Variable name(s) ${colliding.map(v => `{${v}}`).join(', ')} collide with reserved CLI flags.`));
    console.log(chalk.dim('  These will be filled interactively, not from --flags.'));
  }

  const exists = await fs.pathExists(filePath);
  if (exists && !options.force) {
    const { overwrite } = await inquirer.prompt([{
      type:    'confirm',
      name:    'overwrite',
      message: `Template '${name}' already exists. Overwrite?`,
      default: false,
    }]);
    if (!overwrite) { console.log(chalk.dim('  Cancelled.')); return; }
  }

  const description = options.description || '';
  await fs.writeJson(filePath, { content, vars, description, createdAt: new Date().toISOString() }, { spaces: 2 });

  console.log(chalk.green(`  ✔ Template '${name}' saved.`));
  if (vars.length) {
    console.log(chalk.dim(`  Variables: ${vars.map(v => `{${v}}`).join(', ')}`));
  } else {
    console.log(chalk.dim('  No variables detected — this template runs as-is.'));
  }
}

export async function templateRun(name, options = {}) {
  // Bug T4 fix: validate name
  try { validateName(name); } catch (e) {
    console.error(chalk.red(`  ✖ ${e.message}`));
    return;
  }

  const filePath = path.join(TEMPLATE_DIR, `${name}.json`);
  if (!await fs.pathExists(filePath)) {
    console.error(chalk.red(`  ✖ Template '${name}' not found.`));
    const all = await loadAll();
    if (all.length) console.log(chalk.dim(`  Available: ${all.map(t => t.name).join(', ')}`));
    return;
  }

  const template = await fs.readJson(filePath);

  // Bug T5 fix: use extractVars if saved vars list is empty (stale)
  const vars = template.vars?.length ? template.vars : extractVars(template.content);

  // Bug T2 fix: don't pull var values from options object directly —
  // only read from options.vars (a dedicated namespace) to avoid collisions
  // with reserved flag names like --model, --stream, --key.
  const resolved = {};
  const missing  = [];

  for (const v of vars) {
    // Check dedicated --var-NAME flag first, then prompt
    const varKey = `var_${v}`; // commander converts --var-foo to varFoo... use a map
    if (options[`var${v.charAt(0).toUpperCase()}${v.slice(1)}`] !== undefined) {
      resolved[v] = options[`var${v.charAt(0).toUpperCase()}${v.slice(1)}`];
    } else {
      missing.push(v);
    }
  }

  if (missing.length) {
    console.log(chalk.bold.cyan(`\n  Template: ${name}`));
    if (template.description) console.log(chalk.dim(`  ${template.description}`));
    console.log('');

    for (const v of missing) {
      const { value } = await inquirer.prompt([{
        type:     'input',
        name:     'value',
        message:  `{${v}}:`,
        validate: val => val.trim().length > 0 ? true : `${v} cannot be empty`,
      }]);
      resolved[v] = value;
    }
  }

  const final  = applyVars(template.content, resolved);
  const model  = options.model || undefined;
  const stream = options.stream || false;

  console.log(chalk.dim(`\n  Running template '${name}'...\n`));
  await textAction(final, { model, stream });
}

export async function templateList() {
  const templates = await loadAll();

  if (!templates.length) {
    console.log(chalk.yellow('\n  No templates saved yet.'));
    console.log(chalk.dim('  Create one: pollinations template save <name> "<content with {vars}>"\n'));
    return;
  }

  console.log(chalk.bold.cyan(`\n📋 TEMPLATES  `) + chalk.dim(`${templates.length} saved\n`));

  const table = new Table({
    head: [chalk.gray('Name'), chalk.gray('Variables'), chalk.gray('Description'), chalk.gray('Content preview')],
    colWidths: [18, 22, 22, 36],
    wordWrap: true,
  });

  for (const t of templates) {
    const vars    = (t.vars || []).map(v => `{${v}}`).join(', ') || chalk.dim('none');
    const preview = t.content.length > 34 ? t.content.slice(0, 33) + '…' : t.content;
    table.push([
      chalk.bold(t.name),
      chalk.yellow(vars),
      chalk.dim(t.description || '—'),
      chalk.dim(preview),
    ]);
  }

  console.log(table.toString());
  console.log(chalk.dim('  Run: pollinations template run <name>'));
  console.log(chalk.dim('  Delete: pollinations template delete <name>\n'));
}

export async function templateDelete(name) {
  if (!name) {
    console.error(chalk.red('  ✖ Provide a template name.'));
    return;
  }

  // Bug T4 fix
  try { validateName(name); } catch (e) {
    console.error(chalk.red(`  ✖ ${e.message}`));
    return;
  }

  const filePath = path.join(TEMPLATE_DIR, `${name}.json`);
  if (!await fs.pathExists(filePath)) {
    console.error(chalk.red(`  ✖ Template '${name}' not found.`));
    return;
  }

  const { confirmed } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirmed',
    message: `Delete template '${name}'?`,
    default: false,
  }]);

  if (!confirmed) { console.log(chalk.dim('  Cancelled.')); return; }

  await fs.remove(filePath);
  console.log(chalk.green(`  ✔ Template '${name}' deleted.`));
}

export async function templateShow(name) {
  // Bug T4 fix
  try { validateName(name); } catch (e) {
    console.error(chalk.red(`  ✖ ${e.message}`));
    return;
  }

  const filePath = path.join(TEMPLATE_DIR, `${name}.json`);
  if (!await fs.pathExists(filePath)) {
    console.error(chalk.red(`  ✖ Template '${name}' not found.`));
    return;
  }

  const t    = await fs.readJson(filePath);
  const vars = t.vars?.length ? t.vars : extractVars(t.content); // Bug T5 fix

  console.log(chalk.bold.cyan(`\n  Template: ${name}`));
  if (t.description) console.log(chalk.dim(`  ${t.description}`));
  if (t.createdAt)   console.log(chalk.dim(`  Created: ${new Date(t.createdAt).toLocaleString()}`));
  if (vars.length)   console.log(chalk.dim(`  Variables: ${vars.map(v => `{${v}}`).join(', ')}`));
  console.log('');
  console.log(chalk.white(t.content));
  console.log('');
}
