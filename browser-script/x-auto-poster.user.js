// ==UserScript==
// @name         X Auto Poster
// @namespace    local.autotweet
// @author       dangtthuynhi
// @version      1.0.0
// @description  Tu dong dang tweet / retweet theo lich, chay ngay trong tab X da dang nhap
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-start
// @homepageURL  https://github.com/dangtthuynhi/twitter-tweet
// ==/UserScript==

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

  /**
   * Chan canh bao "Changes you made may not be saved" cua trinh duyet.
   *
   * Hop thoai do la giao dien NATIVE cua Chrome, nam ngoai DOM — khong mot
   * script nao bam duoc vao no. Chi can o soan thao con chu la X dang ky
   * beforeunload, va tu do moi location.reload() cua bot deu dung sung cho
   * nguoi bam tay. Nen phai chan tu goc: nuot moi dang ky 'beforeunload' va
   * khoa luon thuoc tinh onbeforeunload.
   *
   * Doi lai: ban nhap that cua nguoi dung trong tab nay se khong con duoc hoi
   * truoc khi mat. Tab nay la tab cua bot nen danh chiu.
   *
   * Phai chay o document-start, truoc khi X kip dang ky.
   */
  (function blockUnloadPrompt() {
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (type === 'beforeunload') return undefined;
      return add.call(this, type, ...rest);
    };
    for (const target of new Set([W, window])) {
      try {
        Object.defineProperty(target, 'onbeforeunload', {
          configurable: true, get: () => null, set: () => {},
        });
      } catch { /* trinh duyet khong cho ghi de thi thoi */ }
    }
  })();

  const KEY = 'x_auto_poster_state';
  const QUEUE_FORMAT = 'v2-blankline';   // doi khi cach ghep content + label doi
  const VERSION = '1.0.0';
  const AUTHOR = 'dangtthuynhi';
  const REPO = 'https://github.com/dangtthuynhi/twitter-tweet';

  // ---------------------------------------------------------------- trang thai

  const DEFAULTS = {
    running: false,
    queue: [],          // [{type:'tweet', text}] hoac [{type:'retweet', id}]
    cursor: 0,
    posted: [],         // dau van tay cac bai da dang, chong trung
    postedContent: [],   // [{hashtag, contentIndex}, ...] de chong trung content
    perDay: {},         // { '2026-09-23': 5 }
    pending: null,      // viec dang lam do dang qua lan nap trang
    nextAt: 0,
    log: [],
    candidates: [],     // ket qua tim duoc, cho duyet tay
    queueSig: '',       // label+so luong da dung de dung hang doi hien tai
    settings: {
      labels: '',       // text o nhap label, giu qua cac lan nap lai trang
      quantity: 100,    // moi lan dung hang doi thi sinh bao nhieu tweet
      gapMin: 1,        // cach nhau it nhat bao nhieu phut
      gapMax: 4,        // nhieu nhat bao nhieu phut
      maxPerDay: 100,
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
      slowMode: false,    // may cham: gian het moi nhip cho va moi han doi ra 3 lan
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

  // Noi dung nap tu file: tai nguyen tinh, khong phai trang thai. De ngoai `state`
  // vi (1) runTick moi giay gan lai `state = load()`, nam trong do thi bi xoa sach,
  // va (2) moi phim go deu save() -> serialize ca tram KB xuong storage.
  let contentData = [];

  // Khoa trong bo nho (khong luu xuong storage). runTick() chay moi giay, ma mot
  // lan dang mat vai giay — khong co khoa nay thi no khoi dong luot thu hai
  // trong khi luot dau chua xong, gay ra bam nut hai lan.
  let busy = false;
  // X co the chen hop thoai chan ngang (canh bao trung bai, thu thach bot...).
  // Dem so lan that bai lien tiep de dung han thay vi dam dau vao mai.
  let consecutiveFails = 0;
  // Lan cuoi di kiem ban nhap da luu. Nut "Drafts" cua X co luc hien ca khi
  // khong con ban nhap nao, va di vao ra man do truoc MOI bai la thua han mot
  // dong thao tac — dong nao cung la mot co hoi bam nham.
  let draftsCheckedAt = 0;

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

  /**
   * Doi den khi dieu kien dung, kiem lai moi `step` ms. Tra ve co dung kip hay
   * khong, khong nem loi.
   *
   * DraftJS doi DOM sau mot vong render cua React, khong doi ngay trong lenh.
   * Ngu mot khoang CO DINH la danh cuoc vao toc do may: may khoe thi phi thoi
   * gian, may yeu (hoac tab bi dim, hoac mang dang ket) thi cat luon thao tac
   * giua chung roi ket luan nham la "khong xoa duoc". Doi co dieu kien thi may
   * nao cung dung: xong som di som, xong muon van kip.
   */
  async function until(fn, timeout = 4000, step = 120) {
    const deadline = Date.now() + timeout * paceFactor();
    for (;;) {
      try { if (fn()) return true; } catch { /* DOM dang thay, thu lai */ }
      if (Date.now() >= deadline) return false;
      await sleep(step);
    }
  }

  /** O soan thao da sach chua. */
  const isEmpty = (el) => !el || !el.isConnected || !el.textContent.trim();

  /**
   * He so gian nhip. Bat "may cham" thi moi nhip nghi va moi han doi deu dai
   * ra gap ba — may yeu, tab bi dim, hay mang dang ket deu can nhieu thoi gian
   * hon de React dung lai DOM, va cat giua chung la ra bai sai.
   */
  const paceFactor = () => (state?.settings?.slowMode ? 3 : 1);
  const pause = (ms) => sleep(Math.round(ms * paceFactor()));

  /** Cho mot element xuat hien. Nem loi neu qua han. */
  function waitFor(selector, timeout = 15000, root = document) {
    return new Promise((resolve, reject) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);

      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
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
   * O soan thao cua X la contenteditable cua Draft.js — gan .value hay
   * .textContent deu khong an vi React khong biet gi. Phai di bang su kien
   * nguoi dung that su sinh ra, de Draft.js tu cap nhat trang thai cua no.
   */
  /**
   * Boi den toan bo noi dung cua DUNG o soan thao nay.
   *
   * execCommand khong tac dong len mot element, no tac dong len selection cua
   * document. Ma el.focus() tren contenteditable cua DraftJS khong dam bao dat
   * duoc caret vao trong o: modal cua X co bay focus, va trang con mot o inline
   * cung ten "tweetTextarea_0" nam khuat phia sau. Caret roi ra ngoai thi
   * selectAll boi den ca trang va delete thanh viec vo ich — ba vong lap deu
   * that bai y het nhau, khong he co thao tac that nao xay ra.
   */
  function selectAllIn(el) {
    // O soan thao co the bi go khoi trang ngay giua chung: X dung lai modal,
    // hoac trang vua chuyen sang view khac (mo anh, mo mot bai...). Range tren
    // mot node da roi khoi document thi khong thuoc ve document nao, va
    // addRange() nem "The given range isn't in document". Kiem truoc, va van
    // boc try: giua luc kiem va luc goi, node van kip bien mat.
    if (!el || !el.isConnected || el.ownerDocument !== document) return false;
    try {
      el.focus();
      const sel = window.getSelection();
      if (!sel) return false;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      // Dat duoc vung chon la du. Khong doi hoi vung chon phai co do dai: o
      // rong thi vung chon thu lai thanh mot diem, va do van la ket qua dung.
      return el.contains(sel.anchorNode) || sel.anchorNode === el;
    } catch {
      return false;
    }
  }

  /**
   * Xoa sach o soan thao va KIEM TRA da sach that chua.
   * X co the con giu ban nhap cu; xoa hut ma cu go tiep thi chu moi dinh vao
   * duoi chu cu, thanh mot bai gop nhieu bai.
   */
  /**
   * Sach VA GIU sach.
   *
   * Doc duoc mot nhip rong chua chac la xong: `delete` chi don DOM, con
   * editorState ben trong DraftJS van giu chu cu, va vong render ke tiep cua
   * React do nguyen chu cu tro lai. Nhin mot phat roi di tiep thi vua dung
   * luc o dang rong — go vao, chu cu quay ve, va thanh mot bai gop hai bai.
   */
  async function staysEmpty(el, settle = 3000, hold = 800) {
    if (!(await until(() => isEmpty(el), settle))) return false;
    await pause(hold);
    return isEmpty(el);
  }

  /**
   * Gia lap thao tac DAN vao o soan thao.
   *
   * Day la thao tac soan thao DUY NHAT ma Draft.js chiu duoc. Da do tung lenh
   * mot tren mot Draft.js that (xem test/composer/README.md):
   *
   *   execCommand('insertText', chuoi co "\n")      -> Draft.js vo, mat chu
   *   execCommand('insertText') roi 'insertLineBreak' -> Draft.js vo
   *   execCommand('selectAll') + 'delete'             -> Draft.js vo
   *   su kien paste                                    -> dung, tron ven
   *
   * "Vo" o day la that: React nem "Failed to execute 'removeChild' on 'Node'"
   * va go han o soan thao khoi trang. Cac lenh execCommand sua DOM thang tay,
   * ngoai tam kiem soat cua React, nen cay DOM that va cay React hinh dung
   * lech nhau roi lan render sau no vap. Su kien paste thi khac han: trinh
   * duyet khong tu lam gi voi no, Draft.js tu nhan va tu cap nhat trang thai
   * cua minh — dung mot duong, va no hieu san ky tu xuong dong.
   *
   * Tra ve co ai nhan xu ly hay khong: Draft.js nhan thi goi preventDefault,
   * va dispatchEvent bao lai bang false.
   */
  function pasteInto(el, text) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      return !el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
    } catch {
      return false;    // trinh duyet khong dung duoc su kien nay
    }
  }

  /**
   * Boi den het roi CAT — cach xoa duy nhat khong lam Draft.js vo.
   *
   * Dan mot chuoi rong khong xoa duoc gi: Draft.js bo qua ban dan rong.
   */
  function cutAll(el) {
    if (!selectAllIn(el)) return false;
    try {
      el.dispatchEvent(new ClipboardEvent('cut', {
        clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
      }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Xoa sach o soan thao, bang thao tac CAT.
   *
   * Chu y: `isEmpty` tinh ca truong hop o da roi khoi trang la "sach", nen o
   * day phai kiem rieng — mot lenh xoa lam vo Draft.js cung lam o bien mat, va
   * do khong phai la xoa thanh cong.
   */
  async function clearComposer(el, settle = 3000) {
    for (let i = 0; i < 4; i++) {
      if (!el.isConnected) throw new Error('O soan thao bien mat khi dang don');
      if (isEmpty(el)) return;

      if (!cutAll(el)) { await pause(400); continue; }
      if (await staysEmpty(el, settle)) {
        if (!el.isConnected) throw new Error('O soan thao bien mat khi dang don');
        return;
      }
    }
    throw new Error('Khong xoa duoc chu cu trong o soan thao');
  }

  /**
   * Tim mot thu bam duoc theo CHU hien tren man hinh.
   * X doi testid kha thuong xuyen, con chu tren nut thi ben hon nhieu.
   */
  function buttonByText(root, re) {
    if (!root) return null;
    return [...root.querySelectorAll('[role="button"], button, a[role="link"]')]
      .find((b) => re.test((b.innerText || '').trim())) || null;
  }

  /**
   * Tra loi sheet "Save post?" cua X.
   *
   * Tim nut theo chu truoc chu khong theo testid: hai nut nay deo testid
   * confirmationSheetConfirm/Cancel ma vai tro tung doi cho nhau, doan nham mot
   * lan la luu draft thay vi vut di — dung cai ta dang muon tranh.
   */
  async function answerSaveSheet(choice = 'discard', wait = 2500) {
    // Chi nhan sheet xac nhan. Lay bua mot [role="dialog"] nao do la co luc
    // vo phai chinh modal soan thao va bam nham nut trong do.
    const find = () => document.querySelector('[data-testid="confirmationSheetDialog"]') ||
      [...document.querySelectorAll('[role="dialog"]')]
        .find((d) => !d.querySelector('[data-testid="tweetTextarea_0"]'));
    // Sheet nay hien sau mot nhip animation. Nhin mot phat roi bo di thi tren
    // may cham se khong thay gi, va X lang le luu draft.
    await until(() => find(), wait);
    const sheet = find();
    if (!sheet) return false;
    const want = choice === 'discard'
      ? /discard|delete|don't save|khong luu|huy|xoa/i
      : /^save$/i;
    const btn = buttonByText(sheet, want);
    const fallback = sheet.querySelector(choice === 'discard'
      ? '[data-testid="confirmationSheetCancel"]'
      : '[data-testid="confirmationSheetConfirm"]');
    const target = btn || fallback;
    if (!target) return false;
    target.click();
    await until(() => !target.isConnected, 2500);
    await sleep(300);
    return true;
  }

  /**
   * Vut han ban nhap: dong o soan thao roi bao X dung luu.
   *
   * Xoa chu trong o KHONG xoa ban nhap da luu — mo composer lan sau X do lai
   * chu cu vao, va nut "Drafts" cu day len mai. Day la duong thoat cuoi cung
   * khi xoa tai cho khong an.
   */
  async function discardDraft() {
    const close = document.querySelector('[data-testid="app-bar-close"]');
    if (close) {
      close.click();
      await until(() => !close.isConnected, 2500);
      await sleep(300);
    }
    await answerSaveSheet('discard');
  }

  /** Loi vao danh sach ban nhap, neu X dang giu ban nhap nao. */
  const draftsEntry = (root = document) =>
    root.querySelector('[data-testid="unsentTweetsButton"]') ||
    buttonByText(root, /^drafts?$/i);

  /**
   * Xoa sach ban nhap da luu cua X.
   *
   * Chu "Drafts" trong o soan thao nghia la X dang giu ban nhap, va chinh
   * chung la nguon chu cu do nguoc vao o soan thao o bai sau. Xoa chu trong o
   * khong dong toi chung — phai vao man "Unsent Posts" ma xoa.
   *
   * Lam HET SUC, khong nem loi: day la viec don dep, hong thi ghi log roi di
   * tiep. Moi buoc ghi lai duoc minh thay gi, de con lan ra khi X doi giao dien.
   */
  async function purgeDrafts(scope = document) {
    const entry = draftsEntry(scope);
    if (!entry) return false;

    draftsCheckedAt = Date.now();
    addLog('Co ban nhap da luu, dang xoa...', 'warn');
    entry.click();

    // Nhan dien man "Unsent Posts": vua phai co nut Edit, vua phai co chu
    // "unsent"/"draft" tren man. Nhan bang moi nut Edit thi vo phai man khac
    // cung co nut do, va cac buoc sau se di bam lung tung tren man ay.
    const listBox = () => [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => buttonByText(d, /^edit$/i) && /unsent|draft/i.test(d.innerText || ''));
    if (!(await until(() => listBox(), 8000))) {
      addLog(`Khong mo duoc danh sach ban nhap — man hinh dang hien: "${describeOverlay()}"`, 'warn');
      await dismissOverlays();
      return false;
    }

    const box = listBox();
    buttonByText(box, /^edit$/i).click();
    await pause(700);

    // Chon tung dong. X khong co "chon tat ca"; chan 50 dong cho co diem dung.
    const rows = [...box.querySelectorAll('article, [data-testid="tweet"]')].slice(0, 50);
    if (!rows.length) {
      // Vao duoc den day ma khong co dong nao = loi vao "Drafts" la bao dong
      // gia, X khong giu ban nhap nao ca. Khong phai viec da lam xong.
      addLog('Khong co ban nhap nao de xoa.');
      await dismissOverlays();
      return false;
    }
    for (const r of rows) { r.click(); await pause(150); }

    const del = buttonByText(box, /^delete$/i);
    if (!del) {
      addLog(`Khong thay nut xoa ban nhap — man hinh dang hien: "${describeOverlay()}"`, 'warn');
      await dismissOverlays();
      return false;
    }
    del.click();
    await pause(600);

    // Sheet xac nhan. O day Delete la nut KHANG DINH, nguoc vai tro voi sheet
    // "Save post?" — nen tim rieng chu khong goi answerSaveSheet.
    await until(() => document.querySelector('[data-testid="confirmationSheetDialog"]'), 3000);
    const sheet = document.querySelector('[data-testid="confirmationSheetDialog"]');
    const yes = buttonByText(sheet, /^delete$/i) ||
      sheet?.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (yes) { yes.click(); await pause(900); }

    await dismissOverlays();
    addLog(`Da xoa ${rows.length} ban nhap da luu.`, 'ok');
    return true;
  }

  /**
   * O soan thao ma bot duoc phep dong vao — hoac `null` neu khong co cai nao.
   *
   * "tweetTextarea_0" la mot cai ten dung chung: o soan bai moi, o tra loi
   * inline duoi mot bai viet, va o tra loi trong modal deu mang ten do. Bot
   * chi bao gio go vao o soan bai MOI, nen chu nam trong hai cai kia la chu
   * nguoi dung dang go dang do — xoa di la mat trang cua ho.
   *
   * Hai dau hieu de nhan ra cai cua minh:
   *  - Trong modal, va modal do khong kem theo bai nao (kem bai = dang tra loi
   *    bai do, hoac dang trich dan).
   *  - Ngoai modal thi chi tin khi dang o trang chu hoac trang soan bai.
   *    Trang mot bai viet (va trang xem anh cua no) deu khong tinh.
   */
  function ownComposer() {
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('[data-testid="tweetTextarea_0"]'));
    if (dialog) {
      if (dialog.querySelector('article[data-testid="tweet"]')) return null;
      return dialog.querySelector('[data-testid="tweetTextarea_0"]');
    }
    const path = location.pathname;
    if (/^\/compose\//.test(path) || path === '/home' || path === '/') {
      return document.querySelector('[data-testid="tweetTextarea_0"]');
    }
    return null;
  }

  /**
   * Don o soan thao neu con chu. Phai goi truoc moi lan tai lai trang: con chu
   * chua gui thi X bat canh bao "Changes you made may not be saved", hop thoai
   * do chan dieu huong va script khong tu bam duoc -> bot treo cho nguoi bam tay.
   */
  async function clearComposerIfAny() {
    const box = ownComposer();
    if (!box || !box.textContent.trim()) return true;
    try { await clearComposer(box); return true; } catch { /* thu cach manh hon */ }

    // Xoa tai cho khong an -> vut han ban nhap. Chi can con mot chu la lan mo
    // composer ke tiep lai thua ke dung dong rac nay.
    await discardDraft();
    return until(() => isEmpty(ownComposer()), 3000);
  }

  /**
   * Go `text` vao o soan thao, thay the sach se moi thu dang co trong do.
   *
   * Boi den toan bo roi dan de len — MOT thao tac duy nhat lam ca hai viec.
   * Khong tach thanh "xoa roi go": giua hai buoc do luon co mot khoanh khac o
   * dang rong, va neu buoc go khong di dung duong thi chu cu quay ve roi chu
   * moi dinh vao sau no, thanh bai gop hai bai.
   *
   * Dan de len cung an toan khi lap lai: lan sau boi den het roi dan tiep thi
   * van ra dung mot ban, khong bao gio cong don.
   */
  async function typeInto(el, text) {
    // innerText chu khong phai textContent: textContent noi cac khoi cua
    // Draft.js lien tuc khong mot khoang trang, nen bai nhieu dong doc ra
    // thanh "dong mot#hashtag" va so sanh nao cung truot.
    const want = text.replace(/\s+/g, ' ').trim();
    const seen = () => (el.innerText || '').replace(/\s+/g, ' ').trim();

    if (!isEmpty(el)) addLog('O soan thao con chu cu, se de len.', 'warn');

    let done = false;
    for (let i = 0; i < 3 && !done; i++) {
      if (!el.isConnected) throw new Error('O soan thao bien mat khi dang go');
      if (!selectAllIn(el)) { await pause(400); continue; }
      await pause(250);              // cho Draft.js kip nhan vung boi den moi
      if (!pasteInto(el, text)) { await pause(400); continue; }
      done = await until(() => seen() === want, 6000);
    }

    if (!el.isConnected) throw new Error('O soan thao bien mat khi dang go');
    const typed = seen();
    if (!typed) throw new Error('Go chu vao o soan thao that bai');
    // Chu cu con sot lai thi no nam truoc chu moi -> bo bai, dung de dang ra
    // bai dinh chum.
    if (!typed.startsWith(want.slice(0, 30))) {
      throw new Error('O soan thao con chu cu, bo qua bai nay');
    }
    // Chu cu sot lai o CUOI thi startsWith van lot, va bai dang ra la hai bai
    // gop. Khong so khop tung ky tu (X render hashtag/emoji co the lech vai ky
    // tu), chi chan truong hop dai vuot han ra.
    if (typed.length > want.length + 40) {
      throw new Error('O soan thao con chu thua, bo qua bai nay');
    }
  }

  /** Bam mot nut, doi no het disabled truoc da. */
  async function clickWhenEnabled(elOrSelector, timeout = 12000, root = document) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const el = typeof elOrSelector === 'string' ? root.querySelector(elOrSelector) : elOrSelector;
      if (el && el.getAttribute('aria-disabled') !== 'true' && !el.disabled) {
        el.click();
        return true;
      }
      await sleep(300);
    }
    throw new Error(`Nut khong bam duoc (van bi disabled): ${
      typeof elOrSelector === 'string' ? elOrSelector : elOrSelector?.dataset?.testid || '?'}`);
  }

  // ---------------------------------------------------------------- hanh dong

  /**
   * Tim pham vi chua o soan thao dang dung.
   *
   * Tren /compose/post, X mo modal DE LEN trang nen — trang nen cung co mot o
   * "tweetTextarea_0" inline. Lay bua theo document se trung o inline nam khuat
   * (no dung truoc trong thu tu DOM), chu go vao do thi khong ai thay va o
   * trong modal van giu nguyen chu cu.
   */
  async function composerScope(timeout = 20000) {
    const deadline = Date.now() + timeout * paceFactor();
    const onComposePage = () => /^\/compose\//.test(location.pathname);
    while (Date.now() < deadline) {
      const dialog = [...document.querySelectorAll('[role="dialog"]')]
        .find((d) => d.querySelector('[data-testid="tweetTextarea_0"]'));
      if (dialog) return dialog;

      // O soan thao NGOAI modal chi dang tin khi dang dung o trang soan bai.
      // Tren trang mot bai viet (hay trang xem anh cua bai do), chinh cai ten
      // "tweetTextarea_0" lai la o TRA LOI bai cua nguoi khac — go vao do la
      // bai cua minh di ra duoi dang reply duoi tweet nguoi ta.
      if (onComposePage() && document.querySelector('[data-testid="tweetTextarea_0"]')) {
        return document;
      }
      await sleep(300);
    }
    // Tha bo bai con hon dang nham cho. Nguoi goi bat loi nay va bo qua bai.
    throw new Error(`Khong thay o soan thao bai moi (dang o ${location.pathname})`);
  }

  async function doPostTweet(text, scope = document) {
    const box = await waitFor('[data-testid="tweetTextarea_0"]', 20000, scope);
    await typeInto(box, text);

    // Tim nut dang TRONG CUNG pham vi voi o vua go. Neu lay bua tren ca trang,
    // rat de bam nhan nut cua o soan thao inline — nut do dang tat vi o do trong.
    const btn =
      scope.querySelector('[data-testid="tweetButton"]') ||
      scope.querySelector('[data-testid="tweetButtonInline"]');
    if (!btn) throw new Error('Khong thay nut dang trong o soan thao');

    await clickWhenEnabled(btn, 10000);

    // Doi X dang XONG HAN roi hay di tiep: o soan thao sach lai, hoac modal
    // bien mat. Di tiep som khi chu con nam do thi closeComposer se dong vao
    // mot o con chu — X bat sheet "Save post?" va bai do thanh draft.
    await until(() => isEmpty(box), 12000);
    await sleep(1200);
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
    const { minLikes, excludeWords } = state.settings;
    const maxPerSearch = Math.max(1, state.settings.maxPerSearch);
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
  async function openComposerInPlace(allowPurge = true) {
    const btn =
      document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ||
      document.querySelector('a[href="/compose/post"]');
    if (!btn) return null;
    btn.click();

    // Trang chu von da co san mot o soan thao inline o dau dong thoi gian.
    // Khi modal mo ra thi co HAI o cung ten "tweetTextarea_0" — phai bam vao
    // dung o trong modal, neu khong chu se go vao o inline nam khuat phia sau.
    try {
      const dialog = await waitFor('[role="dialog"]', 12000);
      await waitFor('[data-testid="tweetTextarea_0"]', 12000, dialog);

      // Con ban nhap da luu thi don truoc khi go. De do lai thi bai nao cung
      // co nguy co thua ke chu cu, va cang dang cang chong them draft moi.
      // Don xong phai mo lai o soan thao, va chi mot lan — hong thi di tiep
      // voi cai dang co, khong quay vong.
      if (allowPurge && Date.now() - draftsCheckedAt > 600000 && draftsEntry(dialog)) {
        await purgeDrafts(dialog);
        return openComposerInPlace(false);
      }

      // O soan thao phai RONG truoc khi go. Khong sach thi vut ban nhap bang
      // GIAO DIEN roi mo lai o moi — dung co xoa chu bang vung chon, vi khi
      // DraftJS khong nhin thay vung chon ta dat thi lenh go sau noi them chu
      // khong de len, va bai ra thanh nhan ban.
      if (allowPurge && !isEmpty(dialog.querySelector('[data-testid="tweetTextarea_0"]'))) {
        addLog('O soan thao con chu cu, vut ban nhap roi mo lai.', 'warn');
        await discardDraft();
        return openComposerInPlace(false);
      }
      return dialog;
    } catch {
      return null;
    }
  }

  /** Dong o soan thao dang modal sau khi dang xong. */
  async function closeComposer() {
    const close = document.querySelector('[data-testid="app-bar-close"]');
    if (close) {
      close.click();
      await until(() => !close.isConnected, 2500);
      await sleep(300);
    }
    // Con chu sot lai thi X bat sheet "Save post?". Khong tra loi thi X mac
    // dinh LUU, va chinh cai draft do se do nguoc vao o soan thao o bai sau.
    // Cho ngan thoi: duong nay la duong dang THANH CONG, o soan thao da sach
    // nen phan lon lan se khong co sheet nao hien — doi lau chi la phi.
    await answerSaveSheet('discard', 1200);
  }

  /** Chu dang hien tren hop thoai chan ngang, de con biet X dang noi gi. */
  function describeOverlay() {
    const el = document.querySelector('[role="alert"]') || document.querySelector('[role="dialog"]');
    const txt = el && (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    return txt || '';
  }

  /**
   * Don hop thoai con sot lai. Khong don thi lan dang ke tiep van bi no che,
   * go chu khong an va hong y het lan nay den lan khac.
   */
  async function dismissOverlays() {
    for (let i = 0; i < 4; i++) {
      if (!document.querySelector('[role="dialog"], [role="alert"]')) return;
      const close = document.querySelector('[data-testid="app-bar-close"]') ||
        document.querySelector('[data-testid="confirmationSheetCancel"]') ||
        document.querySelector('[role="dialog"] [aria-label="Close"]');
      if (close) { close.click(); } else {
        for (const t of ['keydown', 'keyup']) {
          document.activeElement?.dispatchEvent(
            new KeyboardEvent(t, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        }
      }
      await sleep(400);
    }
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
    busy = true;

    try {
      if (job.type === 'search') {
        await doSearch();
        scheduleNext();
        render();
        return;
      }
      if (job.type === 'tweet') {
        await doPostTweet(job.text, await composerScope());
        addLog(`Da dang: ${job.text.slice(0, 50)}`, 'ok');
      } else {
        await doRetweet();
        addLog(`Da retweet: ${job.id}`, 'ok');
      }
      state.posted.push(fingerprint(job));
      if (job.hashtag && job.contentIndex != null) {
        state.postedContent.push({ hashtag: job.hashtag, contentIndex: job.contentIndex });
      }
      state.perDay[today()] = countToday() + 1;
      state.cursor = job.index + 1;
      consecutiveFails = 0;
    } catch (e) {
      const seen = describeOverlay();
      addLog(`Loi: ${e.message}${seen ? ` — man hinh dang hien: "${seen}"` : ''}`, 'err');
      await dismissOverlays();

      // Bo han bai nay, y nhu nhanh dang tai cho: giu lai thi pickNext() se
      // nhat no len o luot sau va dam vao dung cho hong do.
      if (job.type !== 'search') {
        state.posted.push(fingerprint(job));
        if (job.hashtag && job.contentIndex != null) {
          state.postedContent.push({ hashtag: job.hashtag, contentIndex: job.contentIndex });
        }
        state.cursor = job.index + 1;
      }
      if (++consecutiveFails >= 5) {
        state.running = false;
        addLog('Hong 5 lan lien tiep, da dung. Kiem tra xem X co dang chan khong.', 'err');
        save(state);
        render();
        busy = false;
        return;
      }
    } finally {
      busy = false;
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

  /** Den gio -> chon viec -> giao cho doJob. */
  function runTick() {
    if (busy) return;
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

    // KHONG dat state.pending o day. `pending` chi co nghia la "viec con do
    // qua mot lan nap trang", va doJob se tu dat no ngay truoc khi dieu huong.
    // Dat o day thi nhanh lam-tai-cho khong ai xoa -> bot dung han sau bai dau,
    // va lan nap trang ke tiep con dang lai chinh bai do.
    doJob(job);
  }

  /**
   * Uu tien lam ngay tai cho (khong tai lai trang). Chi khi khong mo duoc
   * moi phai dieu huong cung — luc do may trang thai se tiep tuc sau khi nap lai.
   *
   * `pending` CHI duoc dat ngay truoc khi dieu huong. Dat som (nhu ban truoc)
   * khien runTick tuong da xong va khoi dong them mot luot nua.
   */
  async function doJob(job) {
    busy = true;
    try {
      if (job.type === 'tweet') {
        addLog('Dang mo o soan thao...');
        const scope = await openComposerInPlace();
        if (scope) {
          await doPostTweet(job.text, scope);
          await closeComposer();
          finishJob(job, `Da dang: ${job.text.split('\n')[0].slice(0, 50)}`);
          return;
        }
      } else {
        addLog('Dang mo bai de retweet...');
        if (await openTweetInPlace(job.id)) {
          await doRetweet();
          finishJob(job, `Da retweet: ${job.id}`);
          return;
        }
      }

      // khong lam tai cho duoc -> danh phai tai lai trang
      addLog('Khong mo duoc tai cho, phai tai lai trang.', 'warn');
      state.pending = job;
      save(state);
      await clearComposerIfAny();   // khong thi dinh canh bao "unsaved changes"
      location.href = job.type === 'retweet'
        ? `https://x.com/i/status/${job.id}`
        : 'https://x.com/compose/post';
    } catch (e) {
      state.pending = null;
      const seen = describeOverlay();
      addLog(`Loi: ${e.message}${seen ? ` — man hinh dang hien: "${seen}"` : ''}`, 'err');

      // Bo han bai nay. Khong bo thi pickNext() tra lai dung no o luot sau,
      // gap lai dung hop thoai do, va ket cung o day mai.
      state.posted.push(fingerprint(job));
      if (job.hashtag && job.contentIndex != null) {
        state.postedContent.push({ hashtag: job.hashtag, contentIndex: job.contentIndex });
      }
      state.cursor = job.index + 1;

      if (++consecutiveFails >= 5) {
        state.running = false;
        addLog('Hong 5 lan lien tiep, da dung. Kiem tra xem X co dang chan khong.', 'err');
        save(state);
        render();
      } else {
        scheduleNext();

        // Hop thoai cua X (canh bao trung bai, thu thach xac minh...) khong tu
        // mat, va ban nhap sot lai se dinh vao dau bai sau. Tai lai trang la
        // cach chac chan nhat de co lai DOM sach — nhung no dat: mat ca chuc
        // giay nap lai, va tren may cham thi chinh luc nap lai do lai de de ra
        // loi tiep. Nen thu don TAI CHO truoc, chi tai lai khi don khong sach.
        await dismissOverlays();
        const clean = await clearComposerIfAny();
        const blocked = document.querySelector('[role="dialog"], [role="alert"]');
        if (clean && !blocked) {
          addLog('Da don tai cho, chay tiep khong can tai lai trang.', 'warn');
          save(state);
          render();
        } else {
          addLog('Don tai cho khong sach, tai lai trang roi chay tiep.', 'warn');
          save(state);
          location.reload();
        }
      }
    } finally {
      busy = false;
    }
  }

  function finishJob(job, msg) {
    consecutiveFails = 0;
    state.posted.push(fingerprint(job));
    if (job.hashtag && job.contentIndex != null) {
      state.postedContent.push({ hashtag: job.hashtag, contentIndex: job.contentIndex });
    }
    state.perDay[today()] = countToday() + 1;
    state.cursor = job.index + 1;
    addLog(msg, 'ok');
    scheduleNext();
  }

  // ---------------------------------------------------------------- giao dien

  const PANEL_CSS = `
        #xap-panel{position:fixed;right:16px;bottom:16px;width:340px;z-index:2147483647;
          background:#15202b;color:#e7e9ea;border:1px solid #38444d;border-radius:12px;
          font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
          box-shadow:0 8px 28px rgba(0,0,0,.5);font-feature-settings:'kern' 1}
        #xap-panel header{display:flex;align-items:center;justify-content:space-between;
          padding:12px 14px;border-bottom:1px solid #38444d;cursor:pointer}
        #xap-panel h3{margin:0;font-size:14px;font-weight:700;letter-spacing:0.3px}
        #xap-body{padding:14px;display:block}
        #xap-panel.collapsed #xap-body{display:none}
        #xap-panel textarea{width:100%;height:96px;background:#0f1419;color:#e7e9ea;
          border:1px solid #38444d;border-radius:8px;padding:10px;
          font:13px/1.5 'Monaco','Menlo','Ubuntu Mono','Courier New',monospace;resize:vertical;
          letter-spacing:0.2px;font-variant-numeric:tabular-nums}
        #xap-panel input{width:56px;background:#0f1419;color:#e7e9ea;border:1px solid #38444d;
          border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;letter-spacing:0.3px}
        #xap-panel button{border:0;border-radius:999px;padding:8px 16px;font-weight:700;
          cursor:pointer;font-size:13px;letter-spacing:0.3px;font-family:inherit}
        .xap-go{background:#1d9bf0;color:#fff}
        #xap-credit{margin-top:12px;padding-top:10px;border-top:1px solid #38444d;
          font-size:12px;color:#8899a6;text-align:center;letter-spacing:0.2px}
        #xap-credit a{color:#8899a6;text-decoration:none}
        #xap-credit a:hover{text-decoration:underline}
        .xap-stop{background:#f4212e;color:#fff}
        .xap-ghost{background:#273340;color:#e7e9ea}
        #xap-status{padding:10px;background:#0f1419;border-radius:8px;margin:10px 0;
          font-size:13px;line-height:1.6}
        #xap-log{max-height:110px;overflow:auto;font:12px/1.6 'Monaco','Menlo','Ubuntu Mono','Courier New',monospace;
          background:#0f1419;border-radius:8px;padding:10px;margin-top:8px;letter-spacing:0.2px;
          font-variant-numeric:tabular-nums}
        .xap-ok{color:#00ba7c}.xap-err{color:#f4212e}.xap-warn{color:#ffd400}
        .xap-row{display:flex;gap:10px;align-items:center;margin:10px 0;flex-wrap:wrap}
        .xap-row label{font-size:13px;opacity:.8;letter-spacing:0.2px}
        .xap-dim{opacity:.5;font-weight:400}
        .xap-dim2{opacity:.6}
        .xap-sum{cursor:pointer;font-size:13px;opacity:.85;letter-spacing:0.2px}
        .xap-mv{margin:10px 0}
        .xap-w100{width:100%}
        .xap-wauto{width:auto}
        .xap-right{margin-left:auto}
        .xap-cand{background:#0f1419;border-radius:8px;padding:10px;margin:10px 0}
        .xap-cand-head{font-size:13px;margin-bottom:8px;font-weight:600}
        .xap-cand-item{border-top:1px solid #253341;padding:8px 0;font-size:12px}
        .xap-cand-meta{opacity:.7;font-size:12px}
        .xap-cand-text{margin:4px 0;font-size:12px;line-height:1.4}
        .xap-mini{padding:4px 10px;font-size:12px}
        .xap-mini2{padding:3px 9px;font-size:12px}
        .xap-ml{margin-left:8px}
        .xap-link{color:#1d9bf0;margin-left:6px;text-decoration:none;font-size:12px}
        .xap-link:hover{text-decoration:underline}
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
        <div class="xap-row"><label>Label — go sao dang y vay, ca cum nam duoi content va cach mot dong trong</label></div>
        <textarea id="xap-queue" placeholder="LENAMIU AT FLEX
#Flex1045xPLSLoveรักได้ไหม
#LenaMiu #ลีน่าหมิว"></textarea>
        <div class="xap-row">
          <label>So tweet muon dang</label>
          <input id="xap-content-quantity" type="number" min="1" max="500" value="100">
        </div>
        <div class="xap-row">
          <label>Cach nhau</label><input id="xap-gapmin" type="number" min="1" value="1">
          <label>den</label><input id="xap-gapmax" type="number" min="1" value="4"> <label>phut</label>
        </div>
        <div class="xap-row">
          <label>Toi da</label><input id="xap-max" type="number" min="0" value="100"> <label>bai/ngay</label>
          <label class="xap-right"><input id="xap-loop" type="checkbox" class="xap-wauto"> lap lai</label>
        </div>
        <div class="xap-row">
          <label>Chi dang tu</label><input id="xap-hfrom" type="number" min="0" max="23" value="7">
          <label>den</label><input id="xap-hto" type="number" min="0" max="24" value="23"> <label>gio</label>
        </div>
        <div class="xap-row">
          <label><input id="xap-natural" type="checkbox" class="xap-wauto"> nhip tu nhien (tap trung quanh giua khoang)</label>
        </div>
        <div class="xap-row">
          <label><input id="xap-slow" type="checkbox" class="xap-wauto"> may cham (gian moi nhip cho ra gap 3)</label>
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
        <div id="xap-credit">Lam boi <a href="${REPO}" target="_blank" rel="noopener">${AUTHOR}</a></div>
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
      state.postedContent = [];
      state.cursor = 0;
      state.perDay = {};
      save(state);
      addLog('Da xoa lich su.', 'warn');
      render();
    };

    $('xap-search').onclick = async () => {
      syncFromUI();
      const kw = state.settings.keyword.trim();
      if (!kw) return addLog('Chua nhap tu khoa.', 'warn');
      state.pending = { type: 'search', index: state.cursor };
      save(state);
      addLog(`Dang tim "${kw}"...`);
      const f = state.settings.latestOnly ? '&f=live' : '';
      await clearComposerIfAny();   // khong thi dinh canh bao "unsaved changes"
      location.href = `https://x.com/search?q=${encodeURIComponent(kw)}&src=typed_query${f}`;
    };

    for (const id of ['xap-gapmin', 'xap-gapmax', 'xap-max', 'xap-loop', 'xap-queue',
                      'xap-keyword', 'xap-exclude', 'xap-minlikes', 'xap-maxsearch',
                      'xap-approval', 'xap-latest', 'xap-hfrom', 'xap-hto', 'xap-natural',
                      'xap-slow', 'xap-content-quantity']) {
      $(id).addEventListener('change', syncFromUI);
      $(id).addEventListener('input', syncFromUI);
    }
  }

  /**
   * Doc o nhap label va sinh ra hang doi tweet.
   * Ca cum label nam chung trong moi tweet, duoi mot noi dung boc ngau nhien
   * tu content-lenamiu.json, cach nhau mot dong trong.
   */
  function parseQueue(raw) {
    const items = [];
    // Giu NGUYEN cach xuong dong nguoi dung go, ke ca dong trong o giua: do la
    // mot phan cach trinh bay cua bai, go sao thi dang y nhu vay. Chi cat phan
    // trong thua o dau va cuoi o nhap.
    const lines = raw.split('\n').map((h) => h.trim());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (!lines.length) return items;

    if (!contentData.length) {
      addLog('Chua load duoc content-lenamiu.json', 'err');
      return items;
    }

    const quantity = state.settings.quantity;
    // Khoa chong trung chi tinh tren cac dong CO CHU. Dem ca dong trong vao thi
    // them bot mot dong trang la thanh nhom label khac, va ca lich su "content
    // nay da dang kem label nay" coi nhu vut di.
    const labelKey = lines.filter(Boolean).join(' ').toLowerCase();

    // Chi tru nhung content da dang kem dung nhom label nay
    const usedIndices = state.postedContent
      .filter((pc) => pc.hashtag === labelKey)
      .map((pc) => pc.contentIndex);
    const availableIndices = contentData
      .map((_, i) => i)
      .filter((i) => !usedIndices.includes(i));

    if (availableIndices.length < quantity) {
      addLog(`Chi con ${availableIndices.length} content (can ${quantity})`, 'warn');
    }

    const labels = lines.join('\n');

    for (let i = 0; i < quantity && availableIndices.length > 0; i++) {
      const pick = Math.floor(Math.random() * availableIndices.length);
      const contentIndex = availableIndices[pick];
      availableIndices.splice(pick, 1);
      const content = contentData[contentIndex];
      items.push({
        type: 'tweet',
        text: `${content}\n\n${labels}`,
        content,
        labels,
        hashtag: labelKey,
        contentIndex,
      });
    }
    return items;
  }

  function syncFromUI() {
    state.settings.labels = $('xap-queue').value;
    state.settings.quantity = Math.max(1, parseInt($('xap-content-quantity').value, 10) || 1);
    // Chi dung lai hang doi khi label hoac so luong that su doi. Neu dung lai moi
    // lan goi thi tung phim go — va ca nut Bat dau — deu boc lai 100 noi dung
    // ngau nhien khac, lam bo dem tien do nhay ve 0 du dang dang do.
    // QUEUE_FORMAT nam trong chu ky de khi doi cach ghep bai (bo dau thoi gian,
    // them dong trong truoc label...) hang doi cu con nam trong localStorage
    // tu dung lai mot lan. Khong co no thi label khong doi = sig khong doi, va
    // bot cu dang tiep nhung bai da dung theo dinh dang cu.
    const sig = `${QUEUE_FORMAT}\u0000${state.settings.labels}\u0000${state.settings.quantity}`;
    if (sig !== state.queueSig) {
      state.queueSig = sig;
      // Retweet do khung duyet day vao khong den tu o nhap, phai giu lai.
      const retweets = state.queue.filter((i) => i.type === 'retweet');
      state.queue = [...retweets, ...parseQueue(state.settings.labels)];
      state.cursor = 0;
    }
    // Khong ep sang so o day. O dang go do ("" hoac "3") ma bi ep ve mac dinh
    // se nhay so ngay truoc mat. Chi doc thoi; viec kep khoang de luc dung toi.
    const num = (id, def) => {
      const raw = $(id).value.trim();
      return raw === '' ? def : Math.max(0, +raw || def);
    };
    state.settings.gapMin = num('xap-gapmin', 1);
    state.settings.gapMax = num('xap-gapmax', 4);
    state.settings.maxPerDay = num('xap-max', 100);
    state.settings.loop = $('xap-loop').checked;
    state.settings.keyword = $('xap-keyword').value;
    state.settings.excludeWords = $('xap-exclude').value;
    state.settings.minLikes = num('xap-minlikes', 0);
    state.settings.maxPerSearch = num('xap-maxsearch', 10);
    state.settings.requireApproval = $('xap-approval').checked;
    state.settings.latestOnly = $('xap-latest').checked;
    state.settings.hourFrom = Math.min(23, num('xap-hfrom', 0));
    state.settings.hourTo = Math.min(24, num('xap-hto', 24));
    state.settings.naturalPace = $('xap-natural').checked;
    state.settings.slowMode = $('xap-slow').checked;
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

  /**
   * Dat gia tri cho o nhap, TRU KHI nguoi dung dang go vao no.
   * render() chay moi giay; neu ghi de vo dieu kien thi moi lan go mot chu
   * se bi reset ve gia tri cu ngay sau do.
   */
  function setVal(id, value) {
    const el = $(id);
    if (!el || document.activeElement === el) return;
    if (el.type === 'checkbox') el.checked = value;
    else if (el.value !== String(value)) el.value = value;
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

    // Ghi lai dung text nguoi dung da go (khong phai gia tri suy ra tu hang doi,
    // lam vay se nuot xuong dong va ha chu thuong cua label goc).
    setVal('xap-queue', state.settings.labels);
    setVal('xap-content-quantity', state.settings.quantity);
    setVal('xap-gapmin', state.settings.gapMin);
    setVal('xap-gapmax', state.settings.gapMax);
    setVal('xap-max', state.settings.maxPerDay);
    setVal('xap-loop', state.settings.loop);
    setVal('xap-keyword', state.settings.keyword);
    setVal('xap-exclude', state.settings.excludeWords);
    setVal('xap-minlikes', state.settings.minLikes);
    setVal('xap-maxsearch', state.settings.maxPerSearch);
    setVal('xap-approval', state.settings.requireApproval);
    setVal('xap-latest', state.settings.latestOnly);
    setVal('xap-hfrom', state.settings.hourFrom);
    setVal('xap-hto', state.settings.hourTo);
    setVal('xap-natural', state.settings.naturalPace);
    setVal('xap-slow', state.settings.slowMode);
    renderCandidates();
    renderLog();
  }

  // ---------------------------------------------------------------- khoi dong

  // Trong extension thi doc file dong goi kem; duoi Tampermonkey thi khong co
  // chrome.runtime nen phai tai tu repo.
  const CONTENT_URL =
    typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('content-lenamiu.json')
      : `${REPO.replace('github.com', 'raw.githubusercontent.com')}/master/content-lenamiu.json`;

  async function loadDefaultContent() {
    try {
      const response = await fetch(CONTENT_URL);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.contents)) {
        contentData = data.contents;
        addLog(`Da load ${data.contents.length} content`, 'ok');
      }
    } catch (err) {
      addLog(`Khong load duoc content: ${err.message}`, 'err');
    }
  }

  /**
   * Ban nhap con sot trong o soan thao se dinh vao dau bai ke tiep, thanh mot
   * bai gop nhieu bai. Don ngay luc nap trang, truoc khi lam bat cu viec gi.
   *
   * Chi don khi bot dang chay. Luc da dung thi o soan thao la cua nguoi dung,
   * xoa chu ho vua go la mat trang. Va ke ca luc dang chay cung chi dong vao
   * o soan bai moi — xem ownComposer().
   */
  async function clearLeftoverDraft() {
    if (!state.running) return;
    const box = ownComposer();
    if (!box || !box.textContent.trim()) return;
    addLog(await clearComposerIfAny()
      ? 'Da don ban nhap con sot trong o soan thao.'
      : 'O soan thao con ban nhap cu, khong don duoc.', 'warn');
  }

  async function boot() {
    // Cho X dung xong khung trang. Doi theo DAU HIEU chu khong theo dong ho:
    // may cham hoac mang ket thi 1-2 giay chua chac da co gi tren man hinh.
    await until(() => document.querySelector('[data-testid="SideNav_NewTweet_Button"], '
      + '[data-testid="tweetTextarea_0"], [data-testid="primaryColumn"]'), 15000, 300);
    await sleep(800);
    await loadDefaultContent();  // load default content
    buildPanel();
    render();
    await clearLeftoverDraft();

    if (state.pending) {
      addLog('Tiep tuc viec dang do sau khi trang nap lai...');
      await resumePending();
    }

    setInterval(() => {
      if (!busy) state = load();   // dang lam viec thi giu state trong bo nho
      runTick();
      render();
    }, 1000);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
