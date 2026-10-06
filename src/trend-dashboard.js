import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger.js';

/**
 * Bang mau da chay qua scripts/validate_palette.js cua skill dataviz:
 * ca sang lan toi deu PASS nam kiem tra tren danh sach cap ke nhau.
 * Che do sang canh bao tuong phan < 3:1 — da bu bang nhan truc tiep tren duong
 * va bang so day du o cuoi trang, dung nhu yeu cau cua kiem tra do.
 */
const SERIES = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
];

const TZ = 7 * 3600e3;                          // gio Viet Nam / Thai Lan
/** Query `"abc def"` la cu phap tim cum tu — nguoi doc khong can thay dau nhay. */
const display = (q) => String(q).replace(/^"|"$/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const short = (n) => {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
};
/** moc thoi gian theo +07, vi ca hai hashtag deu la khan gia Thai/Viet */
const hm = (ms) => new Date(ms + TZ).toISOString().slice(11, 16);
const dhm = (ms) => {
  const d = new Date(ms + TZ).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`;
};

/* ------------------------------------------------------------- phan tich */

const DAY = 86400e3;

function analyze(tag, rec, collectedAt, cal = 1) {
  const { slices, top, sliceDur } = rec;
  const all = rec.tweets;

  // Retweet khong co luot thich/ngon ngu cua rieng no — no lap lai bai goc.
  // Gop chung vao se lam loang moi chi so tuong tac, nen tach ra ngay tu dau:
  // tong luong bai tinh ca retweet, con chan dung noi dung chi tinh bai goc.
  const tweets = all.filter((t) => !t.isRT);
  const rtPool = all.filter((t) => t.isRT);
  const sample = tweets.length;
  const sampleAll = all.length;
  const rtShare = sampleAll ? rtPool.length / sampleAll : 0;

  // Uoc tinh tong: moi lat dong gop rate * do dai lat. Do rong lat cat la do
  // minh chon nen biet chinh xac — sai so con lai chi la sai so dem.
  const points = slices.map((s) => ({
    at: (s.t0 + sliceDur / 2) * 1000,
    rate: Math.round(s.ratePerHour * cal),
    exact: s.exact,
    n: s.n,
    margin: s.marginPct,
    rtShare: s.rtSharePct ?? 0,
  }));
  const estimatedTotal = (rec.estimatedTotal ?? points.reduce((a, p) => a + (p.rate * sliceDur) / 3600, 0)) * cal;

  // Sai so tong hop: cac lat doc lap nhau nen phuong sai cong lai duoc.
  const totalSampled = slices.reduce((a, s) => a + s.n, 0);
  const marginPct = totalSampled ? Math.round(100 / Math.sqrt(totalSampled)) : null;

  const peak = points.reduce((a, p) => (p.rate > (a?.rate ?? -1) ? p : a), null);
  const low = points.reduce((a, p) => (p.rate < (a?.rate ?? Infinity) ? p : a), null);

  // --- tac gia
  // Xep hang tac gia tinh ca retweet: cau hoi o day la "ai day tag nhieu nhat",
  // ma retweet cung la mot luot day tag.
  const authors = new Map();
  for (const t of all) {
    if (!t.author) continue;
    const a = authors.get(t.author) || { posts: 0, rts: 0, likes: 0, views: 0, followers: 0, created: t.created };
    a.posts++; if (t.isRT) a.rts++; else { a.likes += t.likes; a.views += t.views; }
    a.followers = Math.max(a.followers, t.followers);
    authors.set(t.author, a);
  }
  const ranked = [...authors].sort((a, b) => b[1].posts - a[1].posts);
  const top10Share = ranked.slice(0, 10).reduce((a, [, r]) => a + r.posts, 0) / (sampleAll || 1);

  // --- ngon ngu
  const langs = new Map();
  for (const t of tweets) langs.set(t.lang || '??', (langs.get(t.lang || '??') || 0) + 1);
  const langRows = [...langs].sort((a, b) => b[1] - a[1]);

  // --- chan dung tai khoan
  const fresh = tweets.filter((t) => t.created && collectedAt - t.created < 90 * DAY).length;
  const replies = tweets.filter((t) => t.isReply).length;
  const withMedia = tweets.filter((t) => t.media > 0).length;
  // Nua so tai khoan chi dang dung mot bai — con so nay phan biet "dam dong that"
  // voi "mot nhom nho cay tag", ro hon la trung binh bai/tai khoan.
  const onceOnly = ranked.filter(([, r]) => r.posts === 1).length;
  const qt = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
  const likeDist = tweets.map((t) => t.likes).sort((a, b) => a - b);
  const followerDist = tweets.map((t) => t.followers).sort((a, b) => a - b);

  // --- tuong tac (tinh tren mau, roi nhan len theo ty le uoc tinh)
  const sum = (f) => tweets.reduce((a, t) => a + (f(t) || 0), 0);
  const scale = sampleAll ? estimatedTotal / sampleAll : 0;
  const eng = {
    likes: sum((t) => t.likes), rts: sum((t) => t.rts),
    replies: sum((t) => t.replies), views: sum((t) => t.views),
  };
  const zeroLike = tweets.filter((t) => t.likes === 0).length;

  return {
    tag, points, estimatedTotal, marginPct, sample, sampleAll, sliceDur,
    rtShare, estRetweets: estimatedTotal * rtShare, estOriginals: estimatedTotal * (1 - rtShare),
    peak, low, authors: ranked, uniqueAuthors: authors.size,
    postsPerAuthor: authors.size ? sampleAll / authors.size : 0,
    top10Share, langRows, fresh, replies, withMedia, onceOnly,
    likeP90: qt(likeDist, 0.9), likeP99: qt(likeDist, 0.99),
    medFollowers: qt(followerDist, 0.5),
    eng, zeroLike, scale,
    estLikes: eng.likes * scale, estViews: eng.views * scale,
    top: (top || []).slice().sort((a, b) => b.likes + b.rts * 2 - (a.likes + a.rts * 2)),
    overflowed: slices.filter((s) => !s.exact).length,
  };
}

/* -------------------------------------------------------- bieu do duong */

const CH = { W: 840, H: 330, t: 14, r: 124, b: 44, l: 58 };

function volumeChart(tags) {
  const iw = CH.W - CH.l - CH.r, ih = CH.H - CH.t - CH.b;
  const all = tags.flatMap((t) => t.points);
  if (!all.length) return { svg: '<p class="empty">Chưa có dữ liệu.</p>', geo: null };

  const x0 = Math.min(...all.map((p) => p.at)), x1 = Math.max(...all.map((p) => p.at));
  const ymax = Math.max(...all.map((p) => p.rate)) * 1.12 || 1;
  const sx = (v) => CH.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
  const sy = (v) => CH.t + ih - (v / ymax) * ih;

  const step = Math.pow(10, Math.floor(Math.log10(ymax / 4)));
  const tick = [1, 2, 2.5, 5, 10].map((m) => m * step).find((v) => ymax / v <= 5) || step;

  let svg = `<svg viewBox="0 0 ${CH.W} ${CH.H}" id="vol" role="img" aria-label="Số bài mỗi giờ của hai hashtag trong 24 giờ">`;
  for (let v = 0; v <= ymax; v += tick) {
    svg += `<line class="grid" x1="${CH.l}" y1="${sy(v).toFixed(1)}" x2="${CH.l + iw}" y2="${sy(v).toFixed(1)}"/>`
         + `<text class="tick" x="${CH.l - 10}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${short(v)}</text>`;
  }
  svg += `<line class="axis" x1="${CH.l}" y1="${CH.t + ih}" x2="${CH.l + iw}" y2="${CH.t + ih}"/>`;

  // nhan truc x moi 3 gio, kem moc ngay khi sang ngay moi
  for (let t = Math.ceil((x0 + TZ) / 10800e3) * 10800e3 - TZ; t <= x1; t += 10800e3) {
    const isMidnight = hm(t) === '00:00';
    svg += `<text class="tick" x="${sx(t).toFixed(1)}" y="${CH.H - 24}" text-anchor="middle">${hm(t)}</text>`;
    if (isMidnight) svg += `<text class="tick dim" x="${sx(t).toFixed(1)}" y="${CH.H - 10}" text-anchor="middle">3/10</text>`;
  }
  svg += `<text class="tick dim" x="${CH.l}" y="${CH.H - 10}" text-anchor="start">2/10</text>`;

  const labels = [];
  tags.forEach((t, i) => {
    const c = `var(--series-${i + 1})`;
    const d = t.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p.at).toFixed(1)},${sy(p.rate).toFixed(1)}`).join('');
    svg += `<path class="line" stroke="${c}" d="${d}"/>`;
    const pk = t.peak;
    if (pk) svg += `<circle class="dot peak" cx="${sx(pk.at).toFixed(1)}" cy="${sy(pk.rate).toFixed(1)}" r="4.5" fill="${c}"/>`;
    const last = t.points.at(-1);
    labels.push({ tag: t.tag, color: c, ax: sx(last.at), ay: sy(last.rate), y: sy(last.rate) });
  });

  // Nhan cuoi duong: day ra vua du de khong chong nhau; nhan nao bi day lech
  // khoi diem neo thi ve duong dan noi lai, neu khong nguoi doc se gan nham
  // nhan vao duong ben canh.
  const GAP = 15;
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < GAP) labels[i].y = labels[i - 1].y + GAP;
  }
  const over = labels.length ? labels.at(-1).y - (CH.t + ih) : 0;
  if (over > 0) for (const l of labels) l.y -= over;

  for (const l of labels) {
    if (Math.abs(l.y - l.ay) > 2) {
      svg += `<path class="leader" stroke="${l.color}" d="M${(l.ax + 5).toFixed(1)},${l.ay.toFixed(1)}`
           + `L${(l.ax + 9).toFixed(1)},${l.y.toFixed(1)}L${(l.ax + 12).toFixed(1)},${l.y.toFixed(1)}"/>`;
    }
    // Nhan truc tiep chi can du de phan biet HAI duong voi nhau — ten day du
    // nam o chu giai ngay duoi va o bang so lieu, nen cat ngan o day khong mat gi.
    const name = display(l.tag);
    const brief = name.length > 13 ? name.slice(0, 12) + '…' : name;
    svg += `<text class="endlabel" x="${(l.ax + 15).toFixed(1)}" y="${(l.y + 4).toFixed(1)}">${esc(brief)}</text>`;
  }

  svg += `<line class="hair" id="hair" x1="0" y1="${CH.t}" x2="0" y2="${CH.t + ih}" style="display:none"/>`;
  svg += `<g id="hdots"></g>`;
  svg += `<rect id="hit" x="${CH.l}" y="${CH.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  svg += '</svg>';

  const geo = {
    l: CH.l, t: CH.t, iw, ih, x0, x1, ymax,
    series: tags.map((t, i) => ({ tag: display(t.tag), i: i + 1, pts: t.points.map((p) => [p.at, p.rate, p.exact ? 1 : 0, p.rtShare ?? 0]) })),
  };
  return { svg, geo };
}

/* --------------------------------------------------------- bieu do cot */

function hbars(rows, { fmtVal = fmt, series = 1, nameW = 160 } = {}) {
  if (!rows.length) return '<p class="empty">Không có dữ liệu.</p>';
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return `<div class="bars" style="--nw:${nameW}px">${rows.map((r) => `
    <div class="bar-row" data-tip="${esc(r.tip || `${r.label} · ${fmtVal(r.value)}`)}" tabindex="0">
      <div class="bar-name">${esc(r.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max((r.value / max) * 100, 1.2).toFixed(1)}%;background:var(--series-${series})"></div></div>
      <div class="bar-val">${esc(fmtVal(r.value))}</div>
    </div>`).join('')}</div>`;
}

/* ---------------------------------------------------------------- trang */

export function buildTrendDashboard(dataFile, { out = 'dashboard-trend.html', title = 'Phân tích hashtag', compare = null, calibrate = null } = {}) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(dataFile), 'utf8'));
  const cmp = Array.isArray(compare) ? { rows: compare } : (compare || {});
  const cmpRows = (cmp.rows || []).filter((c) => !c.hidden);

  const cal = calibrate?.factor || 1;
  const tags = Object.entries(raw.tags).map(([tag, rec]) => analyze(tag, rec, raw.collectedAt, cal));
  const { svg, geo } = volumeChart(tags);

  const main = tags[0];
  // Hai hashtag di kem nhau trong gan nhu moi bai, nen cong tong lai la dem hai
  // lan cung mot tweet. Lay hashtag lon hon lam quy mo chung cua chien dich.
  const scale = tags.reduce((a, t) => Math.max(a, t.estimatedTotal), 0);

  // Do chong lan THAT: dem tren chinh mau xem bao nhieu bai mang ca hai tag.
  const marks = Object.keys(raw.tags).map((q) => {
    const m = q.replace(/^"|"$/g, '');
    return { q, re: new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i') };
  });
  const overlap = marks.length === 2 ? (() => {
    const pool = raw.tags[marks[0].q].tweets;
    const both = pool.filter((t) => marks[1].re.test(t.text || '')).length;
    return { both, pool: pool.length, pctBoth: pool.length ? both / pool.length : 0 };
  })() : null;

  const windowLabel = `${dhm(raw.from * 1000)} → ${dhm(raw.to * 1000)} (giờ VN, +07)`;
  const hours = (raw.to - raw.from) / 3600;

  const tiles = [
    calibrate
      ? { lab: 'Tổng bài trong 24h', val: short(scale),
          sub: `đã hiệu chỉnh ×${cal.toFixed(2)} — search chỉ thấy ${Math.round(100 / cal)}%`, hero: true }
      : { lab: 'Tổng bài trong 24h', val: short(scale), sub: `đã tính cả retweet · sai số thực tế quanh ±10%`, hero: true },
    ...(calibrate ? [{ lab: 'Search đo được', val: short(scale / cal), sub: `chặn dưới — mốc: ${calibrate.source || ''}` }] : []),
    { lab: 'Retweet', val: pct(main.rtShare * 100, 100), sub: `${short(main.estRetweets)} lượt — còn lại ${short(main.estOriginals)} bài gốc` },
    { lab: 'Đỉnh', val: short(main.peak?.rate) + '/giờ', sub: `lúc ${dhm(main.peak?.at)} · TB ${short(scale / hours)}/giờ` },
    { lab: 'Tài khoản khác nhau', val: fmt(main.uniqueAuthors), sub: `trong ${fmt(main.sampleAll)} bài lấy mẫu` },
  ];

  const authorRows = main.authors.slice(0, 12).map(([u, r]) => ({
    label: '@' + u,
    value: r.posts,
    tip: `@${u} · ${r.posts} bài trong mẫu (${r.rts} retweet) · ${fmt(r.followers)} follower`
       + ` · ước ${short(r.posts * main.scale)} bài cả ngày`,
  }));

  const LANG = { th: 'Thái', vi: 'Việt', en: 'Anh', in: 'Indonesia', ja: 'Nhật', ko: 'Hàn', zh: 'Trung', es: 'Tây Ban Nha', pt: 'Bồ Đào Nha', tl: 'Tagalog', my: 'Miến Điện', km: 'Khmer', lo: 'Lào', et: 'Estonia', ca: 'Catalan', fr: 'Pháp', de: 'Đức', ru: 'Nga', ar: 'Ả Rập', hi: 'Hindi', qme: 'Chỉ media', qst: 'Quá ngắn', qam: 'Chỉ tag người', und: 'Không rõ', art: 'Ký hiệu', zxx: 'Không chữ' };
  const langRows = main.langRows.slice(0, 8).map(([l, n]) => ({
    label: `${LANG[l] || l} (${l})`,
    value: n,
    tip: `${LANG[l] || l}: ${n}/${main.sample} bài trong mẫu — ${pct(n, main.sample)}`,
  }));

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{color-scheme:light;
    --surface-1:#fcfcfb; --plane:#f9f9f7;
    --text-primary:#0b0b0b; --text-secondary:#52514e; --muted:#898781;
    --grid:#e4e3dc; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --wash:rgba(11,11,11,.04);
${SERIES.map((s, i) => `    --series-${i + 1}:${s.light};`).join('\n')}
  }
  @media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;
    --surface-1:#1a1a19; --plane:#0d0d0d;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#3d3d39; --border:rgba(255,255,255,.10); --wash:rgba(255,255,255,.05);
${SERIES.map((s, i) => `    --series-${i + 1}:${s.dark};`).join('\n')}
  }}
  :root[data-theme="dark"]{color-scheme:dark;
    --surface-1:#1a1a19; --plane:#0d0d0d;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#3d3d39; --border:rgba(255,255,255,.10); --wash:rgba(255,255,255,.05);
${SERIES.map((s, i) => `    --series-${i + 1}:${s.dark};`).join('\n')}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--plane);color:var(--text-primary);
    font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased}
  .viz-root{max-width:960px;margin:0 auto;padding:30px 20px 60px}
  header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:3px}
  h1{font-size:21px;margin:0;letter-spacing:-.01em}
  .sub{color:var(--text-secondary);font-size:13px;margin:0 0 20px}
  .toggle{margin-left:auto;background:var(--surface-1);color:var(--text-secondary);
    border:1px solid var(--border);border-radius:999px;padding:6px 14px;font-size:12px;cursor:pointer}
  .toggle:hover{background:var(--wash)}
  .card{background:var(--surface-1);border:1px solid var(--border);border-radius:14px;
    padding:20px 22px;margin-bottom:16px}
  h2{font-size:14px;margin:0 0 3px;font-weight:600}
  .cap{color:var(--text-secondary);font-size:12.5px;margin:0 0 16px;max-width:66ch}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:16px}
  .tile{background:var(--surface-1);border:1px solid var(--border);border-radius:14px;padding:15px 17px}
  .tile .lab{color:var(--text-secondary);font-size:12px;margin-bottom:7px}
  .tile .val{font-size:27px;font-weight:600;letter-spacing:-.025em;line-height:1.1}
  .tile.hero .val{font-size:46px}
  .tile .s{color:var(--muted);font-size:11.5px;margin-top:5px}
  svg{width:100%;height:auto;display:block;overflow:visible}
  .grid{stroke:var(--grid);stroke-width:1}
  .axis{stroke:var(--axis);stroke-width:1}
  .tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
  .tick.dim{opacity:.7;font-size:10px}
  .line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
  .dot{stroke:var(--surface-1);stroke-width:2}
  .endlabel{fill:var(--text-secondary);font-size:11.5px}
  .leader{fill:none;stroke-width:1;opacity:.5}
  .hair{stroke:var(--axis);stroke-width:1}
  .legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;font-size:12.5px;color:var(--text-secondary)}
  .legend i{display:inline-block;width:15px;height:2px;border-radius:1px;vertical-align:middle;margin-right:7px}
  .bars{display:flex;flex-direction:column;gap:8px}
  .bar-row{display:grid;grid-template-columns:var(--nw,160px) 1fr 58px;align-items:center;gap:11px;
    border-radius:5px;outline-offset:2px}
  .bar-row:hover,.bar-row:focus-visible{background:var(--wash)}
  .bar-name{font-size:12.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{height:20px;display:flex;align-items:center}
  .bar-fill{height:14px;border-radius:0 4px 4px 0}
  .bar-val{font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums;color:var(--text-secondary)}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
  th{color:var(--text-secondary);font-weight:600;font-size:12px;white-space:nowrap}
  td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tbody tr:last-child td{border-bottom:none}
  td a{color:var(--text-primary);text-decoration:underline;text-decoration-color:var(--axis);
    text-underline-offset:2px}
  td a:hover{text-decoration-color:var(--text-primary)}
  .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;vertical-align:-1px}
  details{margin-top:14px}
  summary{cursor:pointer;font-size:12.5px;color:var(--text-secondary);padding:5px 0}
  summary:hover{color:var(--text-primary)}
  .empty{color:var(--muted);font-size:13px}
  .note{color:var(--muted);font-size:11.5px;margin:14px 0 0;line-height:1.6}
  .tw{font-size:12.5px;color:var(--text-secondary);max-width:62ch;word-break:break-word}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px 22px;margin:0}
  .fact{border-left:2px solid var(--border);padding-left:12px}
  .fact b{display:block;font-size:20px;font-weight:600;letter-spacing:-.02em}
  .fact span{color:var(--text-secondary);font-size:12px}
  #tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .09s;
    background:var(--text-primary);color:var(--plane);padding:7px 10px;border-radius:7px;
    font-size:12px;line-height:1.5;z-index:9;max-width:320px;box-shadow:0 4px 14px rgba(0,0,0,.18)}
  #tip .r{display:flex;align-items:center;gap:7px;white-space:nowrap}
  #tip .k{display:inline-block;width:12px;height:2px;border-radius:1px;flex:none}
  #tip .v{font-weight:600;font-variant-numeric:tabular-nums}
  #tip .n{opacity:.72}
  #tip .h{font-weight:600;margin-bottom:4px}
</style></head>
<body><div class="viz-root">

<header><h1>${esc(title)}</h1>
  <button class="toggle" id="themeBtn">Sáng / Tối</button></header>
<p class="sub">${esc(windowLabel)} · lấy mẫu ${raw.slices} lát cắt · ${fmt(tags.reduce((a, t) => a + t.sample, 0))} bài thu thập · chi phí $${(raw.cost || 0).toFixed(3)}</p>

<div class="tiles">${tiles.map((t) => `
  <div class="tile${t.hero ? ' hero' : ''}"><div class="lab">${esc(t.lab)}</div>
    <div class="val">${esc(t.val)}</div><div class="s">${esc(t.sub)}</div></div>`).join('')}</div>

${cmpRows.length ? `
<div class="card">
  <h2>${esc(cmp.title || 'Đối chiếu với con số bạn thấy ở nơi khác')}</h2>
  <p class="cap">${esc(cmp.caption || 'Cùng một trend có thể ra nhiều con số rất khác nhau tuỳ vào đếm cái gì. Bảng này liệt kê từng cách đếm và con số nó cho ra, để biết con số nào so được với con số nào.')}</p>
  <table><thead><tr><th>${esc(cmp.columns?.label || 'Cách đếm')}</th><th class="n">${esc(cmp.columns?.value || 'Ra bao nhiêu')}</th><th>${esc(cmp.columns?.note || 'Ghi chú')}</th></tr></thead>
  <tbody>${cmpRows.map((c) => `<tr>
    <td${c.highlight ? ' style="font-weight:600"' : ''}>${esc(c.label)}</td>
    <td class="n"${c.highlight ? ' style="font-weight:600"' : ''}>${esc(typeof c.value === 'number' ? fmt(c.value) : c.value)}</td>
    <td class="tw">${esc(c.note || '')}</td></tr>`).join('')}</tbody></table>
</div>` : ''}

<div class="card">
  <h2>Nhịp đăng theo thời gian</h2>
  <p class="cap">Số bài mỗi giờ <b>tính cả retweet</b>. Mỗi 30 phút đo hai cửa sổ hẹp ở vị trí ngẫu nhiên và đếm trọn số bài trong đó, rồi suy ra tốc độ. Chấm tròn là đỉnh của từng hashtag. Di chuột để xem cả hai mốc cùng lúc.</p>
  ${svg}
  <div class="legend">${tags.map((t, i) => `<span><i style="background:var(--series-${i + 1})"></i>${esc(display(t.tag))}</span>`).join('')}</div>
  <p class="note">Hai hashtag xuất hiện cùng nhau trong hầu hết bài đăng, nên hai đường gần như trùng — đó là <b>cùng một tập tweet</b>, không phải hai làn sóng độc lập. Cộng hai con số lại là đếm hai lần.
  <br>Riêng <b>vùng đỉnh thì đừng đọc từng điểm một</b>. Ở đó cửa sổ đo chỉ còn vài giây, mà retweet lại đổ thành từng cụm — một bài được retweet 50 lần trong 3 giây sẽ thổi phồng đúng điểm rơi vào đó. Vì vậy hai đường vênh nhau tới hai lần ở đỉnh là nhiễu chứ không phải hai hashtag chạy khác nhau. Tổng 24 giờ thì ổn định, vì nó cộng ${main.points.length * 2} cửa sổ độc lập lại — và hai hashtag ra hai con số lệch nhau chưa tới 0,1%.</p>
</div>

<div class="grid2">
  <div class="card">
    <h2>Tài khoản đăng nhiều nhất</h2>
    <p class="cap">Đếm cả bài gốc lẫn retweet, trong ${fmt(main.sampleAll)} bài lấy mẫu của ${esc(display(main.tag))}.</p>
    ${hbars(authorRows, { nameW: 150 })}
  </div>
  <div class="card">
    <h2>Ngôn ngữ</h2>
    <p class="cap">Chỉ tính ${fmt(main.sample)} bài gốc — retweet mang ngôn ngữ của bài được retweet, không phải của người bấm. Bài ngắn toàn emoji hay bị gán nhầm thành “không rõ”.</p>
    ${hbars(langRows, { series: 2, nameW: 130, fmtVal: (v) => `${pct(v, main.sample)}` })}
  </div>
</div>

<div class="card">
  <h2>Chân dung hoạt động</h2>
  <p class="cap">Những chỉ số cho biết trend này do người xem thật hay do cày tag tạo ra. Các chỉ số tương tác chỉ tính trên ${fmt(main.sample)} <b>bài gốc</b> — retweet không có lượt thích của riêng nó.${calibrate ? `
  <br><b>Đọc thận trọng:</b> các tỷ lệ dưới đây tính trên phần search <i>nhìn thấy được</i>. Phần ${100 - Math.round(100 / cal)}% bị thiếu nhiều khả năng chính là nhóm bài trùng lặp hàng loạt mà bộ lọc chất lượng của X giấu đi — nên mức độ cày tag thật có thể <b>cao hơn</b> những con số này.` : ''}</p>
  <div class="facts">
    <div class="fact"><b>${main.postsPerAuthor.toFixed(1)}</b><span>bài mỗi tài khoản — ${fmt(main.uniqueAuthors)} tài khoản trong ${fmt(main.sampleAll)} bài mẫu</span></div>
    <div class="fact"><b>${pct(main.onceOnly, main.uniqueAuthors)}</b><span>tài khoản chỉ đăng đúng 1 bài</span></div>
    <div class="fact"><b>${pct(main.top10Share * main.sample, main.sample)}</b><span>lượng bài đến từ 10 tài khoản đăng nhiều nhất</span></div>
    <div class="fact"><b>${pct(main.replies, main.sample)}</b><span>là trả lời người khác, không phải bài gốc</span></div>
    <div class="fact"><b>${pct(main.zeroLike, main.sample)}</b><span>không có lượt thích nào — trung vị đúng bằng 0</span></div>
    <div class="fact"><b>${fmt(main.likeP99)}</b><span>lượt thích của nhóm 1% dẫn đầu — chính nhóm này kéo trung bình lên ${fmt(main.eng.likes / main.sample)}</span></div>
    <div class="fact"><b>${pct(main.fresh, main.sample)}</b><span>từ tài khoản lập dưới 90 ngày (trung vị ${fmt(main.medFollowers)} follower)</span></div>
${overlap ? `    <div class="fact"><b>${pct(overlap.both, overlap.pool)}</b><span>bài mang <i>cả hai</i> hashtag cùng lúc</span></div>` : ''}
  </div>
</div>

<div class="card">
  <h2>Bài nổi bật nhất</h2>
  <p class="cap">Theo xếp hạng Top của chính X trong cửa sổ này.</p>
  <table><thead><tr><th>Tài khoản</th><th>Nội dung</th><th class="n">Thích</th><th class="n">RT</th><th class="n">Xem</th></tr></thead>
  <tbody>${main.top.slice(0, 10).map((t) => `<tr>
    <td style="white-space:nowrap"><a href="https://x.com/${esc(t.author)}/status/${esc(t.id)}" target="_blank" rel="noopener">@${esc(t.author)}</a></td>
    <td class="tw">${esc((t.text || '').replace(/\s+/g, ' ').slice(0, 140))}</td>
    <td class="n">${fmt(t.likes)}</td><td class="n">${fmt(t.rts)}</td><td class="n">${fmt(t.views)}</td></tr>`).join('')}</tbody></table>
</div>

<div class="card">
  <h2>Số liệu đầy đủ</h2>
  <p class="cap">Cùng dữ liệu với biểu đồ ở trên, dạng bảng.</p>
  <table><thead><tr><th>Hashtag</th><th class="n">Tổng 24h</th><th class="n">Bài gốc</th><th class="n">Retweet</th>
    <th class="n">Sai số đếm</th><th class="n">Đỉnh/giờ</th><th class="n">Đáy/giờ</th><th class="n">Mẫu</th><th class="n">Tài khoản</th></tr></thead>
  <tbody>${tags.map((t, i) => `<tr>
    <td><i class="swatch" style="background:var(--series-${i + 1})"></i>${esc(display(t.tag))}</td>
    <td class="n">${fmt(t.estimatedTotal)}</td><td class="n">${fmt(t.estOriginals)}</td>
    <td class="n">${fmt(t.estRetweets)} <span style="color:var(--muted)">(${pct(t.rtShare * 100, 100)})</span></td>
    <td class="n">±${t.marginPct}%</td>
    <td class="n">${fmt(t.peak?.rate)}</td><td class="n">${fmt(t.low?.rate)}</td>
    <td class="n">${fmt(t.sampleAll)}</td><td class="n">${fmt(t.uniqueAuthors)}</td></tr>`).join('')}</tbody></table>

  <details><summary>Bảng từng lát cắt 30 phút (${main.points.length} dòng)</summary>
    <table style="margin-top:10px"><thead><tr><th>Mốc (+07)</th>
      ${tags.map((t) => `<th class="n">${esc(display(t.tag).slice(0, 13))}</th>`).join('')}</tr></thead>
    <tbody>${main.points.map((p, idx) => `<tr><td>${dhm(p.at)}</td>
      ${tags.map((t) => { const q = t.points[idx]; return `<td class="n">${q ? (q.exact ? '' : '&gt;') + fmt(q.rate) : '—'}</td>`; }).join('')}
    </tr>`).join('')}</tbody></table></details>

  <p class="note">
    <b>Cách đo.</b> Hashtag này chạy quá nhanh để kéo hết 24 giờ (ước ${short(scale)} bài, tốn khoảng $${(scale * 0.00015).toFixed(0)} tiền API).
    Thay vào đó mỗi 30 phút đo <b>hai</b> cửa sổ hẹp ở vị trí <b>ngẫu nhiên</b> trong lát, đếm trọn số bài trong từng cửa sổ rồi suy ra tốc độ.
    Độ rộng cửa sổ là do mình chọn nên biết chính xác, nên sai số chủ yếu là sai số đếm
    (±${main.marginPct}% trên toàn bộ ${fmt(tags.reduce((a, t) => a + t.sampleAll, 0))} bài mẫu).
    ${main.overflowed ? `Có ${main.overflowed}/${main.points.length} lát vẫn tràn trang — đánh dấu <code>&gt;</code>, con số đó là <i>chặn dưới</i>.` : 'Không lát nào bị tràn trang.'}
    <br><b>Vì sao phải ngẫu nhiên.</b> Bài đăng dồn lại ở các mốc tròn. Đo cố định ngay đầu mỗi lát 30 phút thì lần nào cũng rơi trúng đợt dồn
    và suy ra tỷ lệ cao gấp rưỡi: tại một lát đã kiểm chứng, đo ở mốc tròn ra 10.457 bài/giờ, trung bình 8 vị trí ra 6.579, còn đếm trọn
    10 phút — không lấy mẫu, không suy luận — ra <b>6.276</b>. Rải ngẫu nhiên thì ước lượng không còn lệch một phía.
    <br><b>Retweet được tính.</b> Search của X loại retweet ra theo mặc định; phải thêm <code>include:nativeretweets</code> mới thấy.
    Với trend fandom thì retweet chiếm ${pct(main.rtShare * 100, 100)} tổng lượng bài, bỏ qua là hụt mất phần lớn.
    <br><b>Lưu ý về tương tác.</b> Bài đăng lúc 20h tối qua đã có 24 giờ để tích lượt thích, bài đăng lúc 19h hôm nay mới có 1 giờ —
    nên con số tương tác trung bình nghiêng về phía thấp.
  </p>
</div>

<div id="tip" role="status" aria-live="polite"></div>
<script id="geo" type="application/json">${JSON.stringify(geo).replace(/</g, '\\u003c')}</script>
<script>
(function(){
  var tip=document.getElementById('tip');
  function place(e){var x=e.clientX+16,y=e.clientY-12;
    if(x+tip.offsetWidth>innerWidth-8)x=e.clientX-tip.offsetWidth-16;
    if(y+tip.offsetHeight>innerHeight-8)y=innerHeight-tip.offsetHeight-8;
    tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.max(8,y)+'px';}
  function hide(){tip.style.opacity=0;}

  // --- tooltip cho cac mark co data-tip (thanh ngang)
  document.addEventListener('pointerover',function(e){
    var el=e.target.closest('[data-tip]');if(!el)return;
    tip.textContent=el.getAttribute('data-tip');tip.style.opacity=1;place(e);});
  document.addEventListener('pointermove',function(e){
    if(tip.style.opacity==='1'&&e.target.closest('[data-tip]'))place(e);});
  document.addEventListener('pointerout',function(e){
    if(e.target.closest('[data-tip]'))hide();});
  document.addEventListener('focusin',function(e){
    var el=e.target.closest('[data-tip]');if(!el)return;
    var r=el.getBoundingClientRect();tip.textContent=el.getAttribute('data-tip');
    tip.style.opacity=1;place({clientX:r.right-120,clientY:r.top});});
  document.addEventListener('focusout',hide);

  // --- crosshair cho bieu do duong: bat theo X gan nhat, hien MOI series
  var geo=JSON.parse(document.getElementById('geo').textContent);
  var svg=document.getElementById('vol'),hit=document.getElementById('hit'),
      hair=document.getElementById('hair'),hdots=document.getElementById('hdots');
  if(!svg||!geo)return;
  var SVGNS='http://www.w3.org/2000/svg';
  var sx=function(v){return geo.l+(geo.x1===geo.x0?geo.iw/2:(v-geo.x0)/(geo.x1-geo.x0)*geo.iw);};
  var sy=function(v){return geo.t+geo.ih-v/geo.ymax*geo.ih;};
  var nf=new Intl.NumberFormat('en-US');
  function label(ms){var d=new Date(ms+7*3600e3).toISOString();
    return d.slice(8,10)+'/'+d.slice(5,7)+' '+d.slice(11,16);}

  function move(e){
    var r=svg.getBoundingClientRect();
    var vx=(e.clientX-r.left)/r.width*${CH.W};
    var frac=Math.min(1,Math.max(0,(vx-geo.l)/geo.iw));
    var want=geo.x0+frac*(geo.x1-geo.x0);
    var pts=geo.series[0].pts,k=0,best=Infinity;
    for(var i=0;i<pts.length;i++){var d=Math.abs(pts[i][0]-want);if(d<best){best=d;k=i;}}
    var at=pts[k][0],X=sx(at);
    hair.setAttribute('x1',X);hair.setAttribute('x2',X);hair.style.display='';
    while(hdots.firstChild)hdots.removeChild(hdots.firstChild);
    tip.textContent='';
    var h=document.createElement('div');h.className='h';h.textContent=label(at);tip.appendChild(h);
    geo.series.forEach(function(s){
      var p=s.pts[k];if(!p)return;
      var c=document.createElementNS(SVGNS,'circle');
      c.setAttribute('cx',X);c.setAttribute('cy',sy(p[1]));c.setAttribute('r',4);
      c.setAttribute('class','dot');c.setAttribute('fill','var(--series-'+s.i+')');
      hdots.appendChild(c);
      var row=document.createElement('div');row.className='r';
      var key=document.createElement('i');key.className='k';
      key.style.background='var(--series-'+s.i+')';row.appendChild(key);
      var v=document.createElement('span');v.className='v';
      v.textContent=(p[2]?'':'>')+nf.format(p[1])+' bài/giờ';row.appendChild(v);
      if(p[3]){var rt=document.createElement('span');rt.className='n';
        rt.textContent='('+p[3]+'% RT)';row.appendChild(rt);}
      var n=document.createElement('span');n.className='n';n.textContent=s.tag;row.appendChild(n);
      tip.appendChild(row);
    });
    tip.style.opacity=1;place(e);
  }
  hit.addEventListener('pointermove',move);
  hit.addEventListener('pointerenter',move);
  hit.addEventListener('pointerleave',function(){hair.style.display='none';
    while(hdots.firstChild)hdots.removeChild(hdots.firstChild);hide();});

  document.getElementById('themeBtn').addEventListener('click',function(){
    var r=document.documentElement;
    var cur=r.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
    r.dataset.theme=cur==='dark'?'light':'dark';});
})();
</script>
</div></body></html>`;

  const file = path.resolve(process.cwd(), out);
  fs.writeFileSync(file, html);
  log.ok(`Da tao ${path.relative(process.cwd(), file)}`);
  return file;
}
