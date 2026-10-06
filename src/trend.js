import fs from 'node:fs';
import path from 'node:path';
import { advancedSearch } from './api.js';
import { log } from './logger.js';

const COST_PER_TWEET = 0.00015;
const PAGE = 20;

/**
 * Chon vi tri lay mau NGAU NHIEN trong mot doan, thay vi luon do tu dau doan.
 *
 * Do tu dau doan nghe co ve vo hai, nhung bai dang khong rai deu: chung don lai
 * o cac moc tron (dau phut, dau nua gio). Do dung tai dau moi lat 30 phut nen
 * lan nao cung roi trung dot don do, va suy ra ty le cao gap ruoi so that:
 *
 *   do tai +0s          -> 10.457 bai/gio
 *   trung binh 8 vi tri ->  6.579 bai/gio
 *   dem tron 10 phut    ->  6.276 bai/gio  (so that)
 *
 * Rai ngau nhien thi ky vong cua uoc luong bang dung ty le that, khong con lech
 * mot phia nua — phan sai so con lai la nhieu, va nhieu thi triet tieu dan khi
 * cong 48 lat lai.
 */
const pickOffset = (segStart, segDur, win) =>
  segStart + Math.floor(Math.random() * Math.max(1, segDur - win));

const OUT_DIR = path.resolve(process.cwd(), 'data/trend');
const slug = (q) => q.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Dem CHINH XAC so bai trong mot cua so, bang cach phan trang den khi het.
 *
 * Tra ve `exact:false` neu cham tran `maxPages` — luc do con so chi la chan duoi.
 * API luon bao `has_next_page:true` ke ca khi trang cuoi chi co 1 bai, nen dau
 * hieu "het" duy nhat dang tin la trang tra ve chua day 20 bai.
 */
/**
 * X loai retweet khoi ket qua tim kiem mac dinh — phai them `include:nativeretweets`
 * moi thay chung. Voi mot trend fandom thi retweet chiem phan lon luong bai, nen
 * thieu no la dem hut gan mot nua. Bo dem trend cua chinh X co tinh retweet.
 */
const RT = (t) => /^RT @/.test(t.text || '');
const withRetweets = (q) => (/include:nativeretweets/.test(q) ? q : `${q} include:nativeretweets`);

async function countWindow(query, t0, win, maxPages) {
  const tweets = [];
  let cursor = '';
  for (let p = 0; p < maxPages; p++) {
    const r = await advancedSearch({
      query: `${withRetweets(query)} since_time:${t0} until_time:${t0 + win}`,
      queryType: 'Latest',
      cursor,
    });
    tweets.push(...r.tweets);
    cursor = r.nextCursor;
    if (r.tweets.length < PAGE || !cursor) return { tweets, exact: true };
  }
  return { tweets, exact: false };
}

/**
 * Lay mau PHAN TANG theo gio cho mot cua so dai.
 *
 * Hashtag nay chay 3.600-16.000 bai/gio, tuc 150k-250k bai trong 24h. Keo het
 * ton $20-38 ma tai khoan chi con $9 — va phan lon so tien do mua ve nhung bai
 * gan nhu giong nhau. Thay vao do: moi gio dem CHINH XAC mot lat cat hep roi
 * suy ra toc do.
 *
 * Do rong lat cat tu dieu chinh de moi lat roi vao khoang `target` bai:
 *   - Du hep de phan trang het  -> dem chinh xac, sai so chi con sai so dem
 *     (Poisson, ~1/sqrt(n)), KHONG phai sai so uoc luong.
 *   - Do rong la do MINH chon nen biet chinh xac, khac han cach suy tu khoang
 *     cach thoi gian giua cac bai (createdAt chi co do phan giai giay nen vo
 *     dung khi hashtag chay nhanh).
 *
 * Chi phi: 24 lat x ~`target` bai = ~$0.09/tag thay vi $20.
 */
export async function sampleWindow(query, { from, to, slices = 48, target = 48, maxPages = 4, probes = 2 } = {}) {
  const sliceDur = Math.floor((to - from) / slices);
  const out = [];
  const tweets = new Map();
  let rate = 8000;          // phong doan ban dau, tu chinh ngay tu lat thu hai
  let spent = 0;

  for (let i = 0; i < slices; i++) {
    const sliceStart = from + i * sliceDur;
    const seg = Math.floor(sliceDur / probes);
    const per = Math.max(1, Math.round(target / probes));

    const got = [];
    let totN = 0, weighted = 0, allExact = true;

    for (let k = 0; k < probes; k++) {
      let win = Math.max(5, Math.min(seg, Math.round((per / rate) * 3600)));
      let r = await countWindow(query, pickOffset(sliceStart + k * seg, seg, win), win, maxPages);
      spent += Math.max(r.tweets.length, 1) * COST_PER_TWEET;

      // Doan hut -> cua so qua rong. Thu lai hep hon DUNG MOT LAN: moi lan thu
      // deu mat tien, va mot uoc luong tu 80 bai van tot hon ba lan thu.
      if (!r.exact && win > 5) {
        win = Math.max(5, Math.round(win / 4));
        r = await countWindow(query, pickOffset(sliceStart + k * seg, seg, win), win, maxPages);
        spent += Math.max(r.tweets.length, 1) * COST_PER_TWEET;
      }

      let rk;
      if (r.exact) {
        rk = (r.tweets.length / win) * 3600;
      } else {
        // Van tran: quay ve mat do thoi gian cua chinh mau (chan duoi, kem tin hon)
        allExact = false;
        const ts = r.tweets.map((t) => Date.parse(t.createdAt)).filter(Number.isFinite).sort((a, b) => b - a);
        const span = ts.length > 1 ? (ts[0] - ts.at(-1)) / 1000 : win;
        rk = (r.tweets.length / Math.max(span, 1)) * 3600;
      }
      totN += r.tweets.length;
      weighted += rk * r.tweets.length;     // trung binh co trong so theo so bai
      got.push(...r.tweets);
    }

    const ratePerHour = totN ? Math.round(weighted / totN) : 0;
    const marginPct = totN ? Math.round(100 / Math.sqrt(totN)) : null;
    if (ratePerHour > 0) rate = ratePerHour;

    for (const t of got) {
      tweets.set(String(t.id), {
        id: String(t.id),
        at: Date.parse(t.createdAt),
        author: t.author?.userName || null,
        name: t.author?.name || null,
        followers: t.author?.followers || 0,
        created: t.author?.createdAt ? Date.parse(t.author.createdAt) : null,
        likes: t.likeCount || 0,
        rts: t.retweetCount || 0,
        quotes: t.quoteCount || 0,
        replies: t.replyCount || 0,
        views: t.viewCount || 0,
        bookmarks: t.bookmarkCount || 0,
        lang: t.lang || null,
        isReply: Boolean(t.inReplyToId || t.isReply),
        isRT: RT(t),
        media: (t.extendedEntities?.media || t.entities?.media || []).length,
        text: (t.text || '').slice(0, 280),
      });
    }

    const nRT = got.filter(RT).length;
    out.push({ t0: sliceStart, n: got.length, nRT, exact: allExact, ratePerHour, marginPct,
               rtSharePct: got.length ? Math.round((nRT / got.length) * 100) : null });
    log.info(
      `  ${new Date(sliceStart * 1000).toISOString().slice(5, 16).replace('T', ' ')} UTC  ` +
      `${String(got.length).padStart(3)} bai / ${probes} vi tri  ` +
      `-> ${allExact ? '' : '>'}${ratePerHour.toLocaleString('en-US').padStart(7)} bai/gio` +
      `${marginPct ? ` +/-${marginPct}%` : ''} (RT ${nRT}/${got.length})${allExact ? '' : '  TRAN'}`
    );
  }

  return { slices: out, tweets: [...tweets.values()], cost: spent, sliceDur };
}

/** Bai noi bat nhat ca cua so — xep theo thuat toan Top cua chinh X. */
async function fetchTop(query, from, to, pages = 2) {
  const tweets = [];
  let cursor = '';
  for (let p = 0; p < pages; p++) {
    const r = await advancedSearch({
      query: `${query} since_time:${from} until_time:${to}`,   // khong tinh retweet: bai noi bat phai la bai goc
      queryType: 'Top',
      cursor,
    });
    tweets.push(...r.tweets);
    cursor = r.nextCursor;
    if (r.tweets.length < PAGE || !cursor) break;
  }
  return tweets.map((t) => ({
    id: String(t.id),
    at: Date.parse(t.createdAt),
    author: t.author?.userName || null,
    name: t.author?.name || null,
    followers: t.author?.followers || 0,
    likes: t.likeCount || 0,
    rts: t.retweetCount || 0,
    replies: t.replyCount || 0,
    quotes: t.quoteCount || 0,
    views: t.viewCount || 0,
    lang: t.lang || null,
    text: (t.text || '').slice(0, 280),
  }));
}

/**
 * Quet mot danh sach query tren cung mot cua so thoi gian va luu lai ket qua.
 * Luu ca mau tho de moi phan tich ve sau khong phai goi API lan nua.
 */
export async function collectTrend({ queries, from, to, slices = 24, target = 45, topPages = 2, out }) {
  const result = { from, to, collectedAt: Date.now(), slices, target, tags: {} };
  let cost = 0;

  for (const query of queries) {
    log.info(`Lay mau ${query} — ${slices} lat cat`);
    const s = await sampleWindow(query, { from, to, slices, target });
    const top = await fetchTop(query, from, to, topPages);
    cost += s.cost + top.length * COST_PER_TWEET;

    const est = s.slices.reduce((a, x) => a + (x.ratePerHour * s.sliceDur) / 3600, 0);
    result.tags[query] = { ...s, top, estimatedTotal: Math.round(est) };
    log.ok(`${query}: uoc tinh ${Math.round(est).toLocaleString('en-US')} bai trong cua so — $${s.cost.toFixed(4)}`);
  }

  result.cost = cost;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, out || `${slug(queries[0])}.json`);
  fs.writeFileSync(file, JSON.stringify(result));
  log.ok(`Da luu ${path.relative(process.cwd(), file)} — tong $${cost.toFixed(4)}`);
  return { result, file };
}

export { slug, OUT_DIR };
