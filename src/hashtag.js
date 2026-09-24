import fs from 'node:fs';
import path from 'node:path';
import { advancedSearch } from './api.js';
import { log } from './logger.js';

const FILE = path.resolve(process.cwd(), 'data/hashtags.json');
const TWEETS_FILE = path.resolve(process.cwd(), 'data/tweets.ndjson');
const COST_PER_TWEET = 0.00015;

/**
 * Luu lai chinh nhung tweet da lay mau.
 *
 * Tien da tra roi luc API tra ve chung — khong luu thi phi. Giu lai thi moi
 * phan tich ve sau (tac gia, tuong tac, tu khoa, gio cao diem...) deu mien phi
 * va khong phai goi API lan nua.
 *
 * Chi giu truong can dung, khong giu text day du: ~90 byte/tweet, tuc khoang
 * 63 MB mot nam o nhip 15 phut — khong dang ke.
 * Dinh dang NDJSON de chi can noi them vao cuoi file, khong phai doc lai het.
 */
function appendTweets(tag, tweets) {
  if (!tweets.length) return;
  const seen = loadSeenIds();
  const lines = [];
  for (const t of tweets) {
    const id = String(t.id);
    if (seen.has(id)) continue;   // chong ghi trung khi cua so quet chong lan
    seen.add(id);
    lines.push(JSON.stringify({
      id,
      tag,
      at: parseTime(t.createdAt),
      author: t.author?.userName || null,
      followers: t.author?.followers || 0,
      likes: t.likeCount || 0,
      rts: t.retweetCount || 0,
      replies: t.replyCount || 0,
      views: t.viewCount || 0,
      lang: t.lang || null,
    }));
  }
  if (!lines.length) return;
  fs.mkdirSync(path.dirname(TWEETS_FILE), { recursive: true });
  fs.appendFileSync(TWEETS_FILE, lines.join('\n') + '\n');
}

let _seen = null;
function loadSeenIds() {
  if (_seen) return _seen;
  _seen = new Set();
  try {
    for (const line of fs.readFileSync(TWEETS_FILE, 'utf8').split('\n')) {
      if (!line) continue;
      const i = line.indexOf('"id":"');
      if (i !== -1) _seen.add(line.slice(i + 6, line.indexOf('"', i + 6)));
    }
  } catch { /* chua co file */ }
  return _seen;
}

/** Doc lai toan bo tweet da luu (cho phan tich ngoai luong quet). */
export function loadStoredTweets({ since = 0 } = {}) {
  try {
    return fs.readFileSync(TWEETS_FILE, 'utf8').split('\n')
      .filter(Boolean).map((l) => JSON.parse(l)).filter((t) => t.at >= since);
  } catch { return []; }
}

export function loadData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { tags: {} };
  }
}

export function saveData(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

/** "Thu Sep 24 07:08:54 +0000 2026" -> milliseconds */
const parseTime = (s) => {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const fmtNum = (n) => (n == null ? '?' : n.toLocaleString('en-US'));

/**
 * Quet TANG DAN mot hashtag.
 *
 * Cach ngay tho la lay N trang moi nhat roi suy ra toc do — nhung lan quet sau
 * lai nhan ve phan lon chinh nhung tweet da tra tien o lan truoc. Voi hashtag
 * it bai thi gan nhu tra lai tu dau moi gio.
 *
 * Thay vao do dung `since_time` = moc quet lan truoc, chi lay bai MOI:
 *   - Tra ve chua day trang  -> dem duoc CHINH XAC, chi tra tien dung so bai do
 *     (hashtag it bai: $0.00015 thay vi $0.006 — re hon 40 lan)
 *   - Tra ve day trang       -> cua so con nhieu hon the, quay ve uoc luong
 *     tu mat do thoi gian cua chinh trang do
 *
 * Luu y: `has_next_page` cua API luon bang true, ke ca khi chi co 1 tweet —
 * nen dung "so tweet < 20" lam dau hieu trang chua day.
 */
const PAGE = 20;

/**
 * Quet mot hashtag bang CUA SO THICH UNG.
 *
 * Y tuong: thay vi hoi mot cua so rong roi nhan ve day trang 20 bai, ta chon
 * do rong cua so sao cho ky vong roi vao khoang `targetSample` bai. Loi ich kep:
 *
 *   - Tra tien dung so bai can. Hashtag 4 trieu/thang, muon +/-5% mot ngay thi
 *     chi can ~5 bai moi lan quet -> \$2/thang thay vi \$8.64.
 *   - Chinh xac hon. Cach cu suy toc do tu khoang cach thoi gian giua cac bai,
 *     ma createdAt chi co do phan giai giay nen sai so lon khi hashtag dong.
 *     O day do rong cua so la DO MINH CHON nen biet chinh xac — chi con sai so
 *     dem thuan tuy (~1/sqrt(n)).
 *
 * Cua so tu dieu chinh sau moi lan: day trang thi thu hep, rong rang thi noi ra.
 */
export async function scanTag(tag, { maxPages = 4, queryType = 'Latest', targetSample = 20 } = {}) {
  const base = tag.startsWith('#') || tag.includes(':') ? tag : `#${tag}`;

  const data = loadData();
  const rec = data.tags[base];
  const last = rec?.snapshots?.at(-1);
  const now = Date.now();

  // Cua so toi da = tu lan quet truoc (chan tren 6h de khoi tran tien sau khi
  // cron nghi lau). Cua so toi thieu = 1 giay, do since_time tinh bang giay.
  const maxWindowMs = Math.min(last ? now - last.at : 3600e3, 6 * 3600e3);

  // Suy do rong can thiet tu toc do do duoc lan truoc.
  let windowMs = maxWindowMs;
  if (last?.ratePerHour > 0) {
    const needed = (targetSample / last.ratePerHour) * 3600e3;
    windowMs = Math.max(1000, Math.min(maxWindowMs, Math.round(needed)));
  }

  const runQuery = async (winMs) => {
    const sinceSec = Math.floor((now - winMs) / 1000);
    const untilSec = Math.floor(now / 1000);
    const query = `${base} since_time:${sinceSec} until_time:${untilSec}`;
    const out = [];
    let cursor = '';
    for (let i = 0; i < maxPages; i++) {
      const res = await advancedSearch({ query, queryType, cursor });
      out.push(...res.tweets);
      cursor = res.nextCursor;
      if (res.tweets.length < PAGE || !cursor) return { tweets: out, exhausted: true };
    }
    return { tweets: out, exhausted: false };
  };

  let { tweets: collected, exhausted } = await runQuery(windowMs);

  // Cua so doan hut qua -> chua lay het. Thu lai voi cua so hep hon mot lan
  // (khong lap nhieu, moi lan thu deu mat tien).
  if (!exhausted && windowMs > 2000) {
    windowMs = Math.max(1000, Math.round(windowMs / 4));
    ({ tweets: collected, exhausted } = await runQuery(windowMs));
  }

  const windowH = windowMs / 3600e3;
  let ratePerHour = null;
  let marginPct = null;

  if (exhausted) {
    // Dem duoc het cua so -> ty le = so bai / do rong cua so, ma do rong thi
    // biet chinh xac. Sai so con lai chi la sai so dem (Poisson).
    ratePerHour = Math.round(collected.length / windowH);
    marginPct = collected.length > 0 ? Math.round((1 / Math.sqrt(collected.length)) * 100) : null;
  } else {
    // Van tran trang -> quay ve suy tu mat do thoi gian cua mau
    const times = collected.map((t) => parseTime(t.createdAt)).filter(Boolean).sort((a, b) => b - a);
    const spanMs = times.length > 1 ? times[0] - times.at(-1) : 0;
    if (spanMs > 0) {
      ratePerHour = Math.round((times.length / spanMs) * 3600000);
      marginPct = Math.round((1 / Math.sqrt(times.length)) * 100);
    }
  }

  const authors = {};
  for (const t of collected) {
    const u = t.author?.userName;
    if (!u) continue;
    authors[u] ||= { posts: 0, followers: t.author.followers || 0, likes: 0 };
    authors[u].posts++;
    authors[u].likes += t.likeCount || 0;
  }

  const snapshot = {
    at: now,
    sampled: collected.length,
    windowH: Math.round(windowH * 10000) / 10000,
    windowS: Math.round(windowMs / 1000),
    ratePerHour,
    exact: exhausted,
    marginPct,
    reliable: collected.length >= 5,
    likes: sum(collected, (t) => t.likeCount),
    retweets: sum(collected, (t) => t.retweetCount),
    replies: sum(collected, (t) => t.replyCount),
    views: sum(collected, (t) => t.viewCount),
    authors,
    cost: Math.max(collected.length, 1) * COST_PER_TWEET,
    topTweet: (() => {
      const best = [...collected].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))[0];
      return best && { id: best.id, text: (best.text || '').slice(0, 160), author: best.author?.userName, likes: best.likeCount || 0 };
    })(),
  };

  appendTweets(base, collected);

  const d2 = loadData();
  const r2 = (d2.tags[base] ||= { snapshots: [] });
  r2.snapshots.push(snapshot);
  if (r2.snapshots.length > 2000) r2.snapshots = r2.snapshots.slice(-2000);
  saveData(d2);

  log.ok(
    `${base}: ${exhausted ? '' : '~'}${fmtNum(ratePerHour)} bai/gio ` +
      `(${collected.length} bai / cua so ${snapshot.windowS}s${marginPct ? `, +/-${marginPct}%` : ''}` +
      `${exhausted ? '' : ', TRAN TRANG'}) — $${snapshot.cost.toFixed(5)}`
  );
  return snapshot;
}

/** Danh sach hashtag dang theo doi, tu WATCH_HASHTAGS hoac da co trong du lieu. */
export function loadTags() {
  const inline = (process.env.WATCH_HASHTAGS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('#') || s.includes(':') ? s : `#${s}`));
  if (inline.length) return inline;
  return Object.keys(loadData().tags);
}

export async function scanAll(opts = {}) {
  const tags = loadTags();
  if (!tags.length) {
    log.warn('Chua khai bao hashtag. Dat WATCH_HASHTAGS=#abc,#xyz trong .env');
    return { total: 0, cost: 0 };
  }
  let cost = 0;
  for (const tag of tags) {
    try {
      const s = await scanTag(tag, opts);
      if (s) cost += s.cost;
    } catch (e) {
      log.error(`${tag}: ${e.message}`);
    }
  }
  log.info(`Quet xong ${tags.length} hashtag. Tong chi phi lan nay: $${cost.toFixed(5)}`);
  return { total: tags.length, cost };
}
