import path from 'node:path';
import { loadEnv } from './env.js';
import { parseDuration } from './util.js';

loadEnv();

const bool = (v, def = false) => {
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(v).toLowerCase());
};

const DAY_ALIASES = {
  sun: 0, sunday: 0, cn: 0,
  mon: 1, monday: 1, t2: 1,
  tue: 2, tuesday: 2, t3: 2,
  wed: 3, wednesday: 3, t4: 3,
  thu: 4, thursday: 4, t5: 4,
  fri: 5, friday: 5, t6: 5,
  sat: 6, saturday: 6, t7: 6,
};

/** "fri" | "mon,wed,fri" | "t6" | "1-5" -> Set cac thu theo chuan JS (0=CN..6=T7) */
function parseDays(raw) {
  if (!raw || !String(raw).trim()) return null; // null = moi ngay
  const out = new Set();
  for (const part of String(raw).toLowerCase().split(',')) {
    const tok = part.trim();
    if (!tok) continue;
    const range = tok.match(/^(\d)\s*-\s*(\d)$/); // 1-5 = T2..T6 (ISO)
    if (range) {
      for (let i = Number(range[1]); i <= Number(range[2]); i++) out.add(i % 7);
      continue;
    }
    if (/^\d$/.test(tok)) { out.add(Number(tok) % 7); continue; }
    if (tok in DAY_ALIASES) { out.add(DAY_ALIASES[tok]); continue; }
    throw new Error(`POST_DAYS khong hieu "${tok}" (dung: fri | mon,wed,fri | t6 | 1-5)`);
  }
  return out.size ? out : null;
}

function parseHours(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) throw new Error(`POST_HOURS sai dinh dang: "${raw}" (vd: 7-23)`);
  const [from, to] = [Number(m[1]), Number(m[2])];
  if (from > 23 || to > 24) throw new Error(`POST_HOURS ngoai khoang: "${raw}"`);
  return { from, to };
}

const root = process.cwd();

export const config = {
  apiKey: process.env.TWITTERAPI_KEY || '',
  baseUrl: process.env.TWITTERAPI_BASE_URL || 'https://api.twitterapi.io',

  account: {
    userName: process.env.TW_USERNAME || '',
    email: process.env.TW_EMAIL || '',
    password: process.env.TW_PASSWORD || '',
    totpSecret: process.env.TW_TOTP_SECRET || '',
    proxy: process.env.TW_PROXY || '',
    // Cookie tu lay tu trinh duyet, dung de bo qua buoc /twitter/user_login_v2.
    // Dang: "auth_token=xxx; ct0=yyy"
    loginCookies: (process.env.TW_LOGIN_COOKIES || '').trim(),
  },

  tweetsFile: path.resolve(root, process.env.TWEETS_FILE || 'content/tweets.txt'),
  stateFile: path.resolve(root, 'data/state.json'),
  sessionFile: path.resolve(root, 'data/session.json'),

  interval: parseDuration(process.env.POST_INTERVAL || '4h'),
  jitter: parseDuration(process.env.POST_JITTER || '0'),
  hours: parseHours(process.env.POST_HOURS),
  days: parseDays(process.env.POST_DAYS),
  maxPerDay: Number(process.env.MAX_PER_DAY || 0),
  order: (process.env.ORDER || 'sequential').toLowerCase(),
  loopQueue: bool(process.env.LOOP_QUEUE, false),
  postOnStart: bool(process.env.POST_ON_START, true),
  spread: bool(process.env.SPREAD, false),
  maxPerWindow: Number(process.env.MAX_PER_WINDOW || 0),

  source: (process.env.SOURCE || 'file').toLowerCase(),   // file | watch | both
  watch: {
    interval: parseDuration(process.env.WATCH_INTERVAL || '30m'),
    adaptive: bool(process.env.WATCH_ADAPTIVE, true),
    maxAge: parseDuration(process.env.WATCH_MAX_AGE || '6h'),
    includeReplies: bool(process.env.WATCH_INCLUDE_REPLIES, false),
    include: (process.env.WATCH_INCLUDE || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean),
    exclude: (process.env.WATCH_EXCLUDE || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean),
    queueCap: Number(process.env.WATCH_QUEUE_CAP || 200),
  },

  dryRun: bool(process.env.DRY_RUN, false),
  sessionTtl: parseDuration(process.env.SESSION_TTL || '7d'),
};

/** Nem loi neu thieu cau hinh bat buoc. `needAccount` = false khi chi doc queue. */
export function assertConfig({ needAccount = true } = {}) {
  const missing = [];
  if (!config.apiKey) missing.push('TWITTERAPI_KEY');
  if (needAccount) {
    if (!config.account.password) missing.push('TW_PASSWORD');
    if (!config.account.userName && !config.account.email) missing.push('TW_USERNAME hoac TW_EMAIL');
    if (!config.account.proxy) missing.push('TW_PROXY');
  }
  if (missing.length) {
    throw new Error(
      `Thieu bien moi truong: ${missing.join(', ')}\n` +
        `   Copy .env.example thanh .env roi dien vao.`
    );
  }
  if (!['file', 'watch', 'both'].includes(config.source)) {
    throw new Error(`SOURCE phai la "file", "watch" hoac "both", dang la "${config.source}"`);
  }
  if (!['sequential', 'random'].includes(config.order)) {
    throw new Error(`ORDER phai la "sequential" hoac "random", dang la "${config.order}"`);
  }
}

/** So ms cua khung gio cho phep trong 1 ngay (ca ngay neu khong dat POST_HOURS). */
export function windowMs() {
  if (!config.hours) return 24 * 3600e3;
  const { from, to } = config.hours;
  const h = from <= to ? to - from : 24 - from + to;
  return h * 3600e3;
}

/** Nhip dang thuc te. SPREAD=true thi tu rai deu MAX_PER_DAY trong khung gio. */
export function effectiveInterval() {
  if (config.spread && config.maxPerDay > 0) {
    return Math.max(5_000, Math.floor(windowMs() / config.maxPerDay));
  }
  return config.interval;
}
