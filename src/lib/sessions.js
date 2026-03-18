import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const SESSIONS_PATH = path.join(os.homedir(), '.pollinations', 'sessions.json');

async function load() {
  await fs.ensureDir(path.dirname(SESSIONS_PATH));
  if (!(await fs.pathExists(SESSIONS_PATH))) return { nextId: 1, sessions: [] };
  return fs.readJson(SESSIONS_PATH);
}

async function persist(data) {
  await fs.ensureDir(path.dirname(SESSIONS_PATH));
  await fs.writeJson(SESSIONS_PATH, data, { spaces: 2 });
}

export async function saveSession(data) {
  const store = await load();
  const id = store.nextId;
  store.sessions.push({ id, ...data, savedAt: new Date().toLocaleString() });
  store.nextId = id + 1;
  await persist(store);
  return id;
}

export async function updateSession(id, data) {
  const store = await load();
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`Session ${id} not found.`);
  store.sessions[idx] = { ...store.sessions[idx], ...data, savedAt: new Date().toLocaleString() };
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

