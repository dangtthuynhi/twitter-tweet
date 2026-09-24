// Sinh tu browser-script/x-auto-poster.user.js — DUNG SUA TRUC TIEP FILE NAY.
// Sua o file goc roi chay: node build-extension.mjs


/*
 * Cach hoat dong
 * --------------
 * X la ung dung mot trang, va viec dieu huong toi o soan thao se nap lai trang,
 * giet sach bien trong bo nho. Nen script nay la mot MAY TRANG THAI luu trong
 * localStorage: moi lan trang nap lai, no doc trang thai ra va di tiep tu do.
 *
 * Vong doi mot bai dang:
 *   cho den gio  ->  ghi "pending" vao localStorage  ->  dieu huong
 *   -> trang nap lai -> thay "pending" -> thao tac DOM -> xoa pending -> hen gio tiep
 */

(function () {
  'use strict';

  const KEY = 'x_auto_poster_state';
  const VERSION = '1.0.0';

  // ---------------------------------------------------------------- trang thai

  const DEFAULTS = {
    running: false,
    queue: [],          // [{type:'tweet', text}] hoac [{type:'retweet', id}]
    cursor: 0,
    posted: [],         // dau van tay cac bai da dang, chong trung
    perDay: {},         // { '2026-09-23': 5 }
    pending: null,      // viec dang lam do dang qua lan nap trang
    nextAt: 0,
    log: [],
    candidates: [],     // ket qua tim duoc, cho duyet tay
    settings: {
      gapMin: 15,       // cach nhau it nhat bao nhieu phut
      gapMax: 45,       // nhieu nhat bao nhieu phut
      maxPerDay: 30,
      loop: false,      // het queue thi quay lai tu dau
      // --- tim theo tu khoa ---
      keyword: '',
      excludeWords: '',
      minLikes: 5,        // bo qua bai chua co ai tuong tac
      maxPerSearch: 10,   // moi lan quet lay toi da bao nhieu
      requireApproval: true,  // duyet tay truoc khi vao hang doi
      latestOnly: true,   // tab "Latest" thay vi "Top"
      // --- nhip tu nhien ---
      hourFrom: 7,        // chi dang trong khung gio nay
      hourTo: 23,
      naturalPace: true,  // gian cach lech chuan thay vi deu tam tap
    },
  };

  // Lop luu tru thich ung.
  // Chay duoi Tampermonkey (co grant) -> dung GM_*, nam ngoai tam voi cua trang.
  // Chay nhu content script cua extension -> localStorage cua isolated world.
  const hasGM = typeof GM_setValue === 'function' && typeof GM_getValue === 'function';
  const readRaw = () => (hasGM ? GM_getValue(KEY, null) : localStorage.getItem(KEY));
  const writeRaw = (v) => (hasGM ? GM_setValue(KEY, v) : localStorage.setItem(KEY, v));

  const load = () => {
    try {
      const s = JSON.parse(readRaw());
      const merged = { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...(s?.settings || {}) } };
      // Ban cu dung intervalMin +/- jitterMin. Doi sang khoang min-max tuong duong.
      const old = s?.settings;
      if (old && old.gapMin == null && old.intervalMin != null) {
        merged.settings.gapMin = Math.max(1, old.intervalMin - (old.jitterMin || 0));
        merged.settings.gapMax = old.intervalMin + (old.jitterMin || 0);
      }
      delete merged.settings.intervalMin;
      delete merged.settings.jitterMin;
      return merged;
    } catch {
      return structuredClone(DEFAULTS);
    }
  };
  const save = (s) => writeRaw(JSON.stringify(s));

  let state = load();

  const today = () => new Date().toISOString().slice(0, 10);
  const countToday = () => state.perDay[today()] || 0;

  const fingerprint = (item) =>
    item.type === 'retweet' ? `rt:${item.id}` : `tw:${item.text.trim().slice(0, 200)}`;

  function addLog(msg, kind = 'info') {
    const line = { at: Date.now(), msg, kind };
    state.log = [...state.log.slice(-60), line];
    save(state);
    renderLog();
    console.log(`[auto-poster] ${msg}`);
  }

  // ---------------------------------------------------------------- tien ich DOM

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Cho mot element xuat hien. Nem loi neu qua han. */
  function waitFor(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); clearTimeout(timer); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Khong thay element "${selector}" sau ${timeout / 1000}s`));
      }, timeout);
    });
  }

  /**
   * O soan thao cua X la contenteditable cua DraftJS — gan .value hay .textContent
   * deu khong an vi React khong biet gi. Phai dung execCommand de trinh duyet
   * sinh ra dung chuoi su kien input ma React dang lang nghe.
   */
  async function typeInto(el, text) {
    el.focus();
    await sleep(150);
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(80);

    // DraftJS khong hieu ky tu "\n" trong insertText — no se bi nuot hoac
    // bien thanh khoang trang. Phai chen tung dong, giua cac dong dung
    // insertLineBreak (tuong duong nguoi dung bam Enter trong o soan thao).
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        document.execCommand('insertLineBreak', false, null);
        await sleep(60);
      }
      if (lines[i]) {
        document.execCommand('insertText', false, lines[i]);
        await sleep(60);
      }
    }

    await sleep(400);
    if (!el.textContent.trim()) throw new Error('Go chu vao o soan thao that bai');
  }

  /** Bam mot nut, doi no het disabled truoc da. */
  async function clickWhenEnabled(selector, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const el = document.querySelector(selector);
      if (el && el.getAttribute('aria-disabled') !== 'true' && !el.disabled) {
        el.click();
        return true;
      }
      await sleep(300);
    }
    throw new Error(`Nut "${selector}" khong bam duoc (van bi disabled)`);
  }

  // ---------------------------------------------------------------- hanh dong

  async function doPostTweet(text) {
    const box = await waitFor('[data-testid="tweetTextarea_0"]', 20000);
    await typeInto(box, text);
    // o soan thao dang modal dung tweetButton, dang inline dung tweetButtonInline
    try {
      await clickWhenEnabled('[data-testid="tweetButton"]', 8000);
    } catch {
      await clickWhenEnabled('[data-testid="tweetButtonInline"]', 8000);
    }
    await sleep(3000);
  }

  async function doRetweet() {
    const btn = await waitFor('[data-testid="retweet"]', 20000);
    btn.click();
    await sleep(600);
    // neu da retweet roi thi menu hien "unretweet" — bo qua, coi nhu xong
    if (document.querySelector('[data-testid="unretweetConfirm"]')) {
      document.body.click();
      throw new Error('Bai nay da duoc retweet truoc do');
    }
    await clickWhenEnabled('[data-testid="retweetConfirm"]', 8000);
    await sleep(2000);
  }

  /** Doc so tu aria-label kieu "12 likes" / "1,234 reposts" */
  function countFrom(article, testid) {
    const el = article.querySelector(`[data-testid="${testid}"]`);
    const label = el?.getAttribute('aria-label') || '';
    const m = label.replace(/[.,]/g, '').match(/(\d+)/);
    return m ? +m[1] : 0;
  }

  /**
   * Quet trang ket qua tim kiem, tra ve cac bai dat tieu chuan.
   * Co y loc chat: bo qua bai khong ai tuong tac, bai quang cao,
   * bai cua chinh minh, va bai da retweet roi.
   */
  function scrapeSearchResults() {
    const { minLikes, maxPerSearch, excludeWords } = state.settings;
    const excl = excludeWords.toLowerCase().split(',').map((w) => w.trim()).filter(Boolean);
    const me = (document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
      ?.textContent || '').toLowerCase();

    const out = [];
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (out.length >= maxPerSearch) break;

      const link = art.querySelector('a[href*="/status/"]');
      const idm = link?.getAttribute('href')?.match(/\/status\/(\d+)/);
      if (!idm) continue;
      const id = idm[1];

      if (state.posted.includes(`rt:${id}`)) continue;
      if (state.queue.some((q) => q.type === 'retweet' && q.id === id)) continue;
      if (state.candidates.some((c) => c.id === id)) continue;

      const text = (art.querySelector('[data-testid="tweetText"]')?.textContent || '').trim();
      if (!text) continue;

      // bo bai quang cao
      const spans = [...art.querySelectorAll('span')].map((x) => x.textContent);
      if (spans.includes('Ad') || spans.includes('Promoted')) continue;

      // bo bai cua chinh minh
      const handle = (art.querySelector('[data-testid="User-Name"]')?.textContent || '');
      if (me && handle.toLowerCase().includes(me.replace(/^@/, ''))) continue;

      // bo bai da retweet (nut dang o trang thai unretweet)
      if (art.querySelector('[data-testid="unretweet"]')) continue;

      const low = text.toLowerCase();
      if (excl.some((w) => low.includes(w))) continue;

      const likes = countFrom(art, 'like');
      if (likes < minLikes) continue;

      out.push({ id, text: text.slice(0, 140), handle: handle.split('@')[1]?.split('·')[0] || '', likes });
    }
    return out;
  }

  async function doSearch() {
    await sleep(2500); // cho ket qua render
    const found = scrapeSearchResults();
    if (!found.length) {
      addLog('Khong tim thay bai nao dat tieu chuan.', 'warn');
      return;
    }

    if (state.settings.requireApproval) {
      state.candidates = [...state.candidates, ...found];
      addLog(`Tim duoc ${found.length} bai — dang cho ban duyet.`, 'ok');
    } else {
      state.queue = [...state.queue, ...found.map((f) => ({ type: 'retweet', id: f.id }))];
      addLog(`Da them ${found.length} bai vao hang doi.`, 'ok');
    }
    save(state);
  }

  /**
   * Mo o soan thao bang cach bam dung nut ben trai — giong het thao tac cua
   * nguoi dung, va KHONG tai lai trang. Tai lai trang moi lan dang la mot mau
   * hanh vi khac han nguoi dung that, vi ung dung X von dieu huong noi bo.
   * @returns {boolean} mo duoc bang SPA hay khong
   */
  async function openComposerInPlace() {
    const btn =
      document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ||
      document.querySelector('a[href="/compose/post"]');
    if (!btn) return false;
    btn.click();
    try {
      await waitFor('[data-testid="tweetTextarea_0"]', 6000);
      return true;
    } catch {
      return false;
    }
  }

  /** Dong o soan thao dang modal sau khi dang xong. */
  async function closeComposer() {
    const close = document.querySelector('[data-testid="app-bar-close"]');
    if (close) { close.click(); await sleep(500); }
  }

  /**
   * Mo mot tweet ngay tai cho neu no dang hien tren trang (SPA routing),
   * chi tai lai trang khi that su khong tim thay.
   */
  async function openTweetInPlace(id) {
    const link = document.querySelector(`a[href*="/status/${id}"]`);
    if (!link) return false;
    link.click();
    try {
      await waitFor('[data-testid="retweet"]', 6000);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- may trang thai

  /** Gap "pending" sau khi trang nap lai -> thuc thi no. */
  async function resumePending() {
    const job = state.pending;
    if (!job) return;

    // xoa truoc khi lam, de loi gi thi cung khong lap vo han
    state.pending = null;
    save(state);

    try {
      if (job.type === 'search') {
        await doSearch();
        scheduleNext();
        render();
        return;
      }
      if (job.type === 'tweet') {
        await doPostTweet(job.text);
        addLog(`Da dang: ${job.text.slice(0, 50)}`, 'ok');
      } else {
        await doRetweet();
        addLog(`Da retweet: ${job.id}`, 'ok');
      }
      state.posted.push(fingerprint(job));
      state.perDay[today()] = countToday() + 1;
      state.cursor = job.index + 1;
    } catch (e) {
      addLog(`Loi: ${e.message}`, 'err');
    }

    scheduleNext();
  }

  function pickNext() {
    const pending = state.queue
      .map((item, index) => ({ ...item, index }))
      .filter((item) => !state.posted.includes(fingerprint(item)));

    if (pending.length) return pending.find((p) => p.index >= state.cursor) || pending[0];
    if (!state.settings.loop || !state.queue.length) return null;

    // che do lap: bo lich su, chay lai tu dau
    state.posted = [];
    state.cursor = 0;
    save(state);
    return { ...state.queue[0], index: 0 };
  }

  /** Bien ngau nhien chuan (Box-Muller), de sinh gian cach hinh chuong. */
  function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const inHours = (d) => {
    const { hourFrom, hourTo } = state.settings;
    if (hourFrom === hourTo) return true;
    const h = d.getHours();
    return hourFrom <= hourTo ? h >= hourFrom && h < hourTo : h >= hourFrom || h < hourTo;
  };

  /** Day thoi diem toi lan mo khung gio gan nhat. */
  function alignToHours(t) {
    const d = new Date(t);
    for (let i = 0; i < 48 && !inHours(d); i++) {
      d.setHours(d.getHours() + 1, Math.floor(Math.random() * 60), 0, 0);
    }
    return d.getTime();
  }

  function scheduleNext() {
    let { gapMin, gapMax, naturalPace } = state.settings;
    if (gapMax < gapMin) [gapMin, gapMax] = [gapMax, gapMin];
    const lo = gapMin * 60000, hi = gapMax * 60000;

    let delay;
    if (lo === hi) {
      delay = lo;
    } else if (naturalPace) {
      // Hinh chuong quanh giua khoang. Lay mau lai neu roi ra ngoai, thay vi
      // kep ve bien — kep se tao ra cum don o dung hai dau khoang, nhin lai
      // ra mau may moc hon ca random deu.
      const mid = (lo + hi) / 2;
      const sigma = (hi - lo) / 5;
      do { delay = mid + gaussian() * sigma; } while (delay < lo || delay > hi);
    } else {
      delay = lo + Math.random() * (hi - lo);
    }

    state.nextAt = alignToHours(Date.now() + Math.max(60000, delay));
    save(state);
    render();
  }

  /** Den gio -> chon viec -> ghi pending -> dieu huong. */
  function runTick() {
    if (!state.running || state.pending) return;
    if (Date.now() < state.nextAt) return;

    if (state.settings.maxPerDay > 0 && countToday() >= state.settings.maxPerDay) {
      addLog(`Da du ${state.settings.maxPerDay} bai hom nay, nghi den mai.`, 'warn');
      state.nextAt = Date.now() + 3600000;
      save(state);
      return;
    }

    const job = pickNext();
    if (!job) {
      addLog('Het bai trong hang doi.', 'warn');
      state.running = false;
      save(state);
      render();
      return;
    }

    state.pending = job;
    save(state);
    doJob(job);
  }

  /**
   * Uu tien lam ngay tai cho (khong tai lai trang). Chi khi khong mo duoc
   * moi phai dieu huong cung — luc do may trang thai se tiep tuc sau khi nap lai.
   */
  async function doJob(job) {
    try {
      if (job.type === 'tweet') {
        addLog('Dang mo o soan thao...');
        if (await openComposerInPlace()) {
          state.pending = null; save(state);
          await doPostTweet(job.text);
          await closeComposer();
          finishJob(job, `Da dang: ${job.text.slice(0, 50)}`);
          return;
        }
      } else {
        addLog('Dang mo bai de retweet...');
        if (await openTweetInPlace(job.id)) {
          state.pending = null; save(state);
          await doRetweet();
          finishJob(job, `Da retweet: ${job.id}`);
          return;
        }
      }
    } catch (e) {
      state.pending = null;
      addLog(`Loi: ${e.message}`, 'err');
      scheduleNext();
      return;
    }

    // khong lam tai cho duoc -> danh phai tai lai trang
    addLog('Khong mo duoc tai cho, phai tai lai trang.', 'warn');
    location.href = job.type === 'retweet'
      ? `https://x.com/i/status/${job.id}`
      : 'https://x.com/compose/post';
  }

  function finishJob(job, msg) {
    state.posted.push(fingerprint(job));
    state.perDay[today()] = countToday() + 1;
    state.cursor = job.index + 1;
    addLog(msg, 'ok');
    scheduleNext();
  }

  // ---------------------------------------------------------------- giao dien

  const PANEL_CSS = `
        #xap-panel{position:fixed;right:16px;bottom:16px;width:330px;z-index:2147483647;
          background:#15202b;color:#e7e9ea;border:1px solid #38444d;border-radius:12px;
          font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.5)}
        #xap-panel header{display:flex;align-items:center;justify-content:space-between;
          padding:10px 12px;border-bottom:1px solid #38444d;cursor:pointer}
        #xap-panel h3{margin:0;font-size:13px;font-weight:700}
        #xap-body{padding:12px;display:block}
        #xap-panel.collapsed #xap-body{display:none}
        #xap-panel textarea{width:100%;height:96px;background:#0f1419;color:#e7e9ea;
          border:1px solid #38444d;border-radius:8px;padding:8px;font:12px/1.4 monospace;resize:vertical}
        #xap-panel input{width:56px;background:#0f1419;color:#e7e9ea;border:1px solid #38444d;
          border-radius:6px;padding:4px 6px;font-size:12px}
        #xap-panel button{border:0;border-radius:999px;padding:7px 14px;font-weight:700;
          cursor:pointer;font-size:12px}
        .xap-go{background:#1d9bf0;color:#fff}
        .xap-stop{background:#f4212e;color:#fff}
        .xap-ghost{background:#273340;color:#e7e9ea}
        #xap-status{padding:8px;background:#0f1419;border-radius:8px;margin:10px 0;font-size:12px}
        #xap-log{max-height:110px;overflow:auto;font:11px/1.5 monospace;background:#0f1419;
          border-radius:8px;padding:8px;margin-top:8px}
        .xap-ok{color:#00ba7c}.xap-err{color:#f4212e}.xap-warn{color:#ffd400}
        .xap-row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}
        .xap-row label{font-size:12px;opacity:.75}
        .xap-dim{opacity:.5;font-weight:400}
        .xap-dim2{opacity:.6}
        .xap-sum{cursor:pointer;font-size:12px;opacity:.85}
        .xap-mv{margin:10px 0}
        .xap-w100{width:100%}
        .xap-wauto{width:auto}
        .xap-right{margin-left:auto}
        .xap-cand{background:#0f1419;border-radius:8px;padding:8px;margin:8px 0}
        .xap-cand-head{font-size:12px;margin-bottom:6px}
        .xap-cand-item{border-top:1px solid #253341;padding:6px 0;font-size:11px}
        .xap-cand-meta{opacity:.6}
        .xap-cand-text{margin:2px 0}
        .xap-mini{padding:3px 10px}
        .xap-mini2{padding:2px 9px}
        .xap-ml{margin-left:8px}
        .xap-link{color:#1d9bf0;margin-left:6px}
        .xap-on{color:#00ba7c}
`;

  const $ = (id) => document.getElementById(id);
  let panel;

  /**
   * Chen CSS bang CSSOM thay vi the <style> trong innerHTML.
   * CSP cua X co the chan inline style; cach nay thi khong.
   */
  function injectStyles() {
    if (document.getElementById('xap-style')) return;
    const el = document.createElement('style');
    el.id = 'xap-style';
    el.textContent = PANEL_CSS;
    document.head.appendChild(el);
  }

  function buildPanel() {
    if (document.getElementById('xap-panel')) return;
    injectStyles();
    panel = document.createElement('div');
    panel.id = 'xap-panel';
    panel.innerHTML = `
      <header id="xap-head"><h3>X Auto Poster <span class="xap-dim">v${VERSION}</span></h3>
        <span id="xap-toggle" class="xap-dim2">▾</span></header>
      <div id="xap-body">
        <div class="xap-row"><label>Hang doi — moi dong 1 bai, hoac dung <code>---</code> de tach bai nhieu dong</label></div>
        <textarea id="xap-queue" placeholder="Bai mot dong

---
Bai nhieu dong:
dong hai o day

---
rt:1234567890123456789"></textarea>
        <div class="xap-row">
          <label>Cach nhau</label><input id="xap-gapmin" type="number" min="1">
          <label>den</label><input id="xap-gapmax" type="number" min="1"> <label>phut</label>
        </div>
        <div class="xap-row">
          <label>Toi da</label><input id="xap-max" type="number" min="0"> <label>bai/ngay</label>
          <label class="xap-right"><input id="xap-loop" type="checkbox" class="xap-wauto"> lap lai</label>
        </div>
        <div class="xap-row">
          <label>Chi dang tu</label><input id="xap-hfrom" type="number" min="0" max="23">
          <label>den</label><input id="xap-hto" type="number" min="0" max="24"> <label>gio</label>
        </div>
        <div class="xap-row">
          <label><input id="xap-natural" type="checkbox" class="xap-wauto"> nhip tu nhien (tap trung quanh giua khoang)</label>
        </div>
        <details id="xap-search-box" class="xap-mv">
          <summary class="xap-sum">🔎 Tim theo tu khoa</summary>
          <div class="xap-row"><input id="xap-keyword" type="text" class="xap-w100"
            placeholder="vd: #nodejs OR typescript"></div>
          <div class="xap-row"><input id="xap-exclude" type="text" class="xap-w100"
            placeholder="loai tru (cach nhau dau phay): giveaway, airdrop"></div>
          <div class="xap-row">
            <label>Toi thieu</label><input id="xap-minlikes" type="number" min="0"> <label>like</label>
            <label>lay</label><input id="xap-maxsearch" type="number" min="1"> <label>bai</label>
          </div>
          <div class="xap-row">
            <label><input id="xap-approval" type="checkbox" class="xap-wauto"> duyet tay truoc</label>
            <label class="xap-right"><input id="xap-latest" type="checkbox" class="xap-wauto"> bai moi nhat</label>
          </div>
          <div class="xap-row"><button id="xap-search" class="xap-ghost">Tim ngay</button></div>
        </details>

        <div id="xap-candidates"></div>
        <div id="xap-status">—</div>
        <div class="xap-row">
          <button id="xap-start" class="xap-go">Bat dau</button>
          <button id="xap-stop" class="xap-stop">Dung</button>
          <button id="xap-reset" class="xap-ghost">Xoa lich su</button>
        </div>
        <div id="xap-log"></div>
      </div>`;
    document.body.appendChild(panel);

    $('xap-head').onclick = () => {
      panel.classList.toggle('collapsed');
      $('xap-toggle').textContent = panel.classList.contains('collapsed') ? '▸' : '▾';
    };

    $('xap-start').onclick = () => {
      syncFromUI();
      if (!state.queue.length) return addLog('Hang doi trong.', 'warn');
      state.running = true;
      state.nextAt = Date.now() + 3000;
      save(state);
      addLog(`Bat dau. ${state.queue.length} bai trong hang doi.`, 'ok');
      render();
    };

    $('xap-stop').onclick = () => {
      state.running = false;
      state.pending = null;
      save(state);
      addLog('Da dung.', 'warn');
      render();
    };

    $('xap-reset').onclick = () => {
      if (!confirm('Xoa lich su da dang? Cac bai cu se duoc dang lai.')) return;
      state.posted = [];
      state.cursor = 0;
      state.perDay = {};
      save(state);
      addLog('Da xoa lich su.', 'warn');
      render();
    };

    $('xap-search').onclick = () => {
      syncFromUI();
      const kw = state.settings.keyword.trim();
      if (!kw) return addLog('Chua nhap tu khoa.', 'warn');
      state.pending = { type: 'search', index: state.cursor };
      save(state);
      addLog(`Dang tim "${kw}"...`);
      const f = state.settings.latestOnly ? '&f=live' : '';
      location.href = `https://x.com/search?q=${encodeURIComponent(kw)}&src=typed_query${f}`;
    };

    for (const id of ['xap-gapmin', 'xap-gapmax', 'xap-max', 'xap-loop', 'xap-queue',
                      'xap-keyword', 'xap-exclude', 'xap-minlikes', 'xap-maxsearch',
                      'xap-approval', 'xap-latest', 'xap-hfrom', 'xap-hto', 'xap-natural']) {
      $(id).addEventListener('change', syncFromUI);
    }
  }

  /**
   * Doc hang doi tu o nhap.
   * - Co dong "---" rieng  -> moi khoi giua cac dau phan cach la mot bai,
   *                            trong bai duoc xuong dong thoai mai.
   * - Khong co "---"        -> moi dong la mot bai (giu tuong thich voi ban cu).
   * Trong ca hai che do, "\n" viet tay cung duoc doi thanh xuong dong that.
   */
  function parseQueue(raw) {
    const bad = [];
    const hasSep = /^\s*---\s*$/m.test(raw);
    const chunks = hasSep ? raw.split(/^\s*---\s*$/m) : raw.split('\n');

    const items = chunks
      .map((c) => c.trim())
      .filter(Boolean)
      .map((chunk) => {
        const ok = chunk.match(/^rt:(\d+)$/i);
        if (ok) return { type: 'retweet', id: ok[1] };
        // Khoi bat dau bang "rt:" nhung ID khong phai so = go nham.
        // Bo qua han, dung de no bi dang thanh mot tweet noi dung "rt:abc".
        if (/^rt:/i.test(chunk) && !chunk.includes('\n')) { bad.push(chunk); return null; }
        return { type: 'tweet', text: chunk.replace(/\\n/g, '\n') };
      })
      .filter(Boolean);

    return { items, bad, hasSep };
  }

  function syncFromUI() {
    const { items, bad } = parseQueue($('xap-queue').value);
    state.queue = items;
    if (bad.length) addLog(`Bo qua ${bad.length} dong "rt:" co ID khong hop le: ${bad.join(', ')}`, 'warn');
    state.settings.gapMin = Math.max(1, +$('xap-gapmin').value || 15);
    state.settings.gapMax = Math.max(1, +$('xap-gapmax').value || 45);
    state.settings.maxPerDay = Math.max(0, +$('xap-max').value || 0);
    state.settings.loop = $('xap-loop').checked;
    state.settings.keyword = $('xap-keyword').value;
    state.settings.excludeWords = $('xap-exclude').value;
    state.settings.minLikes = Math.max(0, +$('xap-minlikes').value || 0);
    state.settings.maxPerSearch = Math.max(1, +$('xap-maxsearch').value || 10);
    state.settings.requireApproval = $('xap-approval').checked;
    state.settings.latestOnly = $('xap-latest').checked;
    state.settings.hourFrom = Math.min(23, Math.max(0, +$('xap-hfrom').value || 0));
    state.settings.hourTo = Math.min(24, Math.max(0, +$('xap-hto').value || 24));
    state.settings.naturalPace = $('xap-natural').checked;
    save(state);
    render();
  }

  /** Khung duyet: moi ung vien mot dong, chon Lay hoac Bo. */
  function renderCandidates() {
    const box = $('xap-candidates');
    if (!box) return;
    if (!state.candidates.length) { box.innerHTML = ''; return; }

    box.innerHTML = `
      <div class="xap-cand">
        <div class="xap-cand-head">
          <b>${state.candidates.length} bai cho duyet</b>
          <button id="xap-take-all" class="xap-ghost xap-mini xap-ml">Lay het</button>
          <button id="xap-drop-all" class="xap-ghost xap-mini">Bo het</button>
        </div>
        ${state.candidates.map((c, i) => `
          <div class="xap-cand-item">
            <div class="xap-cand-meta">@${c.handle.trim()} · ${c.likes} like</div>
            <div class="xap-cand-text">${c.text.replace(/</g, '&lt;').slice(0, 110)}</div>
            <button class="xap-ghost xap-mini2 xap-take" data-i="${i}">Lay</button>
            <button class="xap-ghost xap-mini2 xap-drop" data-i="${i}">Bo</button>
            <a href="https://x.com/i/status/${c.id}" target="_blank"
               class="xap-link">xem</a>
          </div>`).join('')}
      </div>`;

    const take = (i) => {
      const c = state.candidates[i];
      state.queue.push({ type: 'retweet', id: c.id });
      state.candidates.splice(i, 1);
      save(state); render();
    };
    box.querySelectorAll('.xap-take').forEach((b) => (b.onclick = () => take(+b.dataset.i)));
    box.querySelectorAll('.xap-drop').forEach((b) => (b.onclick = () => {
      state.candidates.splice(+b.dataset.i, 1); save(state); render();
    }));
    $('xap-take-all').onclick = () => {
      state.queue.push(...state.candidates.map((c) => ({ type: 'retweet', id: c.id })));
      state.candidates = []; save(state); render();
    };
    $('xap-drop-all').onclick = () => { state.candidates = []; save(state); render(); };
  }

  function renderLog() {
    const box = $('xap-log');
    if (!box) return;
    box.innerHTML = state.log
      .slice(-25)
      .reverse()
      .map((l) => {
        const t = new Date(l.at).toLocaleTimeString('vi-VN', { hour12: false });
        const cls = l.kind === 'ok' ? 'xap-ok' : l.kind === 'err' ? 'xap-err' : l.kind === 'warn' ? 'xap-warn' : '';
        return `<div class="${cls}">${t} ${l.msg.replace(/</g, '&lt;')}</div>`;
      })
      .join('');
  }

  function render() {
    if (!$('xap-status')) return;
    const done = state.queue.filter((i) => state.posted.includes(fingerprint(i))).length;
    const left = Math.max(0, state.nextAt - Date.now());
    const mm = Math.floor(left / 60000);
    const ss = Math.floor((left % 60000) / 1000);

    $('xap-status').innerHTML = state.running
      ? `<b class="xap-on">● Dang chay</b> — bai ke tiep sau <b>${mm}:${String(ss).padStart(2, '0')}</b><br>
         Da dang <b>${done}/${state.queue.length}</b> · hom nay <b>${countToday()}</b> bai`
      : `<b class="xap-dim2">○ Dang dung</b> — da dang <b>${done}/${state.queue.length}</b> · hom nay <b>${countToday()}</b> bai`;

    if (document.activeElement !== $('xap-queue')) {
      const parts = state.queue.map((i) => (i.type === 'retweet' ? `rt:${i.id}` : i.text));
      // co bai nao nhieu dong thi phai dung dau phan cach, khong thi giu moi dong mot bai
      const multi = parts.some((p) => p.includes('\n'));
      $('xap-queue').value = parts.join(multi ? '\n---\n' : '\n');
    }
    $('xap-gapmin').value = state.settings.gapMin;
    $('xap-gapmax').value = state.settings.gapMax;
    $('xap-max').value = state.settings.maxPerDay;
    $('xap-loop').checked = state.settings.loop;
    if (document.activeElement !== $('xap-keyword')) $('xap-keyword').value = state.settings.keyword;
    if (document.activeElement !== $('xap-exclude')) $('xap-exclude').value = state.settings.excludeWords;
    $('xap-minlikes').value = state.settings.minLikes;
    $('xap-maxsearch').value = state.settings.maxPerSearch;
    $('xap-approval').checked = state.settings.requireApproval;
    $('xap-latest').checked = state.settings.latestOnly;
    $('xap-hfrom').value = state.settings.hourFrom;
    $('xap-hto').value = state.settings.hourTo;
    $('xap-natural').checked = state.settings.naturalPace;
    renderCandidates();
    renderLog();
  }

  // ---------------------------------------------------------------- khoi dong

  async function boot() {
    await sleep(1200);           // cho X dung xong khung trang
    buildPanel();
    render();

    if (state.pending) {
      addLog('Tiep tuc viec dang do sau khi trang nap lai...');
      await resumePending();
    }

    setInterval(() => { state = load(); runTick(); render(); }, 1000);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
