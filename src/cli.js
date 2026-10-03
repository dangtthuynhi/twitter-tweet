#!/usr/bin/env node
import path from 'node:path';
import fsSync from 'node:fs';
import { config, assertConfig, effectiveInterval, windowMs } from './config.js';
import { log } from './logger.js';
import { hash, humanDuration, tweetLength, redact } from './util.js';
import { getLoginCookies, clearSession, sessionInfo, cookieAge } from './session.js';
import { loadQueue, pickNext } from './source.js';
import { loadState, wasPosted, countToday } from './store.js';
import { postEntry, postAndRecord } from './poster.js';
import { run } from './scheduler.js';
import { check } from './check.js';
import { pollAccounts, loadAccounts } from './watcher.js';
import { loadProxyList, rankProxies } from './proxies.js';
import { ipwatch } from './ipwatch.js';
import { scanAll } from './hashtag.js';
import { buildDashboard } from './dashboard.js';
import { collectTrend } from './trend.js';
import { buildTrendDashboard } from './trend-dashboard.js';
import { fetchAllReplies, saveReplies, summarize, parseTweetId,
         fetchAllRetweeters, saveRetweeters } from './replies.js';
import { checkEntry, resolveEntries, saveEntries } from './giveaway.js';
import { totp, validateSecret } from './totp.js';
import { parseDuration } from './util.js';

function parseArgs(argv) {
  const opts = { _: [], media: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { opts._.push(a); continue; }
    const key = a.slice(2);
    if (['dry', 'force', 'help', 'all', 'report', 'only-html'].includes(key)) { opts[key] = true; continue; }
    const val = argv[++i];
    if (key === 'media') opts.media.push(val);
    else opts[key] = val;
  }
  return opts;
}

const HELP = `
auto-tweet — bot dang tweet tu dong qua twitterapi.io

  node src/cli.js <lenh> [tuy chon]

Lenh:
  check                  Kiem tra .env + proxy + han muc TRUOC khi chay that
  proxies                Thu ca list proxy, cham diem, goi y cai nen dung
  ipwatch [--report]     Ghi lai IP public cua duong truyen (de do do on dinh)
  hashtag [--sample N]   Quet hashtag, tu chinh cua so de lay ~N bai moi lan
  dashboard [--days N]   Sinh dashboard.html tu du lieu da quet
  trend <q1> [q2 ...]    Phan tich sau mot cua so co dinh (lay mau phan tang)
                         --from "2026-10-02T20:00+07:00" --to "..."
                         [--slices 48] so lat cat  [--target 45] bai moi lat
                         [--out ten.json] [--html ten.html] [--title "..."]
                         [--only-html] chi ve lai tu du lieu da luu, khong goi API
  replies <link|id>      Lay toan bo comment cua 1 bai, luu JSON + CSV
                         [--max N] tran so reply (mac dinh 500)
                         [--format json|csv|both]
  retweeters <link|id>   Lay danh sach nguoi da retweet 1 bai
  giveaway <link|id>     Loc entry hop le theo the le GA
                         [--min N] [--max N] so cho phep (mac dinh 0-2511)
                         [--msg N] do dai loi nhan toi thieu (15)
                         [--followers N] follower toi thieu (20)
                         [--keyword "..."] [--hashtag "#..."]
                         [--cached] dung du lieu da tai, khong goi API
  totp [secret]          In ma 2FA tu TW_TOTP_SECRET de doi chieu voi app
  watch [--force]        Quet 1 lan cac account dang theo doi, tim bai moi
  queue                  Xem hang doi retweet dang cho
  run                    Chay scheduler, dang lien tuc theo POST_INTERVAL
  post                   Dang 1 tweet ke tiep trong queue
  post --text "..."      Dang noi dung truyen thang tren dong lenh
  list                   Liet ke queue va trang thai da/chua dang
  status                 Xem cau hinh, session, so tweet da dang
  login [--force]        Dang nhap va cache session
  logout                 Xoa session cache

Tuy chon cho lenh "post":
  --text "noi dung"      Noi dung tweet (bo qua queue)
  --media <file>         Dinh kem anh/video (lap lai nhieu lan duoc)
  --reply <tweet_id>     Tra loi 1 tweet
  --quote <tweet_id>     Quote 1 tweet
  --retweet <tweet_id>   Retweet 1 tweet co san
  --index <n>            Dang dung bai thu n trong queue (bat dau tu 1)
  --dry                  Khong goi API, chi in ra xem truoc

Vi du:
  node src/cli.js post --dry
  node src/cli.js post --text "Hello tu twitterapi.io 👋"
  node src/cli.js post --text "Anh ne" --media ./img/a.png
  node src/cli.js run
`;

async function cmdPost(opts) {
  assertConfig();
  const dryRun = opts.dry || config.dryRun;

  if (opts.retweet) {
    await postEntry({ type: 'retweet', retweetId: opts.retweet, hash: hash(`RT:${opts.retweet}`) }, { dryRun });
    return;
  }

  if (opts.text) {
    const entry = {
      text: opts.text,
      hash: hash(opts.text),
      media: opts.media.map((p) => path.resolve(process.cwd(), p)),
      replyToTweetId: opts.reply,
      quoteTweetId: opts.quote,
    };
    await postEntry(entry, { dryRun });
    return;
  }

  const entries = loadQueue();
  const state = loadState();

  if (opts.index) {
    const i = Number(opts.index) - 1;
    if (!entries[i]) throw new Error(`Khong co bai thu ${opts.index} (queue co ${entries.length} bai).`);
    await postAndRecord(entries[i], i, { dryRun });
    return;
  }

  const next = pickNext(entries, state);
  if (!next) {
    log.warn(`Queue het bai chua dang. Them noi dung vao ${path.relative(process.cwd(), config.tweetsFile)}.`);
    return;
  }
  log.info(`Bai #${next.index + 1}/${entries.length}`);
  await postAndRecord(next.entry, next.index, { dryRun });
}

function cmdList() {
  const entries = loadQueue();
  const state = loadState();
  log.plain(`\nQueue: ${path.relative(process.cwd(), config.tweetsFile)} — ${entries.length} bai\n`);
  entries.forEach((e, i) => {
    const done = wasPosted(state, e.hash);
    if (e.type === 'retweet') {
      log.plain(`${done ? '✅' : '⬜'} #${String(i + 1).padStart(2)} [retweet  ] → ${e.retweetId}`);
      return;
    }
    const len = tweetLength(e.text);
    const flag = len > 280 && !e.isNoteTweet ? ' ⚠️ QUA DAI' : '';
    const extra = [
      e.media.length ? `${e.media.length} media` : null,
      e.replyToTweetId ? `reply→${e.replyToTweetId}` : null,
      e.quoteTweetId ? `quote→${e.quoteTweetId}` : null,
    ].filter(Boolean).join(', ');
    log.plain(
      `${done ? '✅' : '⬜'} #${String(i + 1).padStart(2)} [${String(len).padStart(3)} ky tu]${flag} ` +
        `${e.text.replace(/\n/g, ' ⏎ ').slice(0, 70)}${e.text.length > 70 ? '…' : ''}` +
        (extra ? `  (${extra})` : '')
    );
  });
  const pending = entries.filter((e) => !wasPosted(state, e.hash)).length;
  log.plain(`\nCon lai: ${pending} bai\n`);
}

function cmdQueue() {
  const state = loadState();
  const q = state.retweetQueue || [];
  const accounts = loadAccounts();

  log.plain(`\n=== Account dang theo doi (${accounts.length}) ===`);
  if (!accounts.length) log.plain('  (trong — dat WATCH_ACCOUNTS hoac tao content/accounts.txt)');
  for (const a of accounts) {
    const r = (state.watched || {})[a];
    if (!r || !r.lastCheckedAt) { log.plain(`  @${a} — chua check lan nao`); continue; }
    const rate = r.postsPerDay == null ? '?' : r.postsPerDay.toFixed(1);
    log.plain(
      `  @${a} — check ${humanDuration(Date.now() - r.lastCheckedAt)} truoc, ~${rate} bai/ngay`
    );
  }

  log.plain(`\n=== Hang doi retweet (${q.length}) ===`);
  if (!q.length) log.plain('  (trong)');
  q.slice(0, 20).forEach((item, i) =>
    log.plain(`  ${String(i + 1).padStart(2)}. @${item.author} ${item.tweetId} — ${item.text.replace(/\n/g, ' ').slice(0, 60)}`)
  );
  if (q.length > 20) log.plain(`  … con ${q.length - 20} muc nua`);
  log.plain('');
}

function cmdStatus() {
  const state = loadState();
  const s = sessionInfo();
  log.plain('\n=== Cau hinh ===');
  log.plain(`API key        : ${config.apiKey ? config.apiKey.slice(0, 6) + '…' : '(CHUA DAT)'}`);
  log.plain(`Tai khoan      : @${config.account.userName || '(trong)'} / ${config.account.email || '(trong)'}`);
  log.plain(`Proxy          : ${redact(config.account.proxy) || '(CHUA DAT)'}`);
  log.plain(`2FA            : ${config.account.totpSecret ? 'co totp_secret' : 'khong'}`);
  const DAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  log.plain(`Nhip dang      : ${humanDuration(effectiveInterval())}${config.spread ? ' (tu rai deu)' : ''}${config.jitter ? ` +/- ${humanDuration(config.jitter)}` : ''}`);
  log.plain(`Ngay dang      : ${config.days ? [...config.days].sort().map((d) => DAY_VN[d]).join(', ') : 'moi ngay'}`);
  log.plain(`Khung gio      : ${config.hours ? `${config.hours.from}h-${config.hours.to}h (${humanDuration(windowMs())})` : 'ca ngay'}`);
  log.plain(`Tran/ngay      : ${config.maxPerDay || 'khong gioi han'}`);
  log.plain(`Tran/30 phut   : ${config.maxPerWindow || 'khong gioi han'}`);
  log.plain(`Thu tu         : ${config.order}${config.loopQueue ? ' (lap lai queue)' : ''}`);
  log.plain(`Nguon bai      : ${config.source}`);
  log.plain(`Dry run        : ${config.dryRun}`);

  if (config.source !== 'file') {
    const accounts = loadAccounts();
    log.plain('\n=== Theo doi account ===');
    log.plain(`So account     : ${accounts.length}`);
    log.plain(`Nhip quet      : ${humanDuration(config.watch.interval)}${config.watch.adaptive ? ' (tu dieu chinh theo tan suat dang)' : ''}`);
    log.plain(`Bo qua bai cu  : > ${humanDuration(config.watch.maxAge)}`);
    if (config.watch.include.length) log.plain(`Chi lay neu co : ${config.watch.include.join(', ')}`);
    if (config.watch.exclude.length) log.plain(`Loai tru       : ${config.watch.exclude.join(', ')}`);
    log.plain(`Hang doi cho   : ${(state.retweetQueue || []).length} bai`);
    const perDay = accounts.length * (86400e3 / config.watch.interval);
    log.plain(`Chi phi quet   : toi da ~$${(perDay * 20 * 0.00015).toFixed(2)}/ngay neu khong tu dieu chinh`);
  }

  log.plain('\n=== Session ===');
  if (config.account.loginCookies) {
    const age = cookieAge();
    log.plain(`Che do         : cookie thu cong (TW_LOGIN_COOKIES), bo qua buoc login`);
    log.plain(`Tuoi cookie    : ${age == null ? 'chua dung lan nao' : humanDuration(age)}`);
    log.plain('Luu y          : cookie thuong song vai tuan den vai thang, khong co bao dam.');
    log.plain('                 Chet ngay neu ban dang xuat hoac doi mat khau.');
  } else if (!s) log.plain('Chua co session cache — se tu dang nhap o lan dang dau tien.');
  else log.plain(`@${s.account} — tao ${humanDuration(s.ageMs)} truoc${s.stale ? ' (HET HAN, se login lai)' : ''}`);

  log.plain('\n=== Lich su ===');
  log.plain(`Hom nay        : ${countToday(state)} tweet`);
  log.plain(`Tong da dang   : ${state.posted.length} tweet`);
  const last = state.posted.at(-1);
  if (last) log.plain(`Gan nhat       : ${last.at} — ${last.text.replace(/\n/g, ' ')}`);
  log.plain('');
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const opts = parseArgs(rest);
  if (!cmd || opts.help || ['help', '-h', '--help'].includes(cmd)) {
    log.plain(HELP);
    return;
  }

  switch (cmd) {
    case 'check':
      await check();
      break;
    case 'totp': {
      const raw = (opts._[0] || process.env.TW_TOTP_SECRET || '').trim();
      if (!raw) {
        log.error('Chua co secret. Dat TW_TOTP_SECRET trong .env hoac truyen thang: node src/cli.js totp ABC123');
        process.exitCode = 1;
        break;
      }
      const v = validateSecret(raw);
      const secret = v.extracted || raw.toUpperCase().replace(/[\s-]/g, '');
      if (!v.ok && !/^[A-Z2-7]+=*$/.test(secret)) {
        log.error(`Secret khong hop le: ${v.reason}`);
        process.exitCode = 1;
        break;
      }
      if (!v.ok) log.warn(v.reason);
      log.plain('\nMo app authenticator ra so sanh. Trung = secret dung.');
      log.plain('Ctrl+C de thoat.\n');
      const tick = () => {
        const now = Date.now();
        const left = 30 - (Math.floor(now / 1000) % 30);
        const bar = '█'.repeat(left) + '░'.repeat(30 - left);
        process.stdout.write(`\r  ${totp(secret, now)}   ${bar} ${String(left).padStart(2)}s `);
      };
      tick();
      setInterval(tick, 1000);
      return; // chay lien tuc cho den khi Ctrl+C
    }
    case 'hashtag':
      assertConfig({ needAccount: false });
      await scanAll({ maxPages: Number(opts.pages) || Number(process.env.HASHTAG_PAGES) || 4,
        targetSample: Number(opts.sample) || Number(process.env.HASHTAG_TARGET_SAMPLE) || 20 });
      break;
    case 'replies': {
      assertConfig({ needAccount: false });
      const target = opts._[0];
      if (!target) {
        log.error('Thieu link hoac ID bai viet.');
        log.plain('  Vi du: node src/cli.js replies https://x.com/ai/status/1234567890');
        process.exitCode = 1;
        break;
      }
      const max = Number(opts.max) || 500;
      log.info(`Lay reply cua ${parseTweetId(target)} (tran ${max}, ~$${(max * 0.00015).toFixed(3)} neu day tran)...`);
      const res = await fetchAllReplies(target, {
        max,
        onPage: ({ page, total, cost }) =>
          log.info(`  trang ${page}: da co ${total} reply — $${cost.toFixed(5)}`),
      });
      if (!res.replies.length) {
        log.warn('Khong lay duoc reply nao. Kiem tra: ID co phai TWEET GOC khong (khong phai mot reply)?');
        break;
      }
      const files = saveReplies(res.tweetId, res.replies, { format: opts.format || 'both' });
      const s2 = summarize(res.replies);

      log.plain(`\n=== ${s2.total} reply ===`);
      log.plain(`  Tac gia khac nhau : ${s2.uniqueAuthors}`);
      log.plain(`  Tong like         : ${s2.totalLikes.toLocaleString()}`);
      if (s2.langs.length) log.plain(`  Ngon ngu          : ${s2.langs.map(([l, c]) => `${l} (${c})`).join(', ')}`);
      if (s2.topAuthors.length) {
        log.plain('  Reply nhieu nhat  :');
        for (const [a, c] of s2.topAuthors) log.plain(`      @${a} — ${c} reply`);
      }
      if (s2.mostLiked) {
        log.plain(`  Reply nhieu like  : @${s2.mostLiked.author} (${s2.mostLiked.likes} like)`);
        log.plain(`      ${s2.mostLiked.text.slice(0, 90)}`);
      }
      log.plain(`\n  Da luu: ${files.map((f) => f.replace(process.cwd() + '/', '')).join(', ')}`);
      log.plain(`  Chi phi: $${res.cost.toFixed(5)}` + (res.reachedCap ? '  (DA CHAM TRAN — con reply chua lay, tang --max de lay tiep)' : ''));
      break;
    }
    case 'retweeters': {
      assertConfig({ needAccount: false });
      const target = opts._[0];
      if (!target) { log.error('Thieu link hoac ID bai viet.'); process.exitCode = 1; break; }
      log.info(`Lay nguoi retweet bai ${parseTweetId(target)}...`);
      const res = await fetchAllRetweeters(target, {
        max: Number(opts.max) || 1000,
        onPage: ({ page, total }) => log.info(`  trang ${page}: da co ${total} nguoi`),
      });
      if (!res.users.length) { log.warn('Khong lay duoc ai. Bai co the chua co retweet, hoac bi khoa.'); break; }
      const files = saveRetweeters(res.tweetId, res.users);
      const withF = res.users.filter((u) => (u.followers ?? 0) > 0);
      log.plain(`\n=== ${res.users.length} nguoi da retweet ===`);
      if (withF.length) {
        const sorted = [...withF].sort((a, b) => (b.followers || 0) - (a.followers || 0));
        log.plain(`  Tong follower cong don: ${withF.reduce((a, u) => a + (u.followers || 0), 0).toLocaleString()}`);
        log.plain('  Nhieu follower nhat:');
        for (const u of sorted.slice(0, 5)) log.plain(`      @${u.userName} — ${(u.followers || 0).toLocaleString()} follower`);
      }
      log.plain(`\n  Da luu: ${files.map((f) => f.replace(process.cwd() + '/', '')).join(', ')}`);
      break;
    }
    case 'giveaway': {
      assertConfig({ needAccount: false });
      const target = opts._[0];
      if (!target) { log.error('Thieu link hoac ID bai viet.'); process.exitCode = 1; break; }
      const id = parseTweetId(target);
      const dir = 'data/replies';
      const fRep = `${dir}/${id}.json`, fRt = `${dir}/${id}-retweeters.json`;

      let replies, retweeters;
      if (opts.cached && fsSync.existsSync(fRep) && fsSync.existsSync(fRt)) {
        replies = JSON.parse(fsSync.readFileSync(fRep, 'utf8'));
        retweeters = JSON.parse(fsSync.readFileSync(fRt, 'utf8'));
        log.info(`Dung du lieu da tai: ${replies.length} comment, ${retweeters.length} retweeter`);
      } else {
        log.info('Dang tai du lieu moi nhat...');
        const r1 = await fetchAllReplies(target, { max: Number(opts.maxreplies) || 2000,
          onPage: ({ page, total }) => log.info(`  comment trang ${page}: ${total}`) });
        saveReplies(id, r1.replies);
        const r2 = await fetchAllRetweeters(target, { max: Number(opts.maxrt) || 3000,
          onPage: ({ page, total }) => log.info(`  retweeter trang ${page}: ${total}`) });
        saveRetweeters(id, r2.users);
        replies = JSON.parse(fsSync.readFileSync(fRep, 'utf8'));
        retweeters = JSON.parse(fsSync.readFileSync(fRt, 'utf8'));
        log.info(`Chi phi tai du lieu: $${(r1.cost + r2.users.length * 0.00015).toFixed(4)}`);
      }

      const rules = {
        numberMin: opts.min != null ? Number(opts.min) : 0,
        numberMax: opts.max != null ? Number(opts.max) : 2511,
        minMessage: Number(opts.msg) || 15,
        minFollowers: opts.followers != null ? Number(opts.followers) : 20,
        keyword: opts.keyword ?? 'LENAMIU PLS LOVE EP3',
        hashtag: opts.hashtag ?? '#PlsLoveรักได้ไหมEP3',
      };
      const rtSet = new Set(retweeters.map((u) => (u.userName || '').toLowerCase()));
      const entries = replies.map((r) => checkEntry(r, rules, rtSet));
      const { accepted, duplicates } = resolveEntries(entries);

      log.plain(`\n=== The le dang ap dung ===`);
      log.plain(`  So       : ${rules.numberMin}–${rules.numberMax}`);
      log.plain(`  Loi nhan : >= ${rules.minMessage} ky tu`);
      log.plain(`  Keyword  : ${rules.keyword}`);
      log.plain(`  Hashtag  : ${rules.hashtag}`);
      log.plain(`  Follower : >= ${rules.minFollowers}`);

      const reasons = {};
      for (const e of entries) for (const f of e.failed) reasons[f] = (reasons[f] || 0) + 1;
      const LABEL = { retweeted: 'chua retweet', number: 'khong co so hop le',
        message: 'loi nhan < ' + rules.minMessage + ' ky tu', keyword: 'thieu keyword',
        hashtag: 'thieu hashtag', followers: 'duoi ' + rules.minFollowers + ' follower' };

      log.plain(`\n=== Ket qua: ${entries.length} comment ===`);
      log.plain(`  Hop le va duoc nhan : ${accepted.length}`);
      if (duplicates.length) log.plain(`  Bi loai do trung so : ${duplicates.length}`);
      log.plain(`  Khong hop le        : ${entries.filter((e) => !e.valid).length}`);
      log.plain('\n  Ly do bi loai:');
      for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1]))
        log.plain(`    ${(LABEL[k] || k).padEnd(28)} ${v}`);

      if (accepted.length) {
        log.plain(`\n=== Danh sach hop le (theo thu tu comment) ===`);
        log.plain(`  ${'#'.padStart(3)}  ${'So'.padStart(4)}  ${'Tai khoan'.padEnd(20)} ${'Fl'.padStart(6)}  Loi nhan`);
        accepted.forEach((e, i) =>
          log.plain(`  ${String(i + 1).padStart(3)}  ${String(e.number).padStart(4)}  @${(e.author || '?').padEnd(19)} ${String(e.followers).padStart(6)}  ${e.message.slice(0, 44)}`));
      }
      if (duplicates.length) {
        log.plain(`\n=== Trung so (uu tien nguoi comment som hon) ===`);
        for (const d of duplicates)
          log.plain(`  so ${String(d.winner.number).padStart(4)}: @${d.winner.author} (som hon)  >  @${d.loser.author}`);
      }

      const out = saveEntries(accepted, `${dir}/${id}-hople.csv`);
      const outAll = saveEntries(entries, `${dir}/${id}-tatca.csv`);
      log.plain(`\n  Da luu: ${out.replace(process.cwd() + '/', '')}`);
      log.plain(`          ${outAll.replace(process.cwd() + '/', '')} (ca khong hop le, de doi chieu)`);
      log.plain(`\n  ⚠️  Chua kiem tra duoc: co follow @LenaMiu_CH3 @miunatshaa @lena__lorena khong,`);
      log.plain(`      va co hoat dong lien quan 7-10 ngay gan day khong. Hai muc do can goi them API.`);
      break;
    }
    case 'dashboard':
      buildDashboard({ days: Number(opts.days) || 7, out: opts.out || 'dashboard.html' });
      break;
    case 'trend': {
      const queries = opts._.slice(1);
      const html = opts.html || 'dashboard-trend.html';
      const title = opts.title || 'Phan tich hashtag';
      const name = opts.out || 'trend.json';
      const file = path.resolve(process.cwd(), 'data/trend', name);

      if (opts['only-html']) {                 // ve lai tu du lieu da co, mien phi
        buildTrendDashboard(file, { out: html, title });
        break;
      }
      if (!queries.length) {
        log.error('Thieu query. Vi du: node src/cli.js trend "#abc" --from "2026-10-02T20:00+07:00" --to "2026-10-03T20:00+07:00"');
        process.exitCode = 1;
        break;
      }
      const toSec = (v, def) => {
        if (!v) return def;
        const t = Date.parse(v);
        if (!Number.isFinite(t)) throw new Error(`Khong hieu moc thoi gian "${v}" (dung ISO: 2026-10-02T20:00+07:00)`);
        return Math.floor(t / 1000);
      };
      const to = toSec(opts.to, Math.floor(Date.now() / 1000));
      const from = toSec(opts.from, to - 86400);
      if (from >= to) throw new Error('--from phai truoc --to');

      await collectTrend({
        queries, from, to,
        slices: Number(opts.slices) || 48,
        target: Number(opts.target) || 45,
        out: name,
      });
      buildTrendDashboard(file, { out: html, title });
      break;
    }
    case 'ipwatch':
      await ipwatch({ report: opts.report });
      break;
    case 'proxies': {
      const list = loadProxyList();
      if (!list.length) {
        log.error('Khong tim thay proxy nao.');
        log.plain('  Dat TW_PROXY_LIST=... trong .env, hoac tao content/proxies.txt (moi dong 1 proxy).');
        log.plain('  Chap nhan ca dang day du http://user:pass@ip:port lan dang export ip:port:user:pass.');
        process.exitCode = 1;
        break;
      }
      await rankProxies(list);
      break;
    }
    case 'watch':
      assertConfig({ needAccount: false });
      await pollAccounts({ force: opts.force });
      break;
    case 'queue':
      cmdQueue();
      break;
    case 'run':
      assertConfig();
      await run();
      break;
    case 'post':
      await cmdPost(opts);
      break;
    case 'list':
      cmdList();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'login':
      assertConfig();
      await getLoginCookies(opts.force ?? true);
      break;
    case 'logout':
      log.plain(clearSession() ? '✅ Da xoa session cache.' : 'ℹ Khong co session de xoa.');
      break;
    default:
      log.error(`Khong biet lenh "${cmd}".`);
      log.plain(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error(err.message);
  if (process.env.LOG_LEVEL === 'debug') console.error(err);
  process.exitCode = 1;
});
