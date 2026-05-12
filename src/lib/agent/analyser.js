import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { getApi } from '../api.js';

const DEFAULT_VISION_MODEL  = 'llama-scout';
const FALLBACK_VISION_MODEL = 'openai-fast';
const MAX_TEXT_BYTES        = 12_000;

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const BINARY_EXTS = new Set([
  'mp3', 'mp4', 'wav', 'webm', 'ogg', 'flac', 'm4a',
  'zip', 'tar', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib',
  'wasm', 'bin', 'dat',
]);

export class AnalyserAgent {
  constructor({ model, api } = {}) {
    this.model = model || DEFAULT_VISION_MODEL;
    this.api   = api   || getApi();
  }

  // ── Detect file paths mentioned in a message ──────────────────────────────

  static extractPaths(message) {
    const patterns = [
      // Quoted paths
      /["']([^"']+\.(?:js|ts|jsx|tsx|py|go|rs|rb|java|php|cs|cpp|c|h|json|yaml|yml|toml|md|txt|env|sh|bat|sql|html|css|scss|less|vue|svelte|png|jpg|jpeg|gif|webp|pdf|log|lock))["']/gi,
      // Unquoted relative paths ./foo.js — always use match[1] (the capture group)
      /(?:^|[\s,])(\.[/\\][^\s,;]+\.(?:js|ts|jsx|tsx|py|go|rs|rb|java|php|cs|cpp|c|h|json|yaml|yml|toml|md|txt|env|sh|sql|html|css|scss|vue|svelte|png|jpg|jpeg|gif|webp|pdf|log))/gim,
      // Unix absolute paths
      /(\/(?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|jsx|tsx|py|go|rs|rb|java|php|cs|cpp|c|h|json|yaml|yml|toml|md|txt|env|sh|sql|html|css|png|jpg|jpeg|gif|webp|pdf|log))/g,
    ];

    const found = new Set();
    for (const re of patterns) {
      for (const match of message.matchAll(re)) {
        // Always use match[1] — avoids picking up leading whitespace/commas from match[0]
        const p = match[1]?.trim();
        if (p && !p.startsWith('http')) found.add(p);
      }
    }
    return [...found];
  }

  // ── Encode image as base64, optionally downscaled ─────────────────────────

  async _encodeImage(filePath, maxWidth = 512) {
    const buf  = await fs.readFile(filePath);
    const ext  = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'image/jpeg'
               : ext === 'svg' ? 'image/svg+xml'
               : `image/${ext}`;

    let finalBuf = buf;
    if (maxWidth !== null) {
      try {
        const { default: sharp } = await import('sharp');
        const meta = await sharp(buf).metadata();
        if (meta.width && meta.width > maxWidth) {
          finalBuf = await sharp(buf)
            .resize(maxWidth, null, { withoutEnlargement: true })
            .toBuffer();
        }
      } catch {
        // sharp not installed — send original
      }
    }

    return { base64: finalBuf.toString('base64'), mime };
  }

  // ── Analyse a single file ─────────────────────────────────────────────────
  // modelOverride is used for fallback — does NOT mutate this.model

  async analyseFile(filePath, retried = false, modelOverride = null) {
    const resolved = path.resolve(filePath);
    const model    = modelOverride || this.model; // call-local, never mutates instance

    if (!await fs.pathExists(resolved)) {
      return `[ANALYSER] File not found: ${filePath}`;
    }

    const ext  = path.extname(resolved).slice(1).toLowerCase();
    const name = path.basename(resolved);
    const stat = await fs.stat(resolved);
    const size = stat.size;

    // ── Binary ────────────────────────────────────────────────────────────
    if (BINARY_EXTS.has(ext)) {
      return `[ANALYSER — ${name}]\nType: ${ext.toUpperCase()} binary file\nSize: ${(size / 1024).toFixed(1)} KB\n(Content not readable — binary format)`;
    }

    // ── Image ─────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      try {
        const { base64, mime } = await this._encodeImage(resolved, 512);

        const res = await this.api.post('/v1/chat/completions', {
          model,
          messages: [{
            role:    'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
              {
                type: 'text',
                text: `You are the Pollina Analyser. Describe this image with technical precision for a coding agent.\nCover: UI layout and components (if it's a UI screenshot), colours and design system, text/labels visible, structural patterns, data shown, any errors or issues visible, and what a developer would need to know to implement or debug based on this image.\nIf the image is too small or low resolution to give a useful description, respond with exactly: NEEDS_FULL_RESOLUTION\nBe terse and structured. Use bullet points. No padding.`,
              },
            ],
          }],
        });

        let description = res.data.choices[0].message.content;

        if (description.trim() === 'NEEDS_FULL_RESOLUTION') {
          const full = await this._encodeImage(resolved, null);
          const res2 = await this.api.post('/v1/chat/completions', {
            model,
            messages: [{
              role:    'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${full.mime};base64,${full.base64}` } },
                { type: 'text', text: 'Describe this image with technical precision for a coding agent. UI layouts, visible text, errors, design patterns. Terse bullet points.' },
              ],
            }],
          });
          description = res2.data.choices[0].message.content;
        }

        return `[ANALYSER — ${name} (image)]\n${description}`;

      } catch (err) {
        const isWrongModel = err.response?.status === 400 || err.response?.status === 422;
        if (isWrongModel && !retried) {
          // Fallback is call-local — this.model stays unchanged for future calls
          console.log(chalk.dim(`  [Analyser] '${model}' doesn't support vision — falling back to ${FALLBACK_VISION_MODEL}`));
          return this.analyseFile(filePath, true, FALLBACK_VISION_MODEL);
        }
        return `[ANALYSER — ${name}] Image analysis failed: ${err.message}`;
      }
    }

    // ── Text / code / config / document ───────────────────────────────────
    try {
      const raw       = await fs.readFile(resolved, 'utf8');
      const content   = raw.slice(0, MAX_TEXT_BYTES);
      const truncated = raw.length > MAX_TEXT_BYTES;

      const res = await this.api.post('/v1/chat/completions', {
        model,
        messages: [{
          role:    'user',
          content: `You are the Pollina Analyser. Summarise this file for a coding agent.\n\nFILE: ${name} (${ext || 'text'}, ${(size / 1024).toFixed(1)} KB${truncated ? ', truncated' : ''})\n\nCONTENT:\n${content}\n\nProduce a structured technical summary covering:\n- File type and purpose\n- Key exports, classes, functions, or components defined\n- Dependencies or imports referenced\n- Configuration values present (mask any secrets)\n- Any obvious issues, TODOs, or deprecated patterns\n- What a developer needs to know to work with or modify this file\n\nBe concise. Use bullet points. No padding.`,
        }],
      });

      return `[ANALYSER — ${name}]\n${res.data.choices[0].message.content}`;

    } catch (err) {
      return `[ANALYSER — ${name}] Analysis failed: ${err.message}`;
    }
  }

  // ── Analyse all files found in a message ─────────────────────────────────

  async analyseMessage(message) {
    const paths = AnalyserAgent.extractPaths(message);
    if (!paths.length) return null;

    // Run in parallel — allSettled so one failure doesn't abort the rest
    // Log silently during work, emit a single summary line after
    const settlements = await Promise.allSettled(
      paths.map(p => this.analyseFile(p))
    );

    // Emit summary after all are done (avoids stdout interleaving)
    const names = paths.map(p => path.basename(p)).join(', ');
    console.log(chalk.dim(`  🔬 [Analyser] Processed: ${names}`));

    return settlements.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : `[ANALYSER — ${path.basename(paths[i])}] Failed: ${s.reason?.message || s.reason}`
    ).join('\n\n');
  }
}

