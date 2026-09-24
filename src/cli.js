#!/usr/bin/env node
import path from 'node:path';
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
import { totp, validateSecret } from './totp.js';
import { parseDuration } from './util.js';

function parseArgs(argv) {
  const opts = { _: [], media: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { opts._.push(a); continue; }
    const key = a.slice(2);
    if (['dry', 'force', 'help', 'all', 'report'].includes(key)) { opts[key] = true; continue; }
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
