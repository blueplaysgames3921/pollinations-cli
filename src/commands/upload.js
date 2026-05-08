import { getApi } from '../lib/api.js';
import { formatError } from '../lib/api-resilience.js';
import { getSetting } from '../lib/settings.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import FormData from 'form-data';
import axios from 'axios';

const MEDIA_BASE = 'https://media.pollinations.ai';

const SUPPORTED = new Set([
  'jpg','jpeg','png','gif','webp','bmp',
  'mp4','mov','avi','webm',
  'mp3','wav','ogg','flac','m4a','aac',
]);

// ── Core upload function (used by upload command AND post-generation hook) ────

export async function uploadFile(filePath, apiKey) {
  const resolved = path.resolve(filePath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const ext  = path.extname(resolved).slice(1).toLowerCase();
  const name = path.basename(resolved);

  if (!SUPPORTED.has(ext)) {
    throw new Error(`Unsupported file type: .${ext}`);
  }

  const MIME_MAP = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp', bmp: 'image/bmp',
    mp4: 'video/mp4',  mov: 'video/quicktime', avi: 'video/x-msvideo',
    webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac',
  };

  const form = new FormData();
  form.append('file', fs.createReadStream(resolved), {
    filename:    name,
    contentType: MIME_MAP[ext] || 'application/octet-stream',
  });

  const headers = {
    ...form.getHeaders(),
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  const res = await axios.post(`${MEDIA_BASE}/upload`, form, { headers });
  return res.data; // { id, url, contentType, size, duplicate }
}

// ── Check metadata of an existing hash ───────────────────────────────────────

export async function fetchMediaMeta(hash) {
  const res = await axios.get(`${MEDIA_BASE}/${hash}/metadata`);
  return res.data;
}

// ── Upload command ────────────────────────────────────────────────────────────

export async function uploadAction(filePath, options = {}) {
  if (!filePath) {
    console.error(chalk.red('  ✖ Provide a file path. Usage: pollinations upload <file>'));
    return;
  }

  // Validate before spinner so we don't show "Uploading..." then immediately fail
  const resolved = path.resolve(filePath);
  if (!await fs.pathExists(resolved)) {
    console.error(chalk.red(`  ✖ File not found: ${resolved}`));
    return;
  }
  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    console.error(chalk.red(`  ✖ Unsupported file type: .${ext}`));
    console.error(chalk.dim(`    Supported: ${[...SUPPORTED].join(', ')}`));
    return;
  }

  const apiKey  = options.key || null;
  const spinner = ora(`Uploading ${chalk.bold(path.basename(filePath))}...`).start();

  try {
    const result = await uploadFile(filePath, apiKey);
    spinner.stop();

    if (result.duplicate) {
      console.log(chalk.yellow('  ↻ File already exists — TTL reset.'));
    } else {
      console.log(chalk.green('  ✔ Upload successful!'));
    }

    console.log('');
    console.log(chalk.bold('  URL:  ') + chalk.cyan(result.url));
    console.log(chalk.dim(`  Type: ${result.contentType}  ·  Size: ${(result.size / 1024).toFixed(1)} KB  ·  Hash: ${result.id}`));
    console.log('');

    // Pipe hint
    console.log(chalk.dim('  Use in image generation:'));
    console.log(chalk.dim(`  pollinations image "edit this" --image ${result.url}`));
    console.log('');

    // Copy to clipboard if requested
    if (options.copy) {
      try {
        const { default: clipboardy } = await import('clipboardy');
        await clipboardy.write(result.url);
        console.log(chalk.dim('  URL copied to clipboard.'));
      } catch {
        console.log(chalk.dim('  (install clipboardy to enable --copy)'));
      }
    }

  } catch (err) {
    spinner.fail(chalk.red('Upload failed.'));
    const status = err.response?.status;
    if (status === 401) {
      console.log(chalk.red('  API key required for uploads. Run: pollinations login'));
    } else if (status === 413) {
      console.log(chalk.red('  File too large. Maximum size is 10 MB.'));
    } else {
      console.log(chalk.red(`  ${err.message || formatError(err)}`));
    }
  }
}

// ── Post-generation upload hook ───────────────────────────────────────────────
// Called by image/video commands after successful generation.
// Respects upload.auto and upload.confirm settings.

export async function maybeUpload(outputPath, apiKey, options = {}) {
  const auto    = options.forceUpload || getSetting('upload.auto');
  const confirm = getSetting('upload.confirm');
  const saveUrl = getSetting('upload.saveUrl');

  // --upload flag forces it regardless of settings
  if (!auto && !options.upload) return null;

  if (auto && confirm && !options.upload) {
    // Auto mode but confirmations are on — ask
    const { default: inquirer } = await import('inquirer');
    const { go } = await inquirer.prompt([{
      type:    'confirm',
      name:    'go',
      message: `Upload ${chalk.bold(path.basename(outputPath))} to media.pollinations.ai?`,
      default: true,
    }]);
    if (!go) return null;
  }

  const spinner = ora(chalk.dim('Uploading to media.pollinations.ai...')).start();
  try {
    const result = await uploadFile(outputPath, apiKey);
    spinner.stop();

    if (saveUrl) {
      console.log(chalk.dim('  ☁  Media URL: ') + chalk.cyan(result.url));
    }
    return result.url;
  } catch (err) {
    spinner.fail(chalk.dim('Upload failed (generation was still saved locally).'));
    console.log(chalk.dim(`  ${err.message}`));
    return null;
  }
}

