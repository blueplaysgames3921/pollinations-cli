import fs from 'fs-extra';
import { execa } from 'execa';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { getApi } from '../api.js';

function safePath(userPath, root = process.cwd()) {
  const resolved = path.resolve(root, userPath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!resolved.startsWith(rootWithSep) && resolved !== root) {
    throw new Error(`Path traversal blocked: '${userPath}' escapes the working directory.`);
  }
  return resolved;
}

// ── Export tracker — reads named exports from a JS/TS file ───────────────────

function extractNamedExports(code) {
  const exports = new Set();
  // export function/class/const/let/var name
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/g)) {
    exports.add(m[1]);
  }
  // export { a, b, c }
  for (const m of code.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const name of m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim())) {
      if (name) exports.add(name);
    }
  }
  // export default (just flag it)
  if (/export\s+default\b/.test(code)) exports.add('default');
  return exports;
}

// ── Lightweight lint pass ─────────────────────────────────────────────────────

function quickLint(code, filePath) {
  const issues = [];
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext)) return issues;

  const lines = code.split('\n');

  // Collect declared identifiers (vars, functions, imports)
  const declared = new Map(); // name -> line number

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Import declarations — track imported names
    const importMatch = line.match(/^import\s+(?:\{([^}]+)\}|(\w+)(?:\s*,\s*\{([^}]+)\})?)\s+from/);
    if (importMatch) {
      const names = [
        ...(importMatch[1] ? importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()) : []),
        ...(importMatch[2] ? [importMatch[2]] : []),
        ...(importMatch[3] ? importMatch[3].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()) : []),
      ].filter(Boolean);
      for (const n of names) {
        if (n && n !== '_') declared.set(n, lineNo);
      }
      continue;
    }

    // Variable declarations
    for (const m of line.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) {
      declared.set(m[1], lineNo);
    }

    // Function declarations
    const fnMatch = line.match(/(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/);
    if (fnMatch) {
      const name = fnMatch[1] || fnMatch[2];
      if (name) declared.set(name, lineNo);
    }
  }

  // Unused variables/imports (declared but never used elsewhere)
  const JS_BUILTINS = new Set([
    'console', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
    'Promise', 'Error', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math',
    'Date', 'JSON', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'undefined', 'null', 'true', 'false',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'URL', 'URLSearchParams',
    'fetch', 'Response', 'Request', 'Headers', 'FormData', 'Blob', 'File',
    'ReadableStream', 'WritableStream', 'TransformStream',
  ]);

  for (const [name, lineNo] of declared.entries()) {
    if (!JS_BUILTINS.has(name) && name.length > 1 && !name.startsWith('_')) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const codeWithoutDecl = lines.filter((_, i) => i !== lineNo - 1).join('\n');
      const usageCount = (codeWithoutDecl.match(new RegExp(`\\b${escapedName}\\b`, 'g')) || []).length;
      if (usageCount === 0) {
        issues.push({ type: 'unused', line: lineNo, message: `'${name}' is declared but never used` });
      }
    }
  }

  // Dead code after return/throw (simple single-line heuristic)
  for (let i = 0; i < lines.length - 1; i++) {
    const trimmed = lines[i].trim();
    if (/^(return|throw)\s/.test(trimmed) && lines[i + 1].trim() && !/^[}\])]/.test(lines[i + 1].trim())) {
      issues.push({ type: 'unreachable', line: i + 2, message: 'Unreachable code after return/throw' });
    }
  }

  return issues;
}

export class ToolManager {
  constructor() {
    // Track exports per file for change detection
    this._exportSnapshots = new Map(); // filePath -> Set<string>

    this.tools = {
      read_file: async ({ filePath }) => {
        const full = safePath(filePath);
        return fs.readFile(full, 'utf8');
      },

      write_file: async ({ filePath, content }) => {
        const full = safePath(filePath);
        await fs.ensureDir(path.dirname(full));

        // ── Snapshot exports BEFORE write ─────────────────────────────
        const ext = path.extname(full).slice(1).toLowerCase();
        const isJS = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext);
        let prevExports = new Set();
        if (isJS && await fs.pathExists(full)) {
          try {
            const prev = await fs.readFile(full, 'utf8');
            prevExports = extractNamedExports(prev);
            this._exportSnapshots.set(full, prevExports);
          } catch {}
        }

        await fs.writeFile(full, content);

        // ── Lint pass ─────────────────────────────────────────────────
        const lintIssues = quickLint(content, filePath);
        const lintNote = lintIssues.length
          ? `\nLint: ${lintIssues.map(i => `L${i.line} ${i.message}`).join('; ')}`
          : '';

        // ── Export change detection ───────────────────────────────────
        let exportNote = '';
        if (isJS && prevExports.size > 0) {
          const newExports = extractNamedExports(content);
          const removed = [...prevExports].filter(e => !newExports.has(e));
          const added   = [...newExports].filter(e => !prevExports.has(e));
          if (removed.length) {
            exportNote += `\n⚠ Export change detected: removed [${removed.join(', ')}] — other files importing these will break.`;
          }
          if (added.length) {
            exportNote += `\n+ New exports: [${added.join(', ')}]`;
          }
        }

        return `Wrote ${content.length} chars to: ${full}${lintNote}${exportNote}`;
      },

      edit_file: async ({ filePath, operation, lineNumber, endLine, content, oldText, newText }) => {
        const full = safePath(filePath);
        const raw = await fs.readFile(full, 'utf8');

        // Snapshot exports before edit
        const ext = path.extname(full).slice(1).toLowerCase();
        const isJS = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext);
        let prevExports = new Set();
        if (isJS) {
          prevExports = extractNamedExports(raw);
          this._exportSnapshots.set(full, prevExports);
        }

        let newContent;
        if (operation === 'replace_text') {
          if (oldText === undefined || newText === undefined) {
            throw new Error('replace_text requires both oldText and newText parameters.');
          }
          if (!raw.includes(oldText)) {
            throw new Error(`replace_text: oldText not found in file. Verify exact whitespace and characters by reading the file first.`);
          }
          newContent = raw.split(oldText).join(newText);
          await fs.writeFile(full, newContent);
        } else {
          const lines = raw.split('\n');
          if (operation === 'insert_after') {
            if (!lineNumber) throw new Error('insert_after requires lineNumber (1-indexed).');
            lines.splice(Math.min(lineNumber, lines.length), 0, content);
          } else if (operation === 'insert_before') {
            if (!lineNumber) throw new Error('insert_before requires lineNumber (1-indexed).');
            lines.splice(lineNumber - 1, 0, content);
          } else if (operation === 'delete_lines') {
            if (!lineNumber) throw new Error('delete_lines requires lineNumber (1-indexed).');
            const from  = lineNumber - 1;
            const count = (endLine || lineNumber) - (lineNumber - 1);
            lines.splice(from, count);
          } else if (operation === 'replace_lines') {
            if (!lineNumber) throw new Error('replace_lines requires lineNumber (1-indexed).');
            if (content === undefined) throw new Error('replace_lines requires content.');
            const from  = lineNumber - 1;
            const count = (endLine || lineNumber) - (lineNumber - 1);
            lines.splice(from, count, ...content.split('\n'));
          } else {
            throw new Error(`Unknown operation '${operation}'. Valid: insert_after, insert_before, delete_lines, replace_lines, replace_text`);
          }
          newContent = lines.join('\n');
          await fs.writeFile(full, newContent);
        }

        // Export change detection after edit
        let exportNote = '';
        if (isJS && prevExports.size > 0 && newContent) {
          const newExports = extractNamedExports(newContent);
          const removed    = [...prevExports].filter(e => !newExports.has(e));
          if (removed.length) {
            exportNote = `\n⚠ Export change detected: removed [${removed.join(', ')}] — other files importing these will break.`;
          }
        }

        const lines = (newContent || raw).split('\n');
        return `${operation} applied to ${full} (now ${lines.length} lines)${exportNote}`;
      },

      move_file: async ({ oldPath, newPath }) => {
        const src  = safePath(oldPath);
        const dest = safePath(newPath);
        await fs.ensureDir(path.dirname(dest));
        await fs.move(src, dest, { overwrite: true });
        return `Moved: ${src} → ${dest}`;
      },

      delete_file: async ({ filePath }) => {
        if (!filePath || filePath === '.' || filePath === './') {
          throw new Error('Refusing to delete current directory.');
        }
        const full = safePath(filePath);
        const gitDir = path.join(process.cwd(), '.git');
        if (full === gitDir || full.startsWith(gitDir + path.sep)) {
          throw new Error('Deleting .git is permanently blocked.');
        }
        await fs.remove(full);
        return `Deleted: ${full}`;
      },

      list_files: async ({ dirPath } = {}) => {
        const full    = safePath(dirPath || '.');
        const entries = await fs.readdir(full, { withFileTypes: true });
        return entries
          .map(e => (e.isDirectory() ? `[DIR] ${e.name}` : `      ${e.name}`))
          .join('\n');
      },

      shell_exec: async ({ command }) => {
        const result = await execa('sh', ['-c', command], {
          cwd:     process.cwd(),
          env:     { ...process.env, ...this._envVars },
          reject:  false,
          timeout: 120_000,
        });
        const out      = [result.stdout, result.stderr].filter(Boolean).join('\n');
        const exitNote = result.exitCode !== 0 ? `\n(exit code ${result.exitCode})` : '';
        return (out + exitNote) || `(exit code ${result.exitCode})`;
      },

      test_syntax: async ({ code, language }) => {
        const ext = (language || 'js').replace(/^\./, '').toLowerCase();
        const tmp = path.join(os.tmpdir(), `pollina_syntax_${Date.now()}.${ext}`);
        try {
          await fs.writeFile(tmp, code);
          if (['js', 'mjs', 'cjs'].includes(ext)) {
            const { stdout, stderr, exitCode } = await execa(
              'node', ['--check', tmp],
              { reject: false, timeout: 10_000 }
            );

            // Also run quick lint
            const lintIssues = quickLint(code, `file.${ext}`);
            const lintStr = lintIssues.length
              ? `\nLint warnings:\n${lintIssues.map(i => `  L${i.line}: ${i.message}`).join('\n')}`
              : '';

            await fs.remove(tmp);
            return exitCode !== 0
              ? `SYNTAX_ERROR:\n${stderr}${lintStr}`
              : `SYNTAX_OK${lintStr}`;
          }
          if (ext === 'json') {
            JSON.parse(code);
            await fs.remove(tmp);
            return 'SYNTAX_OK';
          }
          await fs.remove(tmp);
          return `SKIPPED: no checker for '${ext}'`;
        } catch (e) {
          await fs.remove(tmp).catch(() => {});
          return `SYNTAX_ERROR: ${e.message}`;
        }
      },

      generate_image: async ({ prompt, fileName, model = 'flux', width = 1024, height = 1024 }) => {
        const name = fileName || `asset_${Date.now()}.png`;
        const full = safePath(name);
        await fs.ensureDir(path.dirname(full));
        const api  = getApi();
        const seed = Math.floor(Math.random() * 1e9);
        const url  = `/image/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true`;
        const res  = await api.get(url, { responseType: 'stream' });
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(full);
          res.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        return `Image saved at: ${full}`;
      },

      capture_asset: async ({ url, fileName }) => {
        if (!url) throw new Error('capture_asset requires a url parameter.');
        const ext  = path.extname(url.split('?')[0]) || '.bin';
        const name = fileName || `capture_${Date.now()}${ext}`;
        const full = safePath(name);
        await fs.ensureDir(path.dirname(full));
        const res = await axios.get(url, { responseType: 'stream', timeout: 30_000 });
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(full);
          res.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        return `Downloaded and saved at: ${full}`;
      },
    };

    // .env values injected into shell_exec environment
    this._envVars = {};
  }

  // Called by orchestrator after .env is parsed
  setEnvVars(vars) {
    this._envVars = vars;
  }

  getToolDefinitions() {
    return [
      {
        name: 'read_file',
        description: 'Read the full content of a file. Always call this before edit_file to see current line numbers and content.',
        parameters: { filePath: 'string' }
      },
      {
        name: 'write_file',
        description: 'Create a new file or completely overwrite an existing one. Content must be COMPLETE — never truncate, never use placeholders. Runs lint and export-change checks automatically. For targeted changes to existing files, prefer edit_file.',
        parameters: { filePath: 'string', content: 'string — full file content, never truncated' }
      },
      {
        name: 'edit_file',
        description: 'Make surgical edits to an existing file. Always read_file first. Runs export-change detection automatically.\nOperations: insert_after, insert_before, delete_lines, replace_lines, replace_text.',
        parameters: {
          filePath: 'string',
          operation: 'string — insert_after | insert_before | delete_lines | replace_lines | replace_text',
          lineNumber: 'number — 1-indexed. required for all except replace_text',
          endLine: 'number — 1-indexed end of range for delete_lines/replace_lines',
          content: 'string — text to insert or replace. may contain \\n',
          oldText: 'string — exact text to find. for replace_text only',
          newText: 'string — replacement. for replace_text only'
        }
      },
      {
        name: 'move_file',
        description: 'Move or rename a file or directory.',
        parameters: { oldPath: 'string', newPath: 'string' }
      },
      {
        name: 'delete_file',
        description: 'Delete a file or directory. .git is permanently blocked.',
        parameters: { filePath: 'string' }
      },
      {
        name: 'list_files',
        description: 'List files and directories. Directories shown with [DIR] prefix.',
        parameters: { dirPath: 'string — defaults to current directory' }
      },
      {
        name: 'shell_exec',
        description: 'Run a shell command. .env variables are automatically available. Stdout and stderr both returned.',
        parameters: { command: 'string' }
      },
      {
        name: 'test_syntax',
        description: 'Validate JS or JSON for syntax errors AND lint issues WITHOUT writing to disk. Returns SYNTAX_OK or SYNTAX_ERROR plus any lint warnings. Use BEFORE write_file on any .js or .json file.',
        parameters: { code: 'string', language: 'string — js, mjs, json, etc.' }
      },
      {
        name: 'generate_image',
        description: 'Generate an image via Pollinations API and save locally.',
        parameters: { prompt: 'string', fileName: 'string', model: 'string — default flux', width: 'number', height: 'number' }
      },
      {
        name: 'capture_asset',
        description: 'Download a remote URL and save locally. Required after MCP image generation.',
        parameters: { url: 'string', fileName: 'string' }
      },
    ];
  }

  async call(name, args) {
    if (!this.tools[name]) {
      throw new Error(`Tool '${name}' not found. Available: ${Object.keys(this.tools).join(', ')}`);
    }
    return this.tools[name](args);
  }
}

