import { config } from './config-store.js';

// ── Defaults ──────────────────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS = {
  // Models
  'defaults.text.model':        'openai',
  'defaults.image.model':       'zimage',
  'defaults.audio.model':       'elevenlabs',
  'defaults.video.model':       'ltx-2',
  'defaults.transcribe.model':  'whisper',
  'defaults.audio.voice':       'rachel',

  // Agent roles
  'agent.indexer.model':        'mistral',
  'agent.analyser.model':       'llama-scout',
  'agent.executor.model':       'openai',

  // Output
  'defaults.image.width':       1024,
  'defaults.image.height':      1024,
  'defaults.video.width':       1024,
  'defaults.video.height':      576,
  'defaults.video.duration':    4,
  'defaults.audio.format':      'mp3',

  // Upload behaviour
  'upload.auto':                false,
  'upload.confirm':             true,
  'upload.saveUrl':             true,

  // Confirmations
  'confirm.revoke':             true,
  'confirm.overwrite':          true,
  'confirm.highCost':           true,

  // Quota
  'quota.hourlyLimit':          null,   // null = unlimited (nullable number)

  // Display
  'display.color':              true,
  'display.spinner':            true,
  'display.timestamps':         true,

  // Streaming
  'text.stream':                false,

  // Safety
  'safety.enabled':             false,
  'safety.mode':                'privacy,secrets',
};

// Grouped for display in `pollinations settings list`
export const SETTINGS_GROUPS = [
  {
    label: 'Default Models',
    keys: [
      'defaults.text.model',
      'defaults.image.model',
      'defaults.audio.model',
      'defaults.video.model',
      'defaults.transcribe.model',
      'defaults.audio.voice',
    ],
  },
  {
    label: 'Default Output Sizes',
    keys: [
      'defaults.image.width',
      'defaults.image.height',
      'defaults.video.width',
      'defaults.video.height',
      'defaults.video.duration',
      'defaults.audio.format',
    ],
  },
  {
    label: 'Upload Behaviour',
    keys: ['upload.auto', 'upload.confirm', 'upload.saveUrl'],
  },
  {
    label: 'Confirmations',
    keys: ['confirm.revoke', 'confirm.overwrite', 'confirm.highCost'],
  },
  {
    label: 'Quota',
    keys: ['quota.hourlyLimit'],
  },
  {
    label: 'Display',
    keys: ['display.color', 'display.spinner', 'display.timestamps'],
  },
  {
    label: 'Text',
    keys: ['text.stream'],
  },
  {
    label: 'Safety',
    keys: ['safety.enabled', 'safety.mode'],
  },
];

// ── Get / Set ─────────────────────────────────────────────────────────────────

export function getSetting(key) {
  const stored = config.get(`settings.${key}`);
  return stored !== undefined ? stored : SETTINGS_DEFAULTS[key];
}

export function setSetting(key, value) {
  if (!(key in SETTINGS_DEFAULTS)) return false;

  const def = SETTINGS_DEFAULTS[key];
  let coerced;

  if (typeof def === 'boolean') {
    // Accept true/false/1/0/'true'/'false'
    coerced = value === true || value === 'true' || value === '1' || value === 1;
  } else if (typeof def === 'number') {
    coerced = Number(value);
    if (isNaN(coerced)) return false;
  } else if (def === null) {
    // Nullable number field (e.g. quota.hourlyLimit)
    if (value === null || value === 'null' || value === '' || value === 'unlimited') {
      coerced = null;
    } else {
      coerced = Number(value);
      if (isNaN(coerced)) return false;
    }
  } else {
    // String field — store as-is
    coerced = String(value);
  }

  config.set(`settings.${key}`, coerced);
  return true;
}

export function resetSetting(key) {
  config.delete(`settings.${key}`);
}

export function resetAllSettings() {
  // Collect keys first to avoid mutating while iterating
  const keys = Object.keys(config.store).filter(k => k.startsWith('settings.'));
  for (const k of keys) config.delete(k);
}

export function getAllSettings() {
  const result = {};
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    result[key] = getSetting(key);
  }
  return result;
}

export function isCustomized(key) {
  return config.get(`settings.${key}`) !== undefined;
}

