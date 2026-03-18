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

export class ToolManager {
  constructor() {
    this.tools = {
      read_file: async ({ filePath }) => {
        const full = safePath(filePath);
        return fs.readFile(full, 'utf8');
      },

      write_file: async ({ filePath, content }) => {
        const full = safePath(filePath);
        await fs.ensureDir(path.dirname(full));
        await fs.writeFile(full, content);
        return `Wrote ${content.length} chars to: ${full}`;
      },

      edit_file: async ({ filePath, operation, lineNumber, endLine, content, oldText, newText }) => {
        const full = safePath(filePath);
        const raw = await fs.readFile(full, 'utf8');

        if (operation === 'replace_text') {
          if (oldText === undefined || newText === undefined) {
            throw new Error('replace_text requires both oldText and newText parameters.');
          }
          if (!raw.includes(oldText)) {
            throw new Error(`replace_text: oldText not found in file. Verify exact whitespace and characters by reading the file first.`);
          }
          await fs.writeFile(full, raw.split(oldText).join(newText));
          return `replace_text completed in: ${full}`;
        }

        const lines = raw.split('\n');

        if (operation === 'insert_after') {
          if (!lineNumber) throw new Error('insert_after requires lineNumber (1-indexed).');
          lines.splice(Math.min(lineNumber, lines.length), 0, content);
        } else if (operation === 'insert_before') {
          if (!lineNumber) throw new Error('insert_before requires lineNumber (1-indexed).');
          lines.splice(lineNumber - 1, 0, content);
        } else if (operation === 'delete_lines') {
          if (!lineNumber) throw new Error('delete_lines requires lineNumber (1-indexed).');
          const from = lineNumber - 1;
          const count = (endLine || lineNumber) - (lineNumber - 1);
          lines.splice(from, count);
        } else if (operation === 'replace_lines') {
          if (!lineNumber) throw new Error('replace_lines requires lineNumber (1-indexed).');
          if (content === undefined) throw new Error('replace_lines requires content.');
          const from = lineNumber - 1;
          const count = (endLine || lineNumber) - (lineNumber - 1);
          lines.splice(from, count, ...content.split('\n'));
        } else {
          throw new Error(`Unknown operation '${operation}'. Valid: insert_after, insert_before, delete_lines, replace_lines, replace_text`);
        }

        await fs.writeFile(full, lines.join('\n'));
        return `${operation} applied to ${full} (now ${lines.length} lines)`;
      },

      move_file: async ({ oldPath, newPath }) => {
        const src = safePath(oldPath);
        const dest = safePath(newPath);
        await fs.ensureDir(path.dirname(dest));
        await fs.move(src, dest, { overwrite: true });
        return `Moved: ${src} → ${dest}`;
      },

      delete_file: async ({ filePath }) => {
        const full = safePath(filePath);
        if (full.includes(`${path.sep}.git`) || full.endsWith('.git')) {
          throw new Error('Deleting .git is permanently forbidden.');
        }
        await fs.remove(full);
        return `Deleted: ${full}`;
      },

      list_files: async ({ dirPath = '.' }) => {
        const full = safePath(dirPath);
        const entries = await fs.readdir(full, { withFileTypes: true });
        if (!entries.length) return '(empty directory)';
        return entries
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
          .map(e => `${e.isDirectory() ? '[DIR] ' : '      '}${e.name}`)
          .join('\n');
      },

      shell_exec: async ({ command }) => {
        if (/rm\s+-rf\s+\/(?!\S)|mkfs|dd\s+if=|format\s+[a-zA-Z]:/.test(command)) {
          throw new Error(`Dangerous command blocked: ${command}`);
        }
        const { stdout, stderr } = await execa(command, { shell: true, reject: false, timeout: 60_000 });
        const out = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
        return out.trim() || '(no output)';
      },

      test_syntax: async ({ code, language = 'js' }) => {
        const ext = language.replace(/^\./, '').toLowerCase();
        const tmp = path.join(os.tmpdir(), `pollina_check_${Date.now()}.${ext}`);
        await fs.writeFile(tmp, code);
        try {
          if (['js', 'mjs', 'cjs'].includes(ext)) {
            const { stderr } = await execa('node', ['--check', tmp], { reject: false });
            await fs.remove(tmp);
            return stderr ? `SYNTAX_ERROR:\n${stderr}` : 'SYNTAX_OK';
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
        const api = getApi();
        const seed = Math.floor(Math.random() * 1e9);
        const url = `/image/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true`;
        const res = await api.get(url, { responseType: 'stream' });
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
        const ext = path.extname(url.split('?')[0]) || '.bin';
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
      }
    };
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
        description: 'Create a new file or completely overwrite an existing one. The content field must be the COMPLETE final file — never truncate, never use placeholders like "// rest of code". For targeted changes to existing files, prefer edit_file instead.',
        parameters: { filePath: 'string', content: 'string — full file content, never truncated' }
      },
      {
        name: 'edit_file',
        description: 'Make surgical edits to an existing file without rewriting it. Always read_file first to see current line numbers. All line numbers are 1-indexed.\nOperations:\n  insert_after  — insert content as a new line after lineNumber\n  insert_before — insert content as a new line before lineNumber\n  delete_lines  — delete lines lineNumber through endLine (inclusive)\n  replace_lines — replace lines lineNumber through endLine with content (can be multiline)\n  replace_text  — find exact oldText anywhere in the file and replace all occurrences with newText',
        parameters: {
          filePath: 'string',
          operation: 'string — insert_after | insert_before | delete_lines | replace_lines | replace_text',
          lineNumber: 'number — 1-indexed. required for all operations except replace_text',
          endLine: 'number — 1-indexed end of range for delete_lines/replace_lines. defaults to lineNumber',
          content: 'string — text to insert or replacement lines. for replace_lines may contain \\n',
          oldText: 'string — exact text to find in the file. for replace_text only',
          newText: 'string — replacement text. for replace_text only'
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
        description: 'List files and directories. Directories shown with [DIR] prefix. Use before read_file or write_file to verify paths.',
        parameters: { dirPath: 'string — defaults to current directory' }
      },
      {
        name: 'shell_exec',
        description: 'Run a shell command: npm install, git status, node script.js, etc. Stdout and stderr are both returned. Destructive system-level patterns are hard-blocked.',
        parameters: { command: 'string' }
      },
      {
        name: 'test_syntax',
        description: 'Validate JS or JSON code for syntax errors WITHOUT writing to disk. Use this BEFORE write_file on any .js or .json file. Returns SYNTAX_OK or SYNTAX_ERROR with details. A SYNTAX_ERROR from this will prevent the write from proceeding.',
        parameters: { code: 'string — code to validate', language: 'string — js, mjs, json, etc.' }
      },
      {
        name: 'generate_image',
        description: 'Generate an image via Pollinations API and save it locally. Include directory prefix in fileName (e.g. assets/hero.png).',
        parameters: { prompt: 'string', fileName: 'string', model: 'string — default flux', width: 'number — default 1024', height: 'number — default 1024' }
      },
      {
        name: 'capture_asset',
        description: 'Download a remote URL and save it locally. Required after MCP image generation because those URLs are transient and expire.',
        parameters: { url: 'string', fileName: 'string — local path including directory prefix' }
      }
    ];
  }

  async call(name, args) {
    if (!this.tools[name]) {
      throw new Error(`Tool '${name}' not found. Available: ${Object.keys(this.tools).join(', ')}`);
    }
    return this.tools[name](args);
  }
}
