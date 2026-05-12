import chalk from 'chalk';

// Errors that will never succeed on retry — don't waste attempts
const NO_RETRY_CODES = new Set([400, 401, 403, 404, 422]);

// ── Global type defaults (used when no specific fallback exists) ──────────────
const TYPE_DEFAULTS = {
  text:       'openai',      // GPT-5.4 Nano — not paidOnly
  image:      'flux',        // Flux Schnell — not paidOnly
  audio:      'qwen-tts',    // Qwen3-TTS Flash — not paidOnly TTS
  'audio-stt': 'whisper',   // Whisper Large V3 — not paidOnly STT
  video:      'ltx-2',       // LTX-2.3 — only non-paidOnly video model
};

// ── Per-model fallbacks (paid/expensive → cheaper equivalent) ────────────────
// Only models where a meaningful same-type downgrade exists.
// Derived from the official model list — isPaidOnly models fall back to
// the nearest non-paidOnly model of the same type and capability profile.
const MODEL_FALLBACKS = {
  // ── Text ──
  'claude-opus-4.7':       'claude-fast',       // Opus → Haiku
  'claude-large':          'claude-fast',
  'claude':                'claude-fast',
  'gpt-5.5':               'openai-large',       // top GPT → GPT-5.4
  'openai-large':          'openai-fast',        // GPT-5.4 → GPT-5 Nano
  'gemini-large':          'gemini',             // Gemini Pro → Gemini Flash
  'gemini':                'gemini-fast',        // Gemini Flash → Flash Lite
  'gemini-flash-lite-3.1': 'gemini-fast',
  'grok-large':            'grok',              // Grok Reasoning → Non-Reasoning
  'grok':                  'openai-fast',
  'deepseek-pro':          'deepseek',
  'deepseek':              'openai-fast',
  'mistral-large':         'mistral',
  'qwen-coder-large':      'qwen-coder',
  'qwen-large':            'openai-fast',
  'llama-maverick':        'llama',
  'perplexity-reasoning':  'perplexity-fast',
  'kimi':                  'openai-fast',
  'kimi-k2.6':             'openai-fast',
  'midijourney-large':     'midijourney',
  'openai-audio-large':    'openai-audio',
  'gemini-search':         'perplexity-fast',   // search → search (cheaper)

  // ── Image ──
  'gptimage-large':        'gptimage',          // GPT Image 1.5 → Mini
  'gptimage':              'zimage',            // GPT Image Mini → Z-Image
  'gpt-image-2':           'zimage',
  'p-image':               'zimage',
  'p-image-edit':          'kontext',           // edit → Kontext (also vision)
  'grok-imagine-pro':      'grok-imagine',
  'grok-imagine':          'flux',
  'nanobanana-pro':        'nanobanana',
  'nanobanana-2':          'nanobanana',
  'nanobanana':            'flux',
  'seedream5':             'zimage',
  'wan-image-pro':         'wan-image',
  'wan-image':             'flux',
  'nova-canvas':           'flux',
  'qwen-image':            'flux',

  // ── Audio ──
  // STT fallbacks
  'universal-3-pro':       'universal-2',
  'scribe':                'whisper',
  // TTS fallbacks
  'elevenlabs':            'qwen-tts',
  'qwen-tts-instruct':     'qwen-tts',
  'elevenmusic':           'acestep',           // music → music

  // ── Video ──
  'veo':                   'ltx-2',
  'wan':                   'ltx-2',
  'wan-fast':              'ltx-2',
  'seedance-pro':          'seedance',
  'seedance':              'ltx-2',
  'p-video':               'ltx-2',
  'grok-video-pro':        'ltx-2',
  'nova-reel':             'ltx-2',
};

function friendlyError(err) {
  const status = err.response?.status;
  const apiMsg  = err.response?.data?.error?.message
               || err.response?.data?.error
               || err.response?.data?.message
               || null;

  if (!status) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'Request timed out. The server took too long to respond.';
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return 'Could not reach Pollinations API. Check your internet connection.';
    }
    return `Network error: ${err.message}`;
  }

  switch (status) {
    case 400: return `Bad request${apiMsg ? `: ${apiMsg}` : '. Check your parameters.'}`;
    case 401: return 'API key is invalid or missing. Run: pollinations login';
    case 402: return 'Pollen credits exhausted. Free daily grant may also be spent.';
    case 403: return `Access denied${apiMsg ? `: ${apiMsg}` : '. Your key may lack permissions for this endpoint.'}`;
    case 404: return `Endpoint not found${apiMsg ? `: ${apiMsg}` : '. The model or resource may not exist.'}`;
    case 422: return `Invalid parameters${apiMsg ? `: ${apiMsg}` : '. Check model name and request options.'}`;
    case 429: return 'Rate limited by Pollinations API. Retrying...';
    case 500: return `Pollinations server error${apiMsg ? `: ${apiMsg}` : '. This is on their end — retrying.'}`;
    case 502: return 'Pollinations gateway error (502). Retrying...';
    case 503: return 'Pollinations service temporarily unavailable. Retrying...';
    case 504: return 'Pollinations gateway timed out (504). Retrying...';
    default:  return apiMsg || `Unexpected error (HTTP ${status})`;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Wraps an axios API call with:
 *  - Retry logic (up to maxRetries attempts, exponential backoff)
 *  - Free model fallback on 402:
 *      1. Per-model fallback from MODEL_FALLBACKS map
 *      2. Global type default from TYPE_DEFAULTS if no specific fallback
 *      3. Fails cleanly if already on the global default
 *  - Human-readable error messages
 *
 * @param {Function} apiFn         - async fn(api, model) => axios response
 * @param {object}   api           - axios instance from getApi()
 * @param {string}   model         - the model being used
 * @param {object}   opts
 * @param {number}   opts.maxRetries  - default 3
 * @param {boolean}  opts.silent      - suppress retry/fallback logs
 * @param {string}   opts.type        - 'text'|'image'|'audio'|'video' for global default fallback
 */
export async function resilientCall(apiFn, api, model, opts = {}) {
  const maxRetries = opts.maxRetries ?? 3;
  const silent     = opts.silent ?? false;
  const cmdType    = opts.type ?? null;
  let attempt      = 0;
  let currentModel = model;
  let usedFallback = false;

  while (true) {
    attempt++;
    try {
      return await apiFn(api, currentModel);
    } catch (err) {
      const status  = err.response?.status;
      const message = friendlyError(err);

      // 402: try fallback once
      if (status === 402 && !usedFallback) {
        const specific     = MODEL_FALLBACKS[currentModel];
        const globalDef    = cmdType ? TYPE_DEFAULTS[cmdType] : null;
        const fallback     = specific || globalDef;
        const isAlreadyDef = globalDef && currentModel === globalDef;

        if (fallback && !isAlreadyDef) {
          if (!silent) {
            console.log(chalk.yellow(`\n  ⚠ Pollen credits exhausted for '${currentModel}'.`));
            if (!specific && globalDef) {
              console.log(chalk.dim(`  No specific fallback — using global ${cmdType} default: ${chalk.bold(fallback)}`));
            } else {
              console.log(chalk.dim(`  → Falling back to: ${chalk.bold(fallback)}`));
            }
            console.log('');
          }
          currentModel = fallback;
          usedFallback = true;
          attempt = 0;
          continue;
        }

        // Already on the cheapest available — give up
        throw Object.assign(
          new Error('Pollen credits exhausted and no free fallback is available for this model.'),
          { friendly: true, status: 402 }
        );
      }

      // Non-retryable
      if (NO_RETRY_CODES.has(status) || status === 402) {
        throw Object.assign(new Error(message), { friendly: true, status });
      }

      // Out of retries
      if (attempt >= maxRetries) {
        throw Object.assign(
          new Error(`${message} (failed after ${maxRetries} attempts)`),
          { friendly: true, status }
        );
      }

      // Retryable — wait and try again
      const delay = Math.pow(2, attempt - 1) * 1000;
      if (!silent) {
        console.log(chalk.dim(`  ↻ ${message} Retrying in ${delay / 1000}s... (attempt ${attempt}/${maxRetries})`));
      }
      await sleep(delay);
    }
  }
}

/**
 * Formats a caught error for CLI output.
 */
export function formatError(err) {
  if (err.friendly) return err.message;
  return friendlyError(err);
}
