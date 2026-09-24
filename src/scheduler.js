import { config, effectiveInterval, windowMs } from './config.js';
import { log } from './logger.js';
import { sleep, humanDuration } from './util.js';
import { loadQueue, pickNext } from './source.js';
import { loadState, countToday, countRecent, recordPost } from './store.js';
import { postAndRecord, postEntry } from './poster.js';
import { pollAccounts, peekRetweet, dropRetweet } from './watcher.js';
import { testProxy, classify } from './proxies.js';
import { redact } from './util.js';

const inWindow = (d) => {
  if (!config.hours) return true;
  const { from, to } = config.hours;
  const h = d.getHours();
  return from <= to ? h >= from && h < to : h >= from || h < to; // ho tro khung qua dem (22-6)
};

const inDays = (d) => !config.days || config.days.has(d.getDay());

const DAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Day thoi diem `d` toi slot hop le gan nhat (dung thu + trong khung gio). */
function align(d) {
  const t = new Date(d);
  if (inDays(t) && inWindow(t)) return t;
  t.setMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 70; i++) {
    t.setHours(t.getHours() + 1);
    if (inDays(t) && inWindow(t)) {
      t.setMinutes(Math.floor(Math.random() * 10), 0, 0);
      return t;
    }
  }
  return t; // khong tim ra slot trong ~70 ngay (cau hinh chac chan sai)
}

/** Dau ngay dang hop le ke tiep. */
function nextDayStart() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(config.hours?.from ?? 0, Math.floor(Math.random() * 30), 0, 0);
  return align(t);
}

function nextRunAt() {
  const base = effectiveInterval();
  const jitter = config.jitter ? (Math.random() * 2 - 1) * config.jitter : 0;
  const delay = Math.max(5_000, base + jitter);
  return align(new Date(Date.now() + delay));
}

/**
 * Thu proxy truoc khi vao vong lap. Proxy chet thi moi request deu fail,
 * chay tiep chi to dot credit va tao ra mot loat lan dang nhap loi.
 * @returns {boolean} co nen chay tiep khong
 */
async function preflight() {
  log.info(`Kiem tra proxy truoc khi chay: ${redact(config.account.proxy)}`);
  const r = await testProxy(config.account.proxy, { timeout: 20 });

  if (!r.alive) {
    log.error(`Proxy KHONG song: ${r.error}`);
    log.plain('   Bot khong chay khi proxy chet. Chay `node src/cli.js proxies` de chon cai khac,');
    log.plain('   roi cap nhat TW_PROXY trong .env.');
    return false;
  }

  const kind = classify(r);
  log.ok(`Proxy song — IP ${r.ip}, ${r.ms}ms, ${kind} (${r.isp})`);
  if (kind !== 'residential') {
    log.warn('Day la IP datacenter. X de bat challenge khi login tu IP nay.');
    log.plain('   Van chay tiep, nhung neu login that bai nhieu lan thi nguyen nhan la day.');
  }
  if (r.ms > 5000) log.warn(`Proxy cham (${r.ms}ms) — login vao X co the timeout.`);
  return true;
}

export async function run() {
  if (!config.dryRun && !(await preflight())) {
    process.exitCode = 1;
    return;
  }

  let stopping = false;
  const stop = (sig) => {
    if (stopping) process.exit(1);
    stopping = true;
    log.info(`Nhan ${sig}, dung scheduler...`);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  const tick = effectiveInterval();
  log.info(
    `Scheduler chay: moi ${humanDuration(tick)}` +
      (config.spread ? ' (tu rai deu)' : '') +
      (config.jitter ? ` +/- ${humanDuration(config.jitter)}` : '') +
      (config.days ? `, chi ${[...config.days].sort().map((d) => DAY_VN[d]).join('/')}` : '') +
      (config.hours ? `, ${config.hours.from}h-${config.hours.to}h` : '') +
      (config.maxPerDay ? `, toi da ${config.maxPerDay}/ngay` : '') +
      (config.maxPerWindow ? `, ${config.maxPerWindow}/30phut` : '') +
      (config.dryRun ? ' [DRY RUN]' : '')
  );
  if (config.spread && config.maxPerDay > 0) {
    log.info(
      `   Rai ${config.maxPerDay} bai trong ${humanDuration(windowMs())} => 1 bai moi ${humanDuration(tick)}.`
    );
  }

  let nextAt = config.postOnStart ? align(new Date()) : nextRunAt();

  while (!stopping) {
    const wait = nextAt.getTime() - Date.now();
    if (wait > 0) {
      log.info(`Tweet ke tiep luc ${nextAt.toLocaleString('sv')} (con ${humanDuration(wait)})`);
      // ngu theo lat cat 5s de Ctrl+C phan hoi nhanh
      const until = Date.now() + wait;
      while (!stopping && Date.now() < until) {
        await sleep(Math.min(5_000, until - Date.now()));
      }
      if (stopping) break;
    }

    try {
      const state = loadState();
      if (config.maxPerDay > 0 && countToday(state) >= config.maxPerDay) {
        nextAt = nextDayStart();
        log.info(`Da du ${config.maxPerDay} tweet hom nay. Hen lai ${nextAt.toLocaleString('sv')}.`);
        continue;
      }

      // X chia han muc theo khung nua tieng — cho bot dang dan thay vi dang don
      if (config.maxPerWindow > 0) {
        const recent = countRecent(state, 30 * 60_000);
        if (recent >= config.maxPerWindow) {
          nextAt = new Date(Date.now() + 5 * 60_000);
          log.warn(`Da dang ${recent} bai trong 30 phut qua (tran ${config.maxPerWindow}). Cho 5 phut.`);
          continue;
        }
      }

      // quet account dang theo doi (watcher tu quyet dinh account nao den luot)
      if (config.source !== 'file') {
        try {
          await pollAccounts();
        } catch (e) {
          log.warn(`Quet account that bai: ${e.message}`);
        }
      }

      // uu tien hang doi retweet (bai moi co tinh thoi su hon), roi den file queue
      if (config.source !== 'file') {
        const item = peekRetweet(loadState());
        if (item) {
          log.info(`Retweet bai cua @${item.author}: ${item.text.replace(/\n/g, ' ').slice(0, 60)}`);
          await postEntry(
            { type: 'retweet', retweetId: item.tweetId, hash: `RT:${item.tweetId}` },
            {}
          );
          // dry run chi xem truoc, khong duoc dong vao hang doi hay lich su
          if (!config.dryRun) {
            dropRetweet(loadState(), item.tweetId);
            recordPost(loadState(), {
              entryHash: `RT:${item.tweetId}`,
              text: `RT @${item.author}: ${item.text}`,
              tweetId: item.tweetId,
            });
          }
          nextAt = nextRunAt();
          continue;
        }
        if (config.source === 'watch') {
          log.debug('Hang doi retweet rong, cho vong sau.');
          nextAt = nextRunAt();
          continue;
        }
      }

      const entries = loadQueue();
      const next = pickNext(entries, state);
      if (!next) {
        log.warn(
          `Queue het bai (${entries.length} bai da dang xong). ` +
            `Them noi dung vao ${config.tweetsFile} hoac bat LOOP_QUEUE=true. Cho 10 phut...`
        );
        nextAt = new Date(Date.now() + 10 * 60_000);
        continue;
      }

      log.info(`Dang bai #${next.index + 1}/${entries.length}${next.repeat ? ' (lap lai)' : ''}`);
      await postAndRecord(next.entry, next.index);
    } catch (err) {
      log.error(err.message);
      log.info('Se thu lai o lan ke tiep.');
    }

    nextAt = nextRunAt();
  }

  log.ok('Scheduler da dung.');
}
