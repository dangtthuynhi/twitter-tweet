import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { todayKey } from './util.js';

const EMPTY = { cursor: 0, posted: [], perDay: {}, recent: [], watched: {}, retweetQueue: [] };

export function loadState() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(config.stateFile, 'utf8')) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveState(state) {
  fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

export function wasPosted(state, entryHash) {
  return state.posted.some((p) => p.hash === entryHash);
}

export function countToday(state) {
  return state.perDay[todayKey()] || 0;
}

/** So tweet da dang trong `ms` gan nhat — de chan burst theo khung nua tieng cua X. */
export function countRecent(state, ms) {
  const cutoff = Date.now() - ms;
  return (state.recent || []).filter((t) => t > cutoff).length;
}

export function recordPost(state, { entryHash, text, tweetId }) {
  const day = todayKey();
  state.posted.push({ hash: entryHash, text: text.slice(0, 120), tweetId, at: new Date().toISOString() });
  if (state.posted.length > 1000) state.posted = state.posted.slice(-1000);
  state.perDay[day] = (state.perDay[day] || 0) + 1;
  const cutoff = Date.now() - 3600e3;
  state.recent = [...(state.recent || []).filter((t) => t > cutoff), Date.now()];
  // giu lai 30 ngay gan nhat
  const keys = Object.keys(state.perDay).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete state.perDay[k];
  saveState(state);
  return state;
}
