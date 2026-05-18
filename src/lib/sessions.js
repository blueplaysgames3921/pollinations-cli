import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getApi } from './api.js';

const SESSIONS_PATH = path.join(os.homedir(), '.pollinations', 'sessions.json');

// ── Storage ───────────────────────────────────────────────────────────────────

async function load() {
  await fs.ensureDir(path.dirname(SESSIONS_PATH));
  if (!(await fs.pathExists(SESSIONS_PATH))) return { nextId: 1, sessions: [] };
  try {
    const store = await fs.readJson(SESSIONS_PATH);
    // Bug S4 fix: guard against wrong schema (e.g. plain array from old version)
    if (!store || typeof store !== 'object' || !Array.isArray(store.sessions)) {
      console.error('  ⚠ sessions.json has unexpected format — starting fresh.');
      return { nextId: 1, sessions: [] };
    }
    return store;
  } catch {
    console.error('  ⚠ sessions.json corrupted — starting fresh.');
    return { nextId: 1, sessions: [] };
  }
}

async function persist(data) {
  await fs.ensureDir(path.dirname(SESSIONS_PATH));
  await fs.writeJson(SESSIONS_PATH, data, { spaces: 2 });
}

// Bug S5: strip base64 image data from messages before sending to API
function sanitiseMessages(messages) {
  return messages.map(m => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map(block => {
        if (block.type === 'image_url' && block.image_url?.url?.startsWith('data:')) {
          return { type: 'image_url', image_url: { url: '[image omitted]' } };
        }
        return block;
      }),
    };
  });
}

// ── AI-generated session title ────────────────────────────────────────────────

export async function generateTitle(messages, directory, type) {
  const firstMsg = messages.find(m => m.role === 'user');
  if (!firstMsg) return '(untitled)';

  // Bug S1 fix: content may be an array (vision messages)
  const rawContent = firstMsg.content;
  const firstUser  = Array.isArray(rawContent)
    ? (rawContent.find(p => p.type === 'text')?.text || '')
    : (rawContent || '');

  if (!firstUser) return '(untitled)';

  const dirName = directory ? path.basename(directory) : null;
  const context = [
    firstUser.slice(0, 200),
    dirName ? `Project directory: ${dirName}` : null,
    `Session type: ${type}`,
  ].filter(Boolean).join('\n');

  try {
    const api = getApi();
    const res = await api.post('/v1/chat/completions', {
      model:    'openai-fast',
      messages: [{
        role:    'user',
        content: `Generate a short, descriptive title (max 6 words) for this ${type} session based on what the user was working on. Output ONLY the title — no quotes, no punctuation at the end, no explanation.\n\n${context}`,
      }],
    });
    const raw = res.data.choices[0].message.content.trim();
    const title = raw.replace(/^["']|["']$/g, '').trim().slice(0, 60);
    return title || makeTitle(firstUser);
  } catch {
    return makeTitle(firstUser);
  }
}

// ── Context dump — AI summarises what happened ────────────────────────────────

export async function generateContextDump(messages, type) {
  const meaningful = messages.filter(m =>
    m.role !== 'system' ||
    m.content?.startsWith?.('[EXECUTOR]') ||
    m.content?.startsWith?.('[INDEXER]') ||
    m.content?.startsWith?.('Tool Result') ||
    m.content?.startsWith?.('Architect Blueprint') ||
    m.content?.startsWith?.('Researcher Findings')
  );

  if (meaningful.length < 2) return null;

  // Bug S2 fix: strip base64 image data before sending to avoid huge payloads
  const safe = sanitiseMessages(meaningful.slice(-40));

  try {
    const api = getApi();
    const res = await api.post('/v1/chat/completions', {
      model:    'openai-fast',
      messages: [{
        role:    'user',
        content: `Summarise this ${type} session concisely for someone reviewing it later. Cover:\n- What was the goal\n- What was accomplished (files created/changed, problems solved)\n- Key decisions made\n- Current state / what's left\n\nBe factual and terse. Max 8 bullet points. No padding.\n\nSession:\n${JSON.stringify(safe)}`,
      }],
    });
    return res.data.choices[0].message.content.trim();
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveSession(data) {
  const store = await load();
  const id    = store.nextId;
  store.sessions.push({ id, ...data, savedAt: new Date().toISOString() });
  store.nextId = id + 1;
  await persist(store);
  return id;
}

export async function updateSession(id, data) {
  const store = await load();
  const idx   = store.sessions.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`Session ${id} not found.`);
  const existing = store.sessions[idx];
  store.sessions[idx] = {
    ...existing,
    ...data,
    // Bug S3 fix: use strict non-empty check so '' doesn't allow overwrite
    title:   (existing.title != null && existing.title !== '') ? existing.title : data.title,
    savedAt: new Date().toISOString(),
  };
  await persist(store);
}

export async function getSession(id) {
  const store = await load();
  return store.sessions.find(s => s.id === id) || null;
}

export async function listSessions() {
  const store = await load();
  return store.sessions;
}

export function makeTitle(text) {
  if (!text) return '(untitled)';
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > 52 ? clean.slice(0, 52) + '…' : clean;
}
