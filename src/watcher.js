import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getUserLastTweets } from './api.js';
import { log } from './logger.js';
import { humanDuration, parseDuration } from './util.js';
import { loadState, saveState } from './store.js';

/** Doc danh sach account tu WATCH_ACCOUNTS hoac content/accounts.txt */
export function loadAccounts() {
  const inline = (process.env.WATCH_ACCOUNTS || '')
    .split(',')
    .map((s) => s.trim().replace(/^@/, ''))
    .filter(Boolean);
  if (inline.length) return inline;

  const file = path.resolve(process.cwd(), 'content/accounts.txt');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim().replace(/^@/, ''))
    .filter(Boolean);
}

/**
 * Nhip kiem tra rieng cho tung account, suy tu tan suat dang that.
 * Account dang 10 bai/ngay thi check day; account dang 1 bai/tuan thi check thua.
 * Day la cho tiet kiem tien nhieu nhat — moi lan check deu mat phi.
 */
function adaptiveInterval(rec) {
  const base = config.watch.interval;
  if (!config.watch.adaptive) return base;
  const perDay = rec?.postsPerDay;
  if (perDay == null) return base; // chua biet gi -> dung nhip mac dinh
  if (perDay <= 0.2) return Math.min(parseDuration('12h'), base * 12); // ~1 bai/tuan
  if (perDay < 1) return Math.min(parseDuration('6h'), base * 8);
  if (perDay < 3) return base * 4;
  if (perDay < 10) return base * 2;
  return base; // account dang day -> giu nhip nhanh nhat
}

/** Cap nhat uoc luong tan suat dang (trung binh truot). */
function updateRate(rec, tweets) {
  if (tweets.length < 2) return rec.postsPerDay;
  const times = tweets
    .map((t) => new Date(t.createdAt).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  if (times.length < 2) return rec.postsPerDay;
  const spanDays = (times[0] - times[times.length - 1]) / 86400e3;
  if (spanDays <= 0) return rec.postsPerDay;
  const observed = times.length / spanDays;
  return rec.postsPerDay == null ? observed : rec.postsPerDay * 0.7 + observed * 0.3;
}

function matchesFilter(tweet) {
  const { include, exclude } = config.watch;
  const text = (tweet.text || '').toLowerCase();
  if (include.length && !include.some((k) => text.includes(k))) return false;
  if (exclude.length && exclude.some((k) => text.includes(k))) return false;
  return true;
}

function isOriginal(tweet) {
  // bo qua chinh retweet cua nguoi khac va reply, chi lay bai goc / quote
  if (tweet.retweeted_tweet || tweet.retweetedTweet) return false;
  if (!config.watch.includeReplies && (tweet.isReply || tweet.inReplyToId)) return false;
  return true;
}

/**
 * Quet cac account dang theo doi, day tweet moi vao hang doi retweet.
 * @returns {{checked: number, skipped: number, found: number, cost: number}}
 */
export async function pollAccounts({ force = false } = {}) {
  const accounts = loadAccounts();
  if (!accounts.length) {
    log.warn('Chua khai bao account nao. Dat WATCH_ACCOUNTS hoac tao content/accounts.txt');
    return { checked: 0, skipped: 0, found: 0, cost: 0 };
  }

  const state = loadState();
  state.watched ||= {};
  state.retweetQueue ||= [];
  const maxAge = config.watch.maxAge;
  let checked = 0, skipped = 0, found = 0, tweetsBilled = 0;

  for (const userName of accounts) {
    const rec = (state.watched[userName] ||= { lastTweetId: null, lastCheckedAt: 0, postsPerDay: null });
    const due = Date.now() - rec.lastCheckedAt;
    const every = adaptiveInterval(rec);

    if (!force && due < every) {
      skipped++;
      log.debug(`@${userName}: bo qua, con ${humanDuration(every - due)} nua moi den luot`);
      continue;
    }

    try {
      const { tweets } = await getUserLastTweets({
        userName,
        includeReplies: config.watch.includeReplies,
      });
      checked++;
      tweetsBilled += Math.max(1, tweets.length);
      rec.lastCheckedAt = Date.now();
      rec.postsPerDay = updateRate(rec, tweets);

      if (!tweets.length) { log.debug(`@${userName}: khong co tweet nao`); continue; }

      // lan dau theo doi thi chi ghi moc, khong retweet loat bai cu
      if (!rec.lastTweetId) {
        rec.lastTweetId = tweets[0].id;
        log.info(`@${userName}: bat dau theo doi tu tweet ${tweets[0].id} (bo qua bai cu)`);
        continue;
      }

      const fresh = [];
      for (const t of tweets) {
        if (String(t.id) === String(rec.lastTweetId)) break; // da gap bai cu nhat da xu ly
        if (maxAge > 0 && Date.now() - new Date(t.createdAt).getTime() > maxAge) continue;
        if (!isOriginal(t)) continue;
        if (!matchesFilter(t)) continue;
        fresh.push(t);
      }

      rec.lastTweetId = tweets[0].id;

      for (const t of fresh.reverse()) {
        if (state.retweetQueue.some((q) => q.tweetId === String(t.id))) continue;
        state.retweetQueue.push({
          tweetId: String(t.id),
          author: userName,
          text: (t.text || '').slice(0, 120),
          foundAt: new Date().toISOString(),
        });
        found++;
        log.info(`@${userName} co bai moi ${t.id}: ${(t.text || '').replace(/\n/g, ' ').slice(0, 70)}`);
      }
    } catch (e) {
      log.warn(`@${userName}: ${e.message}`);
      rec.lastCheckedAt = Date.now(); // tranh quay lien tuc vao account loi
    }
  }

  // chan hang doi phinh vo han neu nhip retweet cham hon nhip tim thay
  const cap = config.watch.queueCap;
  if (cap > 0 && state.retweetQueue.length > cap) {
    const drop = state.retweetQueue.length - cap;
    state.retweetQueue = state.retweetQueue.slice(-cap);
    log.warn(`Hang doi retweet vuot ${cap}, bo ${drop} muc cu nhat.`);
  }

  saveState(state);
  const cost = tweetsBilled * 0.00015;
  log.info(
    `Quet xong: ${checked} account da check, ${skipped} chua den luot, ${found} bai moi. ` +
      `Hang doi: ${state.retweetQueue.length}. Chi phi uoc tinh: $${cost.toFixed(5)}`
  );
  return { checked, skipped, found, cost };
}

/** Lay 1 muc khoi hang doi retweet (khong xoa — xoa sau khi retweet thanh cong). */
export function peekRetweet(state) {
  return (state.retweetQueue || [])[0] || null;
}

export function dropRetweet(state, tweetId) {
  state.retweetQueue = (state.retweetQueue || []).filter((q) => q.tweetId !== String(tweetId));
  saveState(state);
}
