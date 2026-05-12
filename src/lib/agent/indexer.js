import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { getApi } from '../api.js';

// Files/dirs to always ignore when indexing
const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build',
  'out', '.cache', 'coverage', '__pycache__', '.venv', 'venv',
  'target', '.gradle', '.idea', '.vscode', 'vendor',
]);

const MAX_FILE_BYTES   = 8_000;   // truncate large files in summary
const MAX_FILES_LISTED = 80;       // cap on files we inspect
const REINDEX_DEBOUNCE = 3_000;    // ms after last change before re-indexing

// Known manifest files that reveal framework/stack
const MANIFEST_FILES = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml',
  'go.mod', 'pom.xml', 'build.gradle', 'composer.json', 'Gemfile',
  'pubspec.yaml', 'mix.exs', 'Project.toml', 'Makefile', 'CMakeLists.txt',
  'AndroidManifest.xml', 'Info.plist', '.env.example', 'docker-compose.yml',
  'Dockerfile', 'vercel.json', 'netlify.toml', 'fly.toml',
];

export class IndexerAgent {
  constructor({ model, api } = {}) {
    this.model     = model || 'mistral';
    this.api       = api  || getApi();
    this.summary   = null;   // current index summary string
    this.watcher   = null;
    this._debounce = null;
    this._indexing = false;
    this.onUpdate  = null;   // callback(summary) when re-index completes
  }

  // ── Walk the project tree ─────────────────────────────────────────────────

  async _collectFiles(dir) {
    const results = { manifests: {}, structure: [], sampleFiles: {} };
    let count = 0;

    const walk = async (current, depth = 0) => {
      if (depth > 6 || count >= MAX_FILES_LISTED) return;
      let entries;
      try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }

      for (const entry of entries) {
        if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;
        const full    = path.join(current, entry.name);
        const rel     = path.relative(dir, full);

        if (entry.isDirectory()) {
          results.structure.push(`[DIR] ${rel}`);
          await walk(full, depth + 1);
        } else {
          count++;
          results.structure.push(`      ${rel}`);

          // Collect manifest files
          if (MANIFEST_FILES.includes(entry.name)) {
            try {
              const content = await fs.readFile(full, 'utf8');
              results.manifests[entry.name] = content.slice(0, MAX_FILE_BYTES);
            } catch {}
          }

          // Sample a few key source files (entry points, main files, configs)
          const isInteresting = /^(index|main|app|server|bot|cli|entry)\.(js|ts|py|go|rs|rb|php|java)$/.test(entry.name)
                             || /\.(config|rc)\.(js|ts|json|yaml|yml)$/.test(entry.name)
                             || entry.name === '.env.example';

          if (isInteresting && !results.sampleFiles[rel]) {
            try {
              const content = await fs.readFile(full, 'utf8');
              results.sampleFiles[rel] = content.slice(0, MAX_FILE_BYTES);
            } catch {}
          }
        }
      }
    };

    await walk(dir);
    return results;
  }

  // ── Build the index prompt ────────────────────────────────────────────────

  _buildPrompt(dir, collected) {
    const manifestSection = Object.entries(collected.manifests)
      .map(([name, content]) => `--- ${name} ---\n${content}`)
      .join('\n\n');

    const sampleSection = Object.entries(collected.sampleFiles)
      .map(([name, content]) => `--- ${name} ---\n${content}`)
      .join('\n\n');

    const structureStr = collected.structure.slice(0, MAX_FILES_LISTED).join('\n');

    return `You are the Pollina Indexer. Analyse this project and produce a structured technical summary for an autonomous coding agent.

PROJECT DIRECTORY: ${dir}

FILE TREE:
${structureStr}

KEY MANIFESTS:
${manifestSection || '(none found)'}

SAMPLE SOURCE FILES:
${sampleSection || '(none found)'}

Produce a concise structured summary covering:
1. PROJECT TYPE — what kind of project is this (web app, API, bot, mobile app, CLI, library, etc.)
2. FRAMEWORK & STACK — exact framework(s), language(s), runtime version if detectable
3. ENTRY POINTS — main file(s) to run or build the project
4. KEY DEPENDENCIES — important packages/libraries and what they do
5. BUILD & RUN — how to install deps and run/build this project
6. ARCHITECTURE — key directories, module structure, important patterns
7. DEPLOYMENT TYPE — web server / static / bot / mobile / desktop / other
8. OPEN ISSUES — any obvious misconfigurations, missing files, or potential problems

Be factual and terse. No padding. This will be injected into a coding agent's context.`;
  }

  // ── Run the index ─────────────────────────────────────────────────────────

  async index(dir, silent = false) {
    if (this._indexing) return this.summary;
    this._indexing = true;

    if (!silent) {
      process.stdout.write(chalk.dim(`  🔍 [Indexer] Analysing project with ${this.model}...`));
    }

    try {
      const collected = await this._collectFiles(dir);

      // Empty project — skip AI call
      if (collected.structure.length === 0) {
        this.summary = '[INDEXER] Empty project directory — no files to index.';
        if (!silent) console.log(chalk.dim(' empty'));
        return this.summary;
      }

      const prompt = this._buildPrompt(dir, collected);

      const res = await this.api.post('/v1/chat/completions', {
        model:    this.model,
        messages: [{ role: 'user', content: prompt }],
      });

      this.summary = res.data.choices[0].message.content;
      if (!silent) console.log(chalk.green(' done'));

    } catch (err) {
      this.summary = `[INDEXER] Index failed: ${err.message}`;
      if (!silent) console.log(chalk.yellow(` failed (${err.message})`));
    } finally {
      this._indexing = false;
    }

    return this.summary;
  }

  // ── Watch for file changes and re-index only changed files ───────────────

  watch(dir) {
    if (this.watcher) return;

    this.watcher = chokidar.watch(dir, {
      ignored:        (p) => IGNORE.has(path.basename(p)) || path.basename(p).startsWith('.'),
      persistent:     true,
      ignoreInitial:  true,
      depth:          6,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    // Track changed files between debounce windows
    const changedFiles = new Set();

    const trigger = (filePath) => {
      if (filePath) changedFiles.add(filePath);
      clearTimeout(this._debounce);
      this._debounce = setTimeout(async () => {
        const changed = [...changedFiles];
        changedFiles.clear();
        await this._partialReindex(dir, changed);
        if (this.onUpdate) this.onUpdate(this.summary, changed);
      }, REINDEX_DEBOUNCE);
    };

    this.watcher
      .on('add',    trigger)
      .on('change', trigger)
      .on('unlink', trigger);
  }

  // ── Partial re-index — only rescan changed files, patch the summary ───────

  async _partialReindex(dir, changedPaths) {
    // Bail if a full index is in progress — avoid concurrent summary writes
    if (this._indexing) {
      console.log(chalk.dim('  🔍 [Indexer] Full index in progress — skipping partial re-index'));
      return this.summary;
    }

    if (!this.summary || changedPaths.length === 0) {
      return this.index(dir, true);
    }

    const relChanged = changedPaths.map(p => path.relative(dir, p));
    process.stdout.write(chalk.dim(`\n  🔍 [Indexer] ${relChanged.length} file(s) changed — rescanning...\n`));

    // Read the changed files
    const fileDetails = [];
    for (const absPath of changedPaths) {
      const rel = path.relative(dir, absPath);
      const exists = await fs.pathExists(absPath);
      if (!exists) {
        fileDetails.push(`DELETED: ${rel}`);
        continue;
      }
      try {
        const content = (await fs.readFile(absPath, 'utf8')).slice(0, MAX_FILE_BYTES);
        fileDetails.push(`CHANGED: ${rel}\n${content}`);
      } catch {
        fileDetails.push(`CHANGED: ${rel} (unreadable)`);
      }
    }

    // Ask model to patch the existing summary
    try {
      const res = await this.api.post('/v1/chat/completions', {
        model:    this.model,
        messages: [{
          role:    'user',
          content: `You are the Pollina Indexer updating a project summary after file changes.

EXISTING SUMMARY:
${this.summary}

CHANGED FILES:
${fileDetails.join('\n\n---\n\n')}

Update the existing summary to reflect these changes. Keep all unchanged sections intact. Revise only the sections affected by the changed files. If files were deleted, remove references to them. End with a one-line note: "Changed since last index: ${relChanged.join(', ')}"

Output the complete updated summary only. No preamble.`,
        }],
      });

      this.summary = res.data.choices[0].message.content;
      console.log(chalk.dim(`  🔍 [Indexer] Summary updated (${relChanged.length} file(s))`));
    } catch {
      // Fall back to full re-index on failure
      await this.index(dir, true);
    }

    return this.summary;
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    clearTimeout(this._debounce);
  }

  // Returns the summary formatted for injection into system prompt
  getContextBlock() {
    if (!this.summary) return '';
    return `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPROJECT INDEX (auto-generated)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${this.summary}\n`;
  }
}

