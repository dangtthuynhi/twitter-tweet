import crypto from 'node:crypto';

const UNITS = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 };

/** "4h" | "90m" | "30s" | "1d" | "5000" (ms) -> milliseconds */
export function parseDuration(input, fallback = 0) {
  if (input == null || input === '') return fallback;
  const m = String(input).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!m) throw new Error(`Khong doc duoc thoi luong: "${input}" (vd: 30s, 45m, 4h, 1d)`);
  const n = Number(m[1]);
  const unit = (m[2] || 'ms').toLowerCase();
  return unit === 'ms' ? n : n * UNITS[unit];
}

export function humanDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hash = (text) =>
  crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** So ky tu theo cach X dem: link luon tinh 23, emoji tinh 2. */
export function tweetLength(text) {
  const withLinks = text.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
  let len = 0;
  for (const ch of withLinks) len += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏\u{1F000}-\u{1FAFF}]/u.test(ch) ? 2 : 1;
  return len;
}

export function redact(str) {
  if (!str) return str;
  return String(str).replace(/\/\/([^:@/]+):([^@/]+)@/g, '//$1:***@');
}
