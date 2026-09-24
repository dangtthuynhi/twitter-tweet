import fs from 'node:fs';
import path from 'node:path';
import { loadData } from './hashtag.js';
import { log } from './logger.js';

// Bang mau da chay qua scripts/validate_palette.js cua skill dataviz:
// sang va toi deu PASS ca 5 kiem tra tren danh sach cap ke nhau.
const SERIES = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const short = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
};
const hhmm = (t) => new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Gop du lieu tho thanh thu dashboard can. */
function aggregate(data, { days = 7 } = {}) {
  const cutoff = Date.now() - days * 86400e3;
  const tags = [];

  for (const [tag, rec] of Object.entries(data.tags || {})) {
    const snaps = (rec.snapshots || []).filter((s) => s.at >= cutoff);
    if (!snaps.length) continue;

    const authors = {};
    let likes = 0, retweets = 0, views = 0, replies = 0, cost = 0;
    for (const s of snaps) {
      likes += s.likes || 0; retweets += s.retweets || 0;
      views += s.views || 0; replies += s.replies || 0; cost += s.cost || 0;
      for (const [u, a] of Object.entries(s.authors || {})) {
        authors[u] ||= { posts: 0, likes: 0, followers: a.followers || 0 };
        authors[u].posts += a.posts; authors[u].likes += a.likes || 0;
        authors[u].followers = Math.max(authors[u].followers, a.followers || 0);
      }
    }
    const rates = snaps.map((s) => s.ratePerHour).filter((r) => r != null);
    tags.push({
      tag, snaps, authors, likes, retweets, views, replies, cost,
      latestRate: rates.at(-1) ?? null,
      avgRate: rates.length ? Math.round(rates.reduce((a, b) => a + b) / rates.length) : null,
      peakRate: rates.length ? Math.max(...rates) : null,
      uniqueAuthors: Object.keys(authors).length,
      topTweet: snaps.map((s) => s.topTweet).filter(Boolean).sort((a, b) => b.likes - a.likes)[0],
    });
  }
  return tags.sort((a, b) => (b.avgRate ?? 0) - (a.avgRate ?? 0)).slice(0, SERIES.length);
}

/* ---------------------------------------------------------- bieu do duong */

function lineChart(tags) {
  const W = 760, H = 300, P = { t: 16, r: 92, b: 34, l: 52 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;

  const pts = tags.flatMap((t) => t.snaps.map((s) => ({ x: s.at, y: s.ratePerHour })))
    .filter((p) => p.y != null);
  if (!pts.length) return '<p class="empty">Chua co du lieu. Chay <code>node src/cli.js hashtag</code> vai lan.</p>';

  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const ymax = Math.max(...pts.map((p) => p.y)) * 1.15 || 1;
  const sx = (v) => P.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
  const sy = (v) => P.t + ih - (v / ymax) * ih;

  // truc y lam tron thanh so dep
  const step = Math.pow(10, Math.floor(Math.log10(ymax / 4)));
  const tick = [1, 2, 5, 10].map((m) => m * step).find((v) => ymax / v <= 5) || step;
  const ticks = [];
  for (let v = 0; v <= ymax; v += tick) ticks.push(v);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="So bai moi gio theo thoi gian">`;
  for (const v of ticks) {
    svg += `<line class="grid" x1="${P.l}" y1="${sy(v).toFixed(1)}" x2="${P.l + iw}" y2="${sy(v).toFixed(1)}"/>`
         + `<text class="tick" x="${P.l - 10}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${short(v)}</text>`;
  }
  svg += `<line class="axis" x1="${P.l}" y1="${P.t + ih}" x2="${P.l + iw}" y2="${P.t + ih}"/>`;
  svg += `<text class="tick" x="${P.l}" y="${H - 10}">${esc(hhmm(x0))}</text>`
       + `<text class="tick" x="${P.l + iw}" y="${H - 10}" text-anchor="end">${esc(hhmm(x1))}</text>`;

  const labels = [];
  tags.forEach((t, i) => {
    const series = t.snaps.filter((s) => s.ratePerHour != null)
      .map((s) => ({ x: sx(s.at), y: sy(s.ratePerHour), raw: s }));
    if (!series.length) return;
    const c = `var(--series-${i + 1})`;
    if (series.length > 1) {
      svg += `<path class="line" stroke="${c}" d="${series.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')}"/>`;
    }
    // cham tron co vong surface 2px de khong bi nuot khi cac duong cat nhau
    for (const p of series) {
      svg += `<circle class="dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${c}"`
           + ` data-tip="${esc(t.tag)} · ${fmt(p.raw.ratePerHour)} bai/gio · ${esc(hhmm(p.raw.at))}"/>`;
    }
    const last = series.at(-1);
    labels.push({ tag: t.tag, color: c, ax: last.x, ay: last.y, y: last.y });
  });

  // Giai va cham nhan cuoi duong: day ra vua du de khong chong nhau, va bat cu
  // nhan nao bi day lech khoi diem neo thi ve them duong dan noi — day xuong
  // ma khong noi lai se lam nhan roi khoi duong cua no va doc thanh nhieu.
  const GAP = 14;
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < GAP) labels[i].y = labels[i - 1].y + GAP;
  }
  const overflow = labels.length ? labels.at(-1).y - (P.t + ih) : 0;
  if (overflow > 0) for (const l of labels) l.y -= overflow;   // keo ca cum len neu tran day

  for (const l of labels) {
    if (Math.abs(l.y - l.ay) > 2) {
      svg += `<path class="leader" d="M${(l.ax + 5).toFixed(1)},${l.ay.toFixed(1)}`
           + `L${(l.ax + 9).toFixed(1)},${l.y.toFixed(1)}L${(l.ax + 12).toFixed(1)},${l.y.toFixed(1)}"`
           + ` stroke="${l.color}"/>`;
    }
    svg += `<text class="endlabel" x="${(l.ax + 15).toFixed(1)}" y="${(l.y + 4).toFixed(1)}">${esc(l.tag)}</text>`;
  }

  return svg + '</svg>';
}

/* ------------------------------------------------------------ bieu do cot */

function authorChart(tags) {
  const rows = {};
  for (const t of tags) {
    for (const [u, a] of Object.entries(t.authors)) {
      rows[u] ||= { posts: 0, followers: a.followers };
      rows[u].posts += a.posts;
      rows[u].followers = Math.max(rows[u].followers, a.followers);
    }
  }
  const top = Object.entries(rows).sort((a, b) => b[1].posts - a[1].posts).slice(0, 10);
  if (!top.length) return '<p class="empty">Chua co du lieu tac gia.</p>';

  const max = top[0][1].posts;
  return `<div class="bars">${top.map(([u, r]) => `
    <div class="bar-row" data-tip="@${esc(u)} · ${fmt(r.posts)} bai · ${fmt(r.followers)} follower">
      <div class="bar-name">@${esc(u)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.posts / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-val">${fmt(r.posts)}</div>
    </div>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- trang */

export function buildDashboard({ days = 7, out = 'dashboard.html' } = {}) {
  const tags = aggregate(loadData(), { days });
  if (!tags.length) {
    log.warn('Chua co du lieu hashtag nao. Chay `node src/cli.js hashtag` truoc.');
    return null;
  }

  const totalRate = tags.reduce((a, t) => a + (t.latestRate ?? 0), 0);
  const totalAuthors = new Set(tags.flatMap((t) => Object.keys(t.authors))).size;
  const totalViews = tags.reduce((a, t) => a + t.views, 0);
  const totalCost = tags.reduce((a, t) => a + t.cost, 0);
  const scans = tags.reduce((a, t) => a + t.snaps.length, 0);

  const tiles = [
    { label: 'Bài mỗi giờ, mới nhất', value: fmt(totalRate), sub: `${tags.length} hashtag` },
    { label: 'Ước tính mỗi ngày', value: short(totalRate * 24), sub: 'suy ra từ tốc độ' },
    { label: 'Tác giả khác nhau', value: fmt(totalAuthors), sub: `trong ${scans} lần quét` },
    { label: 'Chi phí đã dùng', value: '$' + totalCost.toFixed(3), sub: `${days} ngày qua` },
  ];

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Theo dõi hashtag</title>
<style>
  :root{color-scheme:light;
    --surface-1:#fcfcfb; --plane:#f9f9f7;
    --text-primary:#0b0b0b; --text-secondary:#52514e; --muted:#898781;
    --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
${SERIES.map((s, i) => `    --series-${i + 1}:${s.light};`).join('\n')}
  }
  @media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;
    --surface-1:#1a1a19; --plane:#0d0d0d;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
${SERIES.map((s, i) => `    --series-${i + 1}:${s.dark};`).join('\n')}
  }}
  :root[data-theme="dark"]{color-scheme:dark;
    --surface-1:#1a1a19; --plane:#0d0d0d;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
${SERIES.map((s, i) => `    --series-${i + 1}:${s.dark};`).join('\n')}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--plane);color:var(--text-primary);
    font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  .viz-root{max-width:900px;margin:0 auto;padding:28px 20px 56px;color:var(--text-primary)}
  header{display:flex;align-items:baseline;gap:12px;margin-bottom:4px}
  h1{font-size:20px;margin:0}
  .sub{color:var(--text-secondary);font-size:13px;margin:0 0 22px}
  .card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;
    padding:18px 20px;margin-bottom:16px}
  h2{font-size:14px;margin:0 0 2px;font-weight:600}
  .cap{color:var(--text-secondary);font-size:12px;margin:0 0 14px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px;margin-bottom:16px}
  .tile{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
  .tile .lab{color:var(--text-secondary);font-size:12px;margin-bottom:6px}
  .tile .val{font-size:26px;font-weight:600;letter-spacing:-.02em}
  .tile .s{color:var(--muted);font-size:11px;margin-top:3px}
  svg{width:100%;height:auto;display:block;overflow:visible}
  .grid{stroke:var(--grid);stroke-width:1}
  .axis{stroke:var(--axis);stroke-width:1}
  .tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
  .line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
  .dot{stroke:var(--surface-1);stroke-width:2}
  .endlabel{fill:var(--text-secondary);font-size:11px}
  .leader{fill:none;stroke-width:1;opacity:.55}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:12px;color:var(--text-secondary)}
  .legend i{display:inline-block;width:14px;height:2px;border-radius:1px;vertical-align:middle;margin-right:6px}
  .bars{display:flex;flex-direction:column;gap:9px}
  .bar-row{display:grid;grid-template-columns:150px 1fr 48px;align-items:center;gap:10px}
  .bar-name{font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{height:18px;display:flex;align-items:center}
  .bar-fill{height:14px;background:var(--series-1);border-radius:0 4px 4px 0}
  .bar-val{font-size:12px;text-align:right;font-variant-numeric:tabular-nums;color:var(--text-secondary)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--border)}
  th{color:var(--text-secondary);font-weight:600;font-size:12px}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  details summary{cursor:pointer;font-size:13px;color:var(--text-secondary);padding:4px 0}
  .empty{color:var(--muted);font-size:13px}
  #tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;
    background:var(--text-primary);color:var(--surface-1);padding:6px 9px;border-radius:6px;
    font-size:12px;white-space:nowrap;z-index:9}
  .toggle{margin-left:auto;background:var(--surface-1);color:var(--text-secondary);
    border:1px solid var(--border);border-radius:999px;padding:5px 13px;font-size:12px;cursor:pointer}
  .warn{color:var(--muted);font-size:11px;margin-top:10px}
</style></head>
<body><div class="viz-root">
<header><h1>Theo dõi hashtag</h1>
  <button class="toggle" onclick="var r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">Sáng / Tối</button>
</header>
<p class="sub">${days} ngày qua · ${scans} lần quét · cập nhật ${esc(hhmm(Date.now()))}</p>

<div class="tiles">${tiles.map((t) => `
  <div class="tile"><div class="lab">${esc(t.label)}</div>
    <div class="val">${esc(t.value)}</div><div class="s">${esc(t.sub)}</div></div>`).join('')}</div>

<div class="card">
  <h2>Số bài mỗi giờ</h2>
  <p class="cap">Quét tăng dần — chỉ lấy bài mới từ lần quét trước. Số không có dấu <code>~</code> là đếm chính xác.</p>
  ${lineChart(tags)}
  <div class="legend">${tags.map((t, i) => `<span><i style="background:var(--series-${i + 1})"></i>${esc(t.tag)}</span>`).join('')}</div>
</div>

<div class="card">
  <h2>Tác giả đăng nhiều nhất</h2>
  <p class="cap">Gộp toàn bộ hashtag đang theo dõi, trong các lần quét gần đây.</p>
  ${authorChart(tags)}
</div>

<div class="card">
  <h2>Số liệu</h2>
  <p class="cap">Bảng đầy đủ — cùng dữ liệu với biểu đồ ở trên.</p>
  <table><thead><tr><th>Hashtag</th><th class="n">Bài/giờ</th><th class="n">Trung bình</th>
    <th class="n">Cao nhất</th><th class="n">Tác giả</th><th class="n">Lượt xem</th><th class="n">Chi phí</th></tr></thead>
  <tbody>${tags.map((t, i) => `<tr>
    <td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--series-${i + 1});margin-right:7px"></i>${esc(t.tag)}</td>
    <td class="n">${t.snaps.at(-1)?.exact ? '' : '~'}${fmt(t.latestRate)}</td><td class="n">${fmt(t.avgRate)}</td><td class="n">${fmt(t.peakRate)}</td>
    <td class="n">${fmt(t.uniqueAuthors)}</td><td class="n">${fmt(t.views)}</td>
    <td class="n">$${t.cost.toFixed(3)}</td></tr>`).join('')}</tbody></table>

  <details style="margin-top:14px"><summary>Bài nổi bật từng hashtag</summary>
    <table style="margin-top:8px"><tbody>${tags.filter((t) => t.topTweet).map((t) => `<tr>
      <td style="width:110px">${esc(t.tag)}</td>
      <td>@${esc(t.topTweet.author || '?')} — ${esc(t.topTweet.text)}</td>
      <td class="n">${fmt(t.topTweet.likes)} like</td></tr>`).join('')}</tbody></table></details>

  <p class="warn">Hashtag ít bài được <b>đếm chính xác</b> trong cửa sổ giữa hai lần quét. Hashtag tràn trang thì hiển thị dấu <code>~</code> — đó là ước lượng từ mật độ thời gian của mẫu.</p>
</div>

<div id="tip"></div>
<script>
  var tip=document.getElementById('tip');
  document.addEventListener('mouseover',function(e){
    var el=e.target.closest('[data-tip]'); if(!el)return;
    tip.textContent=el.getAttribute('data-tip'); tip.style.opacity=1;
  });
  document.addEventListener('mousemove',function(e){
    if(tip.style.opacity!=='1')return;
    var x=e.clientX+14,y=e.clientY-34;
    if(x+tip.offsetWidth>innerWidth)x=e.clientX-tip.offsetWidth-14;
    tip.style.left=x+'px'; tip.style.top=y+'px';
  });
  document.addEventListener('mouseout',function(e){
    if(e.target.closest('[data-tip]'))tip.style.opacity=0;
  });
</script>
</div></body></html>`;

  const file = path.resolve(process.cwd(), out);
  fs.writeFileSync(file, html);
  log.ok(`Da tao ${path.relative(process.cwd(), file)} — mo bang trinh duyet.`);
  return file;
}
