import fs from 'node:fs';
import path from 'node:path';
import { getTweetReplies, getRetweeters } from './api.js';
import { log } from './logger.js';

const COST_PER = 0.00015;

/** "https://x.com/ai/status/123" hoac "123" -> "123" */
export function parseTweetId(input) {
  const s = String(input).trim();
  const m = s.match(/status\/(\d+)/);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  throw new Error(`Khong doc duoc ID tu "${input}". Dua vao link tweet hoac day so ID.`);
}

/**
 * Lay toan bo reply cua mot tweet.
 *
 * Tinh phi theo tung reply tra ve, nen luon co tran `max` — mot bai viral
 * co the co hang chuc nghin reply, va khong ai muon phat hien dieu do
 * sau khi da tieu het credit.
 */
export async function fetchAllReplies(tweetIdOrUrl, { max = 500, onPage } = {}) {
  const tweetId = parseTweetId(tweetIdOrUrl);
  const all = [];
  const seen = new Set();
  let cursor = '';
  let page = 0;

  while (all.length < max) {
    const res = await getTweetReplies({ tweetId, cursor });
    page++;

    let added = 0;
    for (const r of res.replies) {
      const id = String(r.id);
      if (seen.has(id)) continue;   // API doi khi tra trung o ranh trang
      seen.add(id);
      all.push(r);
      added++;
      if (all.length >= max) break;
    }

    onPage?.({ page, total: all.length, added, cost: all.length * COST_PER });

    if (!res.hasMore || !res.nextCursor || added === 0) break;
    cursor = res.nextCursor;
  }

  return { tweetId, replies: all, cost: all.length * COST_PER, reachedCap: all.length >= max };
}

/** Rut gon mot reply xuong cac truong thuong dung. */
const slim = (r) => ({
  id: String(r.id),
  text: (r.text || '').replace(/\s+/g, ' ').trim(),
  author: r.author?.userName || null,
  name: r.author?.name || null,
  followers: r.author?.followers ?? null,
  createdAt: r.createdAt || null,
  likes: r.likeCount ?? 0,
  retweets: r.retweetCount ?? 0,
  replies: r.replyCount ?? 0,
  views: r.viewCount ?? 0,
  lang: r.lang || null,
  url: r.url || (r.author?.userName ? `https://x.com/${r.author.userName}/status/${r.id}` : null),
});

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function saveReplies(tweetId, replies, { format = 'both', outDir = 'data/replies' } = {}) {
  const dir = path.resolve(process.cwd(), outDir);
  fs.mkdirSync(dir, { recursive: true });
  const rows = replies.map(slim);
  const written = [];

  if (format === 'json' || format === 'both') {
    const f = path.join(dir, `${tweetId}.json`);
    fs.writeFileSync(f, JSON.stringify(rows, null, 2));
    written.push(f);
  }
  if (format === 'csv' || format === 'both') {
    const cols = Object.keys(slim({ author: {} }));
    const f = path.join(dir, `${tweetId}.csv`);
    fs.writeFileSync(f, [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'));
    written.push(f);
  }
  return written;
}

/** Vai con so tom tat cho nguoi doc ngay tren terminal. */
export function summarize(replies) {
  const rows = replies.map(slim);
  const byAuthor = {};
  const byLang = {};
  for (const r of rows) {
    if (r.author) byAuthor[r.author] = (byAuthor[r.author] || 0) + 1;
    if (r.lang) byLang[r.lang] = (byLang[r.lang] || 0) + 1;
  }
  return {
    total: rows.length,
    uniqueAuthors: Object.keys(byAuthor).length,
    topAuthors: Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 5),
    langs: Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 5),
    totalLikes: rows.reduce((a, r) => a + r.likes, 0),
    mostLiked: rows.slice().sort((a, b) => b.likes - a.likes)[0] || null,
  };
}

/** Lay toan bo nguoi da retweet. Cung co che tran + chong trung nhu reply. */
export async function fetchAllRetweeters(tweetIdOrUrl, { max = 1000, onPage } = {}) {
  const tweetId = parseTweetId(tweetIdOrUrl);
  const all = [];
  const seen = new Set();
  let cursor = '';
  let page = 0;

  while (all.length < max) {
    const res = await getRetweeters({ tweetId, cursor });
    page++;

    let added = 0;
    for (const u of res.users) {
      const id = String(u.id ?? u.userName);
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(u);
      added++;
      if (all.length >= max) break;
    }

    onPage?.({ page, total: all.length, added });

    if (!res.hasMore || !res.nextCursor || added === 0) break;
    cursor = res.nextCursor;
  }

  return { tweetId, users: all, reachedCap: all.length >= max };
}

const slimUser = (u) => ({
  id: String(u.id ?? ''),
  userName: u.userName || null,
  name: u.name || null,
  followers: u.followers ?? null,
  following: u.following ?? null,
  tweets: u.statusesCount ?? null,
  verified: u.isBlueVerified ?? false,
  createdAt: u.createdAt || null,
  location: u.location || null,
  url: u.userName ? `https://x.com/${u.userName}` : null,
});

export function saveRetweeters(tweetId, users, { outDir = 'data/replies' } = {}) {
  const dir = path.resolve(process.cwd(), outDir);
  fs.mkdirSync(dir, { recursive: true });
  const rows = users.map(slimUser);
  const cols = Object.keys(slimUser({}));
  const j = path.join(dir, `${tweetId}-retweeters.json`);
  const c = path.join(dir, `${tweetId}-retweeters.csv`);
  fs.writeFileSync(j, JSON.stringify(rows, null, 2));
  fs.writeFileSync(c, [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\n'));
  return [j, c];
}
