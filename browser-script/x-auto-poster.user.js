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
  const QUEUE_FORMAT = 'v3-pick-at-post';   // doi khi cach ghep content + label doi
  const MAX_TWEET = 280;
  const VERSION = '1.0.0';
  const AUTHOR = 'dangtthuynhi';
  const REPO = 'https://github.com/dangtthuynhi/twitter-tweet';

  // ---------------------------------------------------------------- trang thai

  const DEFAULTS = {
    running: false,
    queue: [],          // [{type:'tweet', text}], [{type:'reply', id, n, text}] hoac [{type:'retweet', id}]
    cursor: 0,
    posted: [],         // dau van tay cac bai da dang, chong trung
    postedContent: [],   // [{hashtag, contentIndex}, ...] de chong trung content
    perDay: {},         // { '2026-09-23': 5 }
    pending: null,      // viec dang lam do dang qua lan nap trang
    waitVisible: [],    // loai viec ('reply'/'retweet') hong vi tab an, doi tab hien lai
    nextAt: 0,
    log: [],
    queueSig: '',       // label+so luong da dung de dung hang doi hien tai
    queueId: '',        // dot tweet moi hien tai, nam trong dau van tay tweet
    queueTweetSig: '',  // label+so luong cua dot tweet moi do
    settings: {
      labels: '',       // text o nhap label, giu qua cac lan nap lai trang
      quantity: 100,    // moi lan dung hang doi thi sinh bao nhieu tweet
      // --- list tweet: reply (kem label) roi retweet ---
      links: '',        // moi dong mot tweet id (hoac link)
      repliesPerLink: 1,  // moi tweet trong list reply bao nhieu lan, roi retweet mot lan
      gapMin: 1,        // cach nhau it nhat bao nhieu phut
      gapMax: 4,        // nhieu nhat bao nhieu phut
      maxPerDay: 100,
      loop: false,      // het queue thi quay lai tu dau
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
  let contentLens = [];   // do dai tung content theo cach X dem, tinh mot lan luc nap

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

  // Tweet va reply lay theo VI TRI chu khong theo chu: content chi duoc boc
  // luc dang (xem assignContent), truoc do o hang doi chua co chu nao.
  // Reply theo (bai, lan thu may): bai da reply roi thi khong reply them nua.
  // Tweet theo (lan dung hang doi, so thu tu): dung lai hang doi la bat dau lai.
  const fingerprint = (item) =>
    item.type === 'retweet' ? `rt:${item.id}`
      : item.type === 'reply' ? `rp:${item.id}:${item.n}`
        : item.qid ? `tw:${item.qid}:${item.slot}`
          : `tw:${item.text.trim().slice(0, 200)}`;   // hang doi kieu cu

  /**
   * Do dai bai theo cach X dem (bang trong so cua twitter-text): emoji tinh 2;
   * chu Latin, Thai va dau cau thong dung tinh 1; con lai (Han, Nhat, ca chu
   * Viet co dau dung san) tinh 2. Qua 280 thi X khoa nut dang va bai ket lai.
   */
  const EMOJI_RE = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
  function tweetLength(s) {
    let n = 0;
    for (const ch of s.normalize('NFC').replace(EMOJI_RE, () => { n += 2; return ''; })) {
      const cp = ch.codePointAt(0);
      n += cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) ||
        (cp >= 0x2032 && cp <= 0x2037) ? 1 : 2;
    }
    return n;
  }

  // Label dai den muc chi con chua toi chung nay cho content thi khong dang
  // nua: cat content xuong vai chu thi bai khong con nghia gi.
  const MIN_ROOM = 30;

  /** So ky tu con lai cho content khi ghep voi cum label (cach mot dong trong). */
  const contentRoom = (labels) => MAX_TWEET - (labels ? tweetLength(labels) + 2 : 0);

  /**
   * Chi so cac content con dung duoc voi cum label nay: chua tung dang kem
   * dung nhom label do. Content dai qua thi khong bo, assignContent se cat bot.
   */
  function usableContent(labels, labelKey) {
    if (contentRoom(labels) < MIN_ROOM) return [];
    const used = new Set(state.postedContent
      .filter((pc) => pc.hashtag === labelKey)
      .map((pc) => pc.contentIndex));
    const out = [];
    for (let i = 0; i < contentData.length; i++) {
      if (!used.has(i)) out.push(i);
    }
    return out;
  }

  // Ten nhan vat trong kho content: cau goi ten la cau phai giu lai khi cat bot,
  // bo no di thi nhung cau "they/them" con lai khong biet noi ve ai.
  const NAME_RE = /Lena|Miu|ลีน่า|หมิว/;
  const EMOJI_TAIL_RE = new RegExp(`(?:\\s*(?:${EMOJI_RE.source}))+\\s*$`, 'u');

  /**
   * Cat chu cho vua `room` ky tu, dung o ranh gioi TU (chu Thai khong co dau
   * cach giua cac tu, nen phai nho Intl.Segmenter tach), roi them "…".
   */
  function cutWords(text, room) {
    const ELL = '…';
    const budget = room - tweetLength(ELL);
    const segs = typeof Intl !== 'undefined' && Intl.Segmenter
      ? [...new Intl.Segmenter('th', { granularity: 'word' }).segment(text)].map((s) => s.segment)
      : text.split(/(\s+)/);
    let out = '';
    for (const s of segs) {
      if (tweetLength(out + s) > budget) break;
      out += s;
    }
    out = out.replace(/[\s,;:.!?-]+$/u, '');
    return out ? out + ELL : '';
  }

  /**
   * Cat bot content cho vua `room` ky tu, giu cho bai van tron nghia:
   *  1. bo dan tung cau tu cuoi len (cau ket di truoc), giu emoji cuoi bai;
   *  2. van dai thi bo emoji, roi bo cac cau mo dau dung truoc cau goi ten;
   *  3. chi con mot cau ma van dai thi moi cat giua cau, them "…".
   * Content tieng Thai khong co dau cham cau: cac y cach nhau bang dau cach,
   * nen coi moi y la mot "cau".
   */
  function fitContent(content, room) {
    if (tweetLength(content) <= room) return content;
    const m = content.match(EMOJI_TAIL_RE);
    const tail = m ? m[0].trim() : '';
    const body = m ? content.slice(0, m.index) : content;
    let parts = body.split(/(?<=[.!?…])\s+/);
    if (parts.length === 1) parts = body.split(/\s+/);

    const fits = (s) => tweetLength(s) <= room;
    const named = Math.max(0, parts.findIndex((p) => NAME_RE.test(p)));
    let cur = parts.slice();
    const text = () => cur.join(' ');
    const withTail = () => (tail ? `${text()} ${tail}` : text());

    while (cur.length > named + 1 && !fits(withTail())) cur.pop();
    if (fits(withTail())) return withTail();
    if (fits(text())) return text();
    cur = cur.slice(named);
    if (fits(text())) return text();
    return cutWords(text(), room);
  }

  /**
   * Boc ngau nhien content cho tweet/reply sap dang — boc NGAY LUC DANG, moi
   * bai mot lan boc rieng.
   *
   * Khong boc san tu luc dung hang doi: hang doi nam trong storage, va cap nhat
   * kho content (ban moi, cau dai hon...) ma nhan khong doi thi hang doi cu
   * van giu nguyen chu cu, bot cu the dang tiep cau cu.
   *
   * Content ghep voi label ma qua 280 ky tu thi cat bot content (fitContent),
   * khong dong toi label.
   * @returns {boolean} false neu khong con content nao dung duoc
   */
  function assignContent(job) {
    if (job.text != null) return true;   // da boc truoc khi tai lai trang
    const { labels } = job;
    const pool = usableContent(labels, job.hashtag);
    if (!pool.length) return false;
    const contentIndex = pool[Math.floor(Math.random() * pool.length)];
    const content = fitContent(contentData[contentIndex], contentRoom(labels));
    const text = labels ? `${content}\n\n${labels}` : content;
    if (!content || tweetLength(text) > MAX_TWEET) return false;
    job.content = content;
    job.contentIndex = contentIndex;
    job.text = text;
    return true;
  }

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

  /**
   * Bam mot nut, doi no het disabled truoc da.
   *
   * Kiem TRUOC, het han moi thoi — khong dung `while (chua het han)`. Tab X
   * bi an thi Chrome don hen gio: mot nhip sleep(300) co the thanh ca phut.
   * Ngu day thi da qua han, va vong while thoat ra bao "khong bam duoc" ma
   * khong nhin nut lan nao nua, du luc do nut da bat tu lau.
   */
  async function clickWhenEnabled(elOrSelector, timeout = 12000, root = document) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const el = typeof elOrSelector === 'string' ? root.querySelector(elOrSelector) : elOrSelector;
      if (el && el.getAttribute('aria-disabled') !== 'true' && !el.disabled) {
        el.click();
        return true;
      }
      if (Date.now() >= deadline) break;
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
    // Kiem truoc, het han moi thoi: xem clickWhenEnabled()
    for (;;) {
      const scope = composerOnScreen();
      if (scope) return scope;
      if (Date.now() >= deadline) break;
      await sleep(300);
    }
    // Tha bo bai con hon dang nham cho. Nguoi goi bat loi nay va bo qua bai.
    throw new Error(`Khong thay o soan thao bai moi — ${describeScreen()}`);
  }

  /**
   * O soan bai moi dang hien, hoac null: modal CHUA o soan thao, hoac chinh
   * trang soan bai (/compose/post, va /intent/post ma replyViaCompose mo ra).
   *
   * Phai la modal chua o soan thao, khong phai modal bat ky: trang nao cung co
   * the dang co san mot [role="dialog"] khac — the ho so hien khi re chuot len
   * ten nguoi o trang Thong bao, menu, popup cua X — va lay nham no thi tim o
   * soan thao trong do mai khong thay.
   *
   * O soan thao NGOAI modal chi dang tin khi dang dung o trang soan bai. Tren
   * trang mot bai viet (hay trang xem anh cua bai do), chinh cai ten
   * "tweetTextarea_0" lai la o TRA LOI bai cua nguoi khac — go vao do la bai
   * cua minh di ra duoi dang reply duoi tweet nguoi ta.
   */
  function composerOnScreen() {
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('[data-testid="tweetTextarea_0"]'));
    if (dialog) return dialog;
    if (/^\/(compose|intent)\//.test(location.pathname) &&
        document.querySelector('[data-testid="tweetTextarea_0"]')) {
      return document;
    }
    return null;
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

  /**
   * Khung cua CHINH bai `id` tren trang — khong phai bai cha nam phia tren,
   * hay cac reply nam phia duoi no.
   *
   * Trang mot bai viet hien ca chuoi hoi thoai, moi bai mot article va bai nao
   * cung co nut retweet/reply rieng. Lay nut dau tien tren trang la bam vao bai
   * cha (khi `id` la mot reply), hoac vao reply dau tien (khi `id` da retweet
   * roi, nut cua no doi ten thanh "unretweet"). Nhan ra bai bang link thoi gian
   * cua no: link do tro dung ve /status/<id>.
   */
  function findArticle(id) {
    const re = new RegExp(`/status/${id}(?:[/?#]|$)`);
    return [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((art) => [...art.querySelectorAll('a[href*="/status/"]')]
        .some((a) => a.querySelector('time') && re.test(a.getAttribute('href')))) || null;
  }

  async function waitArticle(id, timeout = 20000) {
    let art = null;
    await until(() => (art = findArticle(id)), timeout, 300);
    if (!art) throw new Error(`Khong thay bai ${id} tren trang (bi xoa, bi khoa, hoac chua tai xong)`);
    return art;
  }

  /** Dang dung o trang cua bai `id` chua. */
  const onStatusPage = (id) => new RegExp(`/status/${id}(?:/|$)`).test(location.pathname);

  /**
   * Retweet bai `id`. Tra ve false neu bai da duoc retweet tu truoc — khong
   * phai loi, chi la khong con gi de lam.
   */
  async function doRetweet(id) {
    const art = await waitArticle(id);
    if (art.querySelector('[data-testid="unretweet"]')) return false;
    const btn = art.querySelector('[data-testid="retweet"]');
    if (!btn) throw new Error(`Khong thay nut retweet cua bai ${id}`);
    btn.click();
    await clickWhenEnabled('[data-testid="retweetConfirm"]', 8000);
    // Xong that khi chinh nut cua bai do doi sang "unretweet"
    if (!(await until(() => findArticle(id)?.querySelector('[data-testid="unretweet"]'), 8000))) {
      throw new Error(`Da bam retweet nhung X chua ghi nhan (bai ${id})`);
    }
    await sleep(1000);
    return true;
  }

  /**
   * Reply bai `id`: bam nut reply cua CHINH bai do, go vao o tra loi va gui.
   *
   * Bam reply thi X mo o tra loi dang modal. Khong thay modal thi dung o tra
   * loi inline nam ngay duoi bai — tren trang mot bai viet, o "tweetTextarea_0"
   * ngoai modal chinh la o do.
   */
  async function doReply(id, text) {
    const art = await waitArticle(id);
    const btn = art.querySelector('[data-testid="reply"]');
    if (!btn) throw new Error(`Khong thay nut reply cua bai ${id}`);
    if (btn.getAttribute('aria-disabled') === 'true') {
      throw new Error(`Bai ${id} khong cho reply (chu bai gioi han nguoi tra loi)`);
    }
    btn.click();

    const replyDialog = () => [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('[data-testid="tweetTextarea_0"]'));
    await until(() => replyDialog(), 8000);
    const scope = replyDialog() || (onStatusPage(id) && document);
    if (!scope) throw new Error(`Khong mo duoc o tra loi bai ${id}`);

    try {
      await doPostTweet(text, scope);
    } catch (e) {
      // Dong o tra loi ma khong luu: de lai thi chu dang go do thanh draft, va
      // lan bam reply sau X do nguoc no vao.
      if (scope !== document) await discardDraft();
      throw e;
    }
    if (scope !== document && scope.isConnected) await closeComposer();
  }

  // Chu goi y trong o soan bai khi dang tra loi ("Post your reply", "Dang cau
  // tra loi cua ban"...), cac ngon ngu hay dung tren X
  const REPLY_HINT_RE = /reply|trả lời|ตอบกลับ|antwort|respuesta|réponse|返信|回复|답글/i;

  /**
   * Reply qua o soan bai cua X (x.com/intent/post?in_reply_to=<id>) — duong
   * dung khi tab dang an.
   *
   * Tab an thi X khong ve trang bai viet, nen doReply() khong co nut reply cua
   * bai de bam. O soan bai thi van hien (dang bai moi luc tab an van chay), va
   * intent mo dung o do, gan san bai can tra loi.
   *
   * Truoc khi go phai thay dau hieu o nay dang TRA LOI dung bai: link toi bai
   * do trong khung, hoac chu goi y kieu "Post your reply". Khong thay thi bo
   * — dang ra la thanh mot bai moi, khong phai reply.
   */
  async function replyViaCompose(id, text) {
    const scope = await composerScope();
    const root = scope === document ? (document.querySelector('main') || document) : scope;
    const replying = () => root.querySelector(`a[href*="/status/${id}"]`) ||
      REPLY_HINT_RE.test(root.querySelector('.public-DraftEditorPlaceholder-inner')?.textContent || '');
    if (!(await until(replying, 8000, 300))) {
      throw new Error(`O soan bai khong hien la dang tra loi bai ${id}, bo qua de khong dang nham thanh bai moi`);
    }
    await doPostTweet(text, scope);
    if (scope !== document && scope.isConnected) await closeComposer();
  }

  // Chu tren nut cua hop thoai retweet, cac ngon ngu hay dung tren X. Nut
  // retweet phai KHOP NGUYEN chu; nut go retweet ("Undo repost") phai co ca
  // tu "go/huy" lan tu "repost" — rieng "ยกเลิก" (Cancel tieng Thai) thi khong.
  const REPOST_RE = /^(repost|retweet|đăng lại|รีโพสต์|retweeten|reposter|repostear|リポスト|转帖|재게시)$/i;
  const UNDO_REPOST_RE = /(undo|hoàn tác|huỷ|hủy|ยกเลิก|rückgängig|deshacer|annuler|取り消|撤销|취소).*(repost|retweet|đăng lại|รีโพสต์|リポスト|转帖|재게시)/i;
  const CANCEL_RE = /^(cancel|hủy|huỷ|ยกเลิก|abbrechen|cancelar|annuler|キャンセル|取消|취소)$/i;
  const OVERLAY_SELECTOR =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [data-testid="confirmationSheetDialog"]';

  /**
   * Mo ta ngan man hinh luc loi: dang o trang nao, co may hop thoai, chu tren
   * cac nut. Ghi vao nhat ky de con lan ra khi X ve khac di.
   */
  function describeScreen() {
    const boxes = [...document.querySelectorAll(OVERLAY_SELECTOR)];
    const labels = boxes
      .flatMap((b) => [...b.querySelectorAll('[role="button"], button, [role="menuitem"]')])
      .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean).slice(0, 8);
    return `dang o ${location.pathname}${location.search}, ${boxes.length} hop thoai, nut: ${labels.join(' | ') || '(khong co)'}`;
  }

  /**
   * Retweet qua hop thoai retweet cua X (x.com/intent/retweet?tweet_id=<id>) —
   * duong dung khi tab dang an, vi doRetweet() can trang bai viet hien ra.
   *
   * Chi bam khi nut DUNG la "Repost". Bai da retweet roi thi hop thoai co the
   * hien "Undo repost" — bam nham la go retweet, nen gap nut do thi bam Huy
   * va bao "da retweet tu truoc". Khong nhan ra nut nao thi khong bam gi.
   * @returns {boolean} false neu bai da retweet tu truoc
   */
  async function retweetViaIntent(id) {
    // Hop thoai xac nhan, hoac menu nho nhu menu "Repost / Quote" quen thuoc:
    // nhan theo testid cua X truoc, theo chu tren nut sau
    const clickables = (root) => [...root.querySelectorAll('[role="button"], button, [role="menuitem"]')];
    const textOf = (b) => (b.innerText || '').trim();
    // Tieu de hop thoai, vd "Undo repost?" khi nut chi ghi "Undo"
    const heading = (root) => (root.querySelector('h1, h2, [role="heading"]')?.innerText || '').trim();
    const undoIn = (root) => root.querySelector('[data-testid="unretweetConfirm"]') ||
      clickables(root).find((b) => UNDO_REPOST_RE.test(textOf(b))) ||
      (UNDO_REPOST_RE.test(heading(root)) ? root : null);
    const repostIn = (root) => root.querySelector('[data-testid="retweetConfirm"]') ||
      clickables(root).find((b) => REPOST_RE.test(textOf(b)));
    // Hop thoai xac nhan cua X la "confirmationSheetDialog", thuong mang
    // role="alertdialog" chu khong phai "dialog" — xem answerSaveSheet()
    const find = () => [...document.querySelectorAll(OVERLAY_SELECTOR)]
      .find((d) => undoIn(d) || repostIn(d));
    if (!(await until(find, 15000, 300))) {
      throw new Error(`Khong thay hop thoai retweet cua bai ${id} — ${describeScreen()}`);
    }
    const sheet = find();
    // Kiem nut go retweet TRUOC: co no tuc la bai da retweet roi
    if (undoIn(sheet)) {
      const cancel = clickables(sheet).find((b) => CANCEL_RE.test(textOf(b)));
      if (cancel) {
        cancel.click();
      } else {
        // Menu khong co nut Huy (dismissOverlays chi don hop thoai): bam Esc
        // nhu nguoi dung, de menu khong nam lai che viec sau
        for (const t of ['keydown', 'keyup']) {
          (document.activeElement || document.body).dispatchEvent(
            new KeyboardEvent(t, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        }
      }
      await until(() => !sheet.isConnected, 3000);
      return false;
    }
    const btn = repostIn(sheet);
    btn.click();
    if (!(await until(() => !btn.isConnected, 8000))) {
      throw new Error(`Da bam retweet nhung hop thoai khong dong (bai ${id})`);
    }
    await sleep(1000);
    return true;
  }

  /**
   * Mo o soan thao bang cach bam dung nut ben trai — giong het thao tac cua
   * nguoi dung, va KHONG tai lai trang. Tai lai trang moi lan dang la mot mau
   * hanh vi khac han nguoi dung that, vi ung dung X von dieu huong noi bo.
   * @returns {boolean} mo duoc bang SPA hay khong
   */
  async function openComposerInPlace(allowPurge = true) {
    const findButton = () =>
      document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ||
      document.querySelector('[data-testid="FloatingActionButtons_Tweet_Button"]') ||
      document.querySelector('a[href="/compose/post"]');

    // Trang chu von da co san mot o soan thao inline o dau dong thoi gian.
    // Khi modal mo ra thi co HAI o cung ten "tweetTextarea_0" — phai bam vao
    // dung o trong modal, neu khong chu se go vao o inline nam khuat phia sau.
    // composerOnScreen() chi nhan modal CHUA o soan thao, khong lay bua modal
    // dau tien: o trang Thong bao, the ho so hien khi re chuot cung la modal.
    //
    // Bam toi da hai lan. Dang co popup mo (the ho so, menu...) thi lan bam
    // dau co khi chi lam dong popup do, o soan thao khong mo ra.
    let scope = null;
    for (let i = 0; i < 2 && !scope; i++) {
      const btn = findButton();
      if (!btn) break;
      btn.click();
      if (await until(() => composerOnScreen(), 8000)) scope = composerOnScreen();
      else await dismissOverlays();
    }
    if (!scope) {
      addLog(`Khong mo duoc o soan thao tai cho — ${describeScreen()}`, 'warn');
      return null;
    }

    // Con ban nhap da luu thi don truoc khi go. De do lai thi bai nao cung
    // co nguy co thua ke chu cu, va cang dang cang chong them draft moi.
    // Don xong phai mo lai o soan thao, va chi mot lan — hong thi di tiep
    // voi cai dang co, khong quay vong.
    if (allowPurge && Date.now() - draftsCheckedAt > 600000 && draftsEntry(scope)) {
      await purgeDrafts(scope);
      return openComposerInPlace(false);
    }

    // O soan thao phai RONG truoc khi go. Khong sach thi vut ban nhap bang
    // GIAO DIEN roi mo lai o moi — dung co xoa chu bang vung chon, vi khi
    // DraftJS khong nhin thay vung chon ta dat thi lenh go sau noi them chu
    // khong de len, va bai ra thanh nhan ban.
    if (allowPurge && !isEmpty(scope.querySelector('[data-testid="tweetTextarea_0"]'))) {
      addLog('O soan thao con chu cu, vut ban nhap roi mo lai.', 'warn');
      await discardDraft();
      return openComposerInPlace(false);
    }
    return scope;
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
    if (onStatusPage(id) && findArticle(id)) return true;
    // Uu tien link thoi gian: link chung /status/<id> con co the la
    // /status/<id>/photo/1 (mo trinh xem anh) hay /analytics.
    const link = findArticle(id)?.querySelector(`a[href*="/status/${id}"] time`)?.closest('a') ||
      document.querySelector(`a[href*="/status/${id}"]`);
    if (!link) return false;
    link.click();
    return until(() => onStatusPage(id) && findArticle(id), 6000);
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
    let ok = false;

    try {
      // Tim kiem da bo. Viec tim kiem con do tu ban cu thi vut di.
      if (job.type === 'search') return;
      // Binh thuong doJob da boc content truoc khi tai lai trang; con thieu
      // (pending tu ban cu) thi boc o day.
      if ((job.type === 'tweet' || job.type === 'reply') && !assignContent(job)) {
        stopNoContent(job);
        return;
      }
      if (job.type === 'tweet') {
        // Nap lai ma khong dung o trang soan bai (X dua ve trang khac, nguoi
        // dung dang o trang Thong bao...) thi mo o soan thao tai cho bang nut
        // Post, khong bo bai
        const scope = (await composerScope(8000).catch(() => null)) || (await openComposerInPlace());
        if (!scope) throw new Error(`Khong thay o soan thao bai moi — ${describeScreen()}`);
        await doPostTweet(job.text, scope);
        addLog(`Da dang: ${job.text.slice(0, 50)}`, 'ok');
      } else if (job.type === 'reply') {
        if (job.via === 'compose') await replyViaCompose(job.id, job.text);
        else await doReply(job.id, job.text);
        addLog(`Da reply ${job.id}: ${job.text.slice(0, 40)}`, 'ok');
      } else if (await (job.via === 'intent' ? retweetViaIntent(job.id) : doRetweet(job.id))) {
        addLog(`Da retweet: ${job.id}`, 'ok');
      } else {
        skipJob(job, `Bai ${job.id} da retweet tu truoc, bo qua.`);
        return;
      }
      markDone(job);
      state.perDay[today()] = countToday() + 1;
      consecutiveFails = 0;
      ok = true;
    } catch (e) {
      const seen = describeOverlay();
      addLog(`Loi: ${e.message}${seen ? ` — man hinh dang hien: "${seen}"` : ''}`, 'err');
      await dismissOverlays();

      // Bo han bai nay, y nhu nhanh dang tai cho: giu lai thi pickNext() se
      // nhat no len o luot sau va dam vao dung cho hong do. Tru reply/retweet
      // hong vi tab dang an (holdUntilVisible).
      const held = holdUntilVisible(job);
      if (!held) markDone(job);
      if (!held && ++consecutiveFails >= 5) {
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

    if (ok) scheduleAfter(job);
    else scheduleNext();
  }

  /**
   * Viec ke tiep. `skip`: cac loai viec dang doi tab hien lai
   * (holdUntilVisible) — nam cho, lay viec khac; con lai toan loai do thi tra
   * null — van con viec, khong phai het hang doi.
   */
  function pickNext({ skip = [] } = {}) {
    const pending = state.queue
      .map((item, index) => ({ ...item, index }))
      .filter((item) => !state.posted.includes(fingerprint(item)));

    const usable = pending.filter((p) => !skip.includes(p.type));
    // List tweet luon lam truoc tweet moi, ke ca reply/retweet bi giu lai luc
    // tab an ma cursor da di qua (tweet moi van dang trong luc do)
    const list = usable.find((p) => p.type !== 'tweet');
    if (list) return list;
    if (usable.length) return usable.find((p) => p.index >= state.cursor) || usable[0];
    if (pending.length) return null;
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

    // Reply/retweet dang doi tab X hien lai (xem holdUntilVisible)
    const waiting = state.waitVisible || [];
    if (waiting.length && !document.hidden) {
      state.waitVisible = [];
      save(state);
      addLog(`Tab X da hien lai, lam tiep ${waiting.join('/')}.`, 'ok');
    }

    const job = pickNext({ skip: state.waitVisible || [] });
    if (!job) {
      if ((state.waitVisible || []).length) return;   // chi con viec dang doi tab hien lai
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
      if ((job.type === 'tweet' || job.type === 'reply') && !assignContent(job)) {
        stopNoContent(job);
        return;
      }
      if (job.type === 'tweet') {
        addLog('Dang mo o soan thao...');
        const scope = await openComposerInPlace();
        if (scope) {
          await doPostTweet(job.text, scope);
          await closeComposer();
          finishJob(job, `Da dang: ${job.text.split('\n')[0].slice(0, 50)}`);
          return;
        }
      } else if (job.type === 'reply' && document.hidden) {
        // Tab an: X khong ve trang bai viet, khong co nut reply nao de bam.
        // Di qua o soan bai cua X, gan san bai can tra loi — replyViaCompose().
        addLog(`Tab X dang an: reply bai ${job.id} qua o soan bai cua X...`);
        state.pending = { ...job, via: 'compose' };
        save(state);
        await clearComposerIfAny();   // khong thi dinh canh bao "unsaved changes"
        location.href = `https://x.com/intent/post?in_reply_to=${job.id}`;
        return;
      } else if (job.type === 'retweet' && document.hidden) {
        // Tab an: tuong tu reply, di qua hop thoai retweet cua X —
        // retweetViaIntent()
        addLog(`Tab X dang an: retweet bai ${job.id} qua hop thoai retweet cua X...`);
        state.pending = { ...job, via: 'intent' };
        save(state);
        await clearComposerIfAny();   // khong thi dinh canh bao "unsaved changes"
        location.href = `https://x.com/intent/retweet?tweet_id=${job.id}`;
        return;
      } else {
        addLog(`Dang mo bai ${job.id} de ${job.type === 'reply' ? 'reply' : 'retweet'}...`);
        if (await openTweetInPlace(job.id)) {
          if (job.type === 'reply') {
            await doReply(job.id, job.text);
            finishJob(job, `Da reply ${job.id}: ${job.text.split('\n')[0].slice(0, 40)}`);
          } else if (await doRetweet(job.id)) {
            finishJob(job, `Da retweet: ${job.id}`);
          } else {
            skipJob(job, `Bai ${job.id} da retweet tu truoc, bo qua.`);
          }
          return;
        }
      }

      // khong lam tai cho duoc -> danh phai tai lai trang
      addLog('Khong mo duoc tai cho, phai tai lai trang.', 'warn');
      state.pending = job;
      save(state);
      await clearComposerIfAny();   // khong thi dinh canh bao "unsaved changes"
      location.href = job.type === 'tweet'
        ? 'https://x.com/compose/post'
        : `https://x.com/i/status/${job.id}`;
    } catch (e) {
      state.pending = null;
      const seen = describeOverlay();
      addLog(`Loi: ${e.message}${seen ? ` — man hinh dang hien: "${seen}"` : ''}`, 'err');

      // Bo han bai nay. Khong bo thi pickNext() tra lai dung no o luot sau,
      // gap lai dung hop thoai do, va ket cung o day mai. Tru reply/retweet
      // hong vi tab dang an: giu lai, lam khi tab hien len.
      const held = holdUntilVisible(job);
      if (!held) markDone(job);

      if (!held && ++consecutiveFails >= 5) {
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

  /** Het content dung duoc: dung han, cac viec sau cung se y het. */
  function stopNoContent(job) {
    state.running = false;
    const room = contentRoom(job.labels);
    addLog(!contentData.length ? 'Chua load duoc content-lenamiu.json'
      : room < MIN_ROOM ? `Label dai qua, chi con ${Math.max(0, room)} ky tu cho content (can it nhat ${MIN_ROOM}). Rut gon label roi bam Bat dau lai.`
        : 'Da dang het content cho nhom label nay. Bam "Xoa lich su" hoac doi label.', 'err');
    save(state);
    render();
  }

  /**
   * Reply/retweet hong luc tab X dang an thi KHONG bo viec do.
   *
   * Tab an (chuyen tab khac, thu nho cua so) thi Chrome ngung ve trang va don
   * hen gio lai. Luc tab an, reply di qua o soan bai (replyViaCompose) va
   * retweet qua hop thoai retweet cua X (retweetViaIntent), nhung van co the
   * hong. Hong luc nay la do tab, khong phai do bai: danh dau "da lam" nhu loi
   * thuong thi mat han viec do, va 5 lan nhu vay la bot tu dung.
   *
   * Nen giu lai, khong tinh la loi, va tam hoan RIENG loai viec do toi khi tab
   * hien lai — cac viec khac van chay, xem runTick(). Giu lai van an toan: cac
   * buoc nem loi deu nam TRUOC luc bam gui, nen lam lai khong ra reply doi;
   * retweet lam lai thi gap nut "unretweet" va bo qua.
   * @returns {boolean} da giu lai — nguoi goi khong markDone, khong dem loi
   */
  function holdUntilVisible(job) {
    if (!document.hidden || (job.type !== 'reply' && job.type !== 'retweet')) return false;
    state.waitVisible = [...new Set([...(state.waitVisible || []), job.type])];
    addLog(`Tab X dang an nen chua ${job.type} duoc bai ${job.id}. Giu lai, se lam khi mo tab X len.`, 'warn');
    return true;
  }

  /** Danh dau mot viec la da qua (xong hay hong deu vay), de khong lam lai. */
  function markDone(job) {
    state.posted.push(fingerprint(job));
    if (job.contentIndex != null) {
      state.postedContent.push({ hashtag: job.hashtag ?? '', contentIndex: job.contentIndex });
    }
    state.cursor = job.index + 1;
  }

  function finishJob(job, msg) {
    consecutiveFails = 0;
    markDone(job);
    state.perDay[today()] = countToday() + 1;
    addLog(msg, 'ok');
    scheduleAfter(job);
  }

  // Retweet cung bai chay ngay sau reply cuoi cua no: chi doi ngau nhien
  // trong khoang nay (ms), khong doi theo o "Cach nhau ... phut"
  const RETWEET_AFTER_REPLY = [3000, 10000];

  /**
   * Hen viec ke tiep sau mot viec vua XONG. Reply cuoi cung cua mot bai ma bai
   * do con retweet dang cho thi retweet di sau vai giay — reply roi retweet
   * cung luc nhu nguoi that. Con lai theo nhip binh thuong (scheduleNext).
   *
   * Khong rut ngan khi retweet dang doi tab hien lai: luc do viec ke tiep la
   * reply cua bai KHAC, va no phai doi dung nhip.
   */
  function scheduleAfter(job) {
    const pending = (type) => state.queue.some((i) => i.type === type && i.id === job.id &&
      !state.posted.includes(fingerprint(i)));
    if (job.type === 'reply' && pending('retweet') && !pending('reply') &&
        !(state.waitVisible || []).includes('retweet')) {
      const [lo, hi] = RETWEET_AFTER_REPLY;
      const wait = lo + Math.random() * (hi - lo);
      state.nextAt = Date.now() + wait;
      addLog(`Retweet bai ${job.id} sau ${Math.round(wait / 1000)} giay.`);
      save(state);
      render();
      return;
    }
    scheduleNext();
  }

  /**
   * Viec khong can lam nua (vd bai da retweet tu truoc): khong tinh vao so bai
   * trong ngay, va sang viec ke tiep ngay chu khong doi het mot nhip.
   */
  function skipJob(job, msg) {
    consecutiveFails = 0;
    markDone(job);
    addLog(msg, 'warn');
    state.nextAt = Date.now() + 5000;
    save(state);
    render();
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
        #xap-body{padding:14px;display:block;max-height:calc(100vh - 90px);overflow:auto}
        #xap-panel.collapsed #xap-body{display:none}
        #xap-panel textarea{width:100%;height:96px;background:#0f1419;color:#e7e9ea;
          border:1px solid #38444d;border-radius:8px;padding:10px;
          font:13px/1.5 'Monaco','Menlo','Ubuntu Mono','Courier New',monospace;resize:vertical;
          letter-spacing:0.2px;font-variant-numeric:tabular-nums}
        #xap-panel textarea.xap-short{height:72px}
        .xap-hint{font-size:12px;opacity:.7;margin-top:6px}
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
        .xap-wauto{width:auto}
        .xap-right{margin-left:auto}
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
        <div id="xap-label-info" class="xap-hint"></div>
        <div class="xap-row">
          <label>So tweet muon dang</label>
          <input id="xap-content-quantity" type="number" min="0" max="500" value="100">
        </div>
        <div class="xap-row"><label>List tweet — moi dong mot tweet id (hoac link): reply kem label o tren, roi retweet</label></div>
        <textarea id="xap-links" class="xap-short" placeholder="2103095712292696459
2103000000000000001"></textarea>
        <div class="xap-row">
          <label>Moi tweet reply</label>
          <input id="xap-reply-per" type="number" min="0" max="20" value="1">
          <label>lan, roi retweet</label>
        </div>
        <div id="xap-links-info" class="xap-hint"></div>
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
        <div id="xap-status">—</div>
        <div class="xap-row">
          <button id="xap-start" class="xap-go">Bat dau</button>
          <button id="xap-stop" class="xap-stop">Dung</button>
          <button id="xap-clear" class="xap-ghost">Xoa hang doi</button>
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
      // Hang doi vua bi xoa tay ma o nhap khong doi thi syncFromUI khong dung
      // lai (chu ky van y nguyen). Bam Bat dau nghia la muon chay: dung moi.
      if (!state.queue.length) {
        state.queueSig = '';
        if (refreshQueue() && state.queue.length) {
          addLog(`Da dung lai hang doi tu o nhap: ${state.queue.length} viec.`);
        }
      }
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

    $('xap-clear').onclick = () => {
      if (!state.queue.length) return addLog('Hang doi da trong.', 'warn');
      const left = pendingCount();
      if (!confirm(`Xoa ${left} viec dang cho trong hang doi va dung bot?\n` +
        'Lich su da dang van giu: link da reply/retweet roi se khong lam lai.')) return;
      clearQueue();
      save(state);
      addLog(`Da xoa hang doi (${left} viec chua lam). Sua o nhap hoac bam Bat dau de dung moi.`, 'warn');
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

    for (const id of ['xap-gapmin', 'xap-gapmax', 'xap-max', 'xap-loop', 'xap-queue',
                      'xap-hfrom', 'xap-hto', 'xap-natural', 'xap-slow',
                      'xap-content-quantity', 'xap-links', 'xap-reply-per']) {
      $(id).addEventListener('change', syncFromUI);
      $(id).addEventListener('input', syncFromUI);
    }
  }

  /**
   * Doc o nhap label.
   *
   * Giu NGUYEN cach xuong dong nguoi dung go, ke ca dong trong o giua: do la
   * mot phan cach trinh bay cua bai, go sao thi dang y nhu vay. Chi cat phan
   * trong thua o dau va cuoi o nhap.
   */
  function readLabels(raw) {
    const lines = raw.split('\n').map((h) => h.trim());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return {
      labels: lines.join('\n'),
      // Khoa chong trung chi tinh tren cac dong CO CHU. Dem ca dong trong vao
      // thi them bot mot dong trang la thanh nhom label khac, va ca lich su
      // "content nay da dang kem label nay" coi nhu vut di.
      labelKey: lines.filter(Boolean).join(' ').toLowerCase(),
    };
  }

  /**
   * Doc o danh sach link: tra ve id cac bai theo dung thu tu, bo trung, va so
   * dong khong doc duoc. Nhan link x.com / twitter.com (co ?s=20 hay /photo/1
   * phia sau cung duoc), hoac id tran.
   */
  function parseLinks(raw) {
    const ids = [];
    let bad = 0;
    for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = line.match(/\/status(?:es)?\/(\d{5,25})/) || line.match(/^(\d{5,25})$/);
      if (!m) { bad++; continue; }
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
    return { ids, bad };
  }

  /**
   * Dung hang doi tu cac o nhap: reply + retweet theo list tweet truoc, roi den cac
   * tweet moi.
   *
   * Hang doi chi giu CHO cho tung tweet/reply, chua co chu: content boc ngau
   * nhien luc dang tung bai (assignContent), ca cum label nam duoi, cach mot
   * dong trong. Tweet moi can co label; reply thi khong co label van gui
   * content tran.
   */
  function buildQueue(qid) {
    const { labels, labelKey } = readLabels(state.settings.labels);
    const { ids } = parseLinks(state.settings.links);
    const perLink = state.settings.repliesPerLink;
    const quantity = labels ? state.settings.quantity : 0;
    const need = ids.length * perLink + quantity;

    if (need && !contentData.length) addLog('Chua load duoc content-lenamiu.json', 'err');
    // Label dai qua thi dong bao duoi o label da noi, khong ghi log moi phim go
    const left = usableContent(labels, labelKey).length;
    if (contentData.length && contentRoom(labels) >= MIN_ROOM && left < need) {
      addLog(`Chi con ${left} content (can ${need})`, 'warn');
    }

    const slot = { labels, hashtag: labelKey };
    const items = [];
    for (const id of ids) {
      for (let n = 0; n < perLink; n++) items.push({ type: 'reply', id, n, fromList: true, ...slot });
      items.push({ type: 'retweet', id, fromList: true });
    }
    for (let i = 0; i < quantity; i++) items.push({ type: 'tweet', qid, slot: i, ...slot });
    return items;
  }

  /** So viec trong hang doi chua lam (chua co trong lich su). */
  const pendingCount = () => state.queue.filter((i) => !state.posted.includes(fingerprint(i))).length;

  /**
   * Bo het viec dang cho va dung bot. Lich su (posted, postedContent, so bai
   * trong ngay) giu nguyen — xoa lich su la nut khac.
   *
   * KHONG xoa queueSig: hang doi de trong qua cac lan nap trang, cho toi khi
   * nguoi dung sua o nhap hoac bam Bat dau. Xoa no thi lan nap trang ke tiep
   * refreshQueue() dung lai ngay, va nut nay nhu chua bam. Con queueTweetSig
   * thi xoa, de lan dung sau tweet moi la mot dot moi.
   */
  function clearQueue() {
    state.queue = [];
    state.cursor = 0;
    state.pending = null;
    state.running = false;
    state.nextAt = 0;
    state.queueTweetSig = '';
  }

  /**
   * Chi dung lai hang doi khi label, so luong hay list tweet that su doi.
   * Neu dung lai moi lan goi thi tung phim go — va ca nut Bat dau — deu lam
   * bo dem tien do nhay ve 0 du dang dang do.
   *
   * Tweet moi chi sang dot moi (queueId moi) khi label hoac so luong doi.
   * Them bot tweet trong list — go tay, hay lay tu trang ca nhan giua luc dang
   * chay — thi tweet moi giu nguyen tien do, khong dang lai tu dau.
   *
   * QUEUE_FORMAT nam trong chu ky de khi doi cach dung hang doi, hang doi cu
   * con nam trong storage tu dung lai mot lan — goi ca luc nap trang (boot),
   * khong doi nguoi dung go gi. Khong co no thi label khong doi = sig khong
   * doi, va bot cu dang tiep hang doi theo kieu cu.
   */
  function refreshQueue() {
    const { labels, quantity, links, repliesPerLink } = state.settings;
    const sig = [QUEUE_FORMAT, labels, quantity, links, repliesPerLink].join('\u0000');
    if (sig === state.queueSig) return false;
    state.queueSig = sig;
    const tweetSig = [QUEUE_FORMAT, labels, quantity].join('\u0000');
    if (tweetSig !== state.queueTweetSig) {
      state.queueTweetSig = tweetSig;
      state.queueId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    state.queue = buildQueue(state.queueId);
    state.cursor = 0;
    return true;
  }

  function syncFromUI() {
    state.settings.labels = $('xap-queue').value;
    // 0 tweet moi la hop le: chi chay reply + retweet theo list tweet.
    state.settings.quantity = Math.max(0, parseInt($('xap-content-quantity').value, 10) || 0);
    state.settings.links = $('xap-links').value;
    const per = parseInt($('xap-reply-per').value, 10);
    state.settings.repliesPerLink = Number.isNaN(per) ? 1 : Math.min(20, Math.max(0, per));
    refreshQueue();
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
    state.settings.hourFrom = Math.min(23, num('xap-hfrom', 0));
    state.settings.hourTo = Math.min(24, num('xap-hto', 24));
    state.settings.naturalPace = $('xap-natural').checked;
    state.settings.slowMode = $('xap-slow').checked;
    save(state);
    render();
  }

  /** Do dai label va cho con lai cho content; bao truoc bao nhieu cau se bi cat. */
  function renderLabelInfo() {
    const info = $('xap-label-info');
    if (!info) return;
    const { labels } = readLabels(state.settings.labels);
    if (!labels) { info.innerHTML = ''; return; }
    const room = contentRoom(labels);
    const head = `Label ${tweetLength(labels)} ky tu · con ${Math.max(0, room)}/${MAX_TWEET} cho content`;
    if (room < MIN_ROOM) {
      info.innerHTML = `${head} · <span class="xap-err">dai qua, rut gon label lai</span>`;
      return;
    }
    const cut = contentLens.filter((l) => l > room).length;
    info.innerHTML = cut
      ? `${head} · <span class="xap-warn">${cut}/${contentData.length} cau dai hon se tu cat bot cho vua</span>`
      : `${head} · cau nao cung vua`;
  }

  /** Dem so tweet doc duoc trong list va tien do reply/retweet. */
  function renderLinksInfo() {
    const info = $('xap-links-info');
    if (!info) return;
    const { ids, bad } = parseLinks(state.settings.links);
    const per = state.settings.repliesPerLink;
    const listed = state.queue.filter((i) => i.fromList);
    const done = listed.filter((i) => state.posted.includes(fingerprint(i))).length;

    const parts = [];
    if (ids.length) {
      parts.push(`${ids.length} tweet → ${ids.length * per} reply + ${ids.length} retweet`);
      parts.push(`xong ${done}/${listed.length}`);
    }
    if (bad) parts.push(`<span class="xap-warn">${bad} dong khong phai tweet id/link, bo qua</span>`);
    if (ids.length && !readLabels(state.settings.labels).labels) {
      parts.push('<span class="xap-warn">chua co label: reply chi co content</span>');
    }
    info.innerHTML = parts.join(' · ');
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
         Da dang <b>${done}/${state.queue.length}</b> · hom nay <b>${countToday()}</b> bai` +
        ((state.waitVisible || []).length
          ? `<br><span class="xap-warn">⏸ ${state.waitVisible.join('/')} dang doi tab X hien lai</span>` : '')
      : !state.queue.length
        ? `<b class="xap-dim2">○ Hang doi trong</b> — bam Bat dau de dung tu o nhap · hom nay <b>${countToday()}</b> bai`
        : `<b class="xap-dim2">○ Dang dung</b> — da dang <b>${done}/${state.queue.length}</b> · hom nay <b>${countToday()}</b> bai`;

    // Ghi lai dung text nguoi dung da go (khong phai gia tri suy ra tu hang doi,
    // lam vay se nuot xuong dong va ha chu thuong cua label goc).
    setVal('xap-queue', state.settings.labels);
    setVal('xap-content-quantity', state.settings.quantity);
    setVal('xap-links', state.settings.links);
    setVal('xap-reply-per', state.settings.repliesPerLink);
    renderLabelInfo();
    renderLinksInfo();
    setVal('xap-gapmin', state.settings.gapMin);
    setVal('xap-gapmax', state.settings.gapMax);
    setVal('xap-max', state.settings.maxPerDay);
    setVal('xap-loop', state.settings.loop);
    setVal('xap-hfrom', state.settings.hourFrom);
    setVal('xap-hto', state.settings.hourTo);
    setVal('xap-natural', state.settings.naturalPace);
    setVal('xap-slow', state.settings.slowMode);
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
        contentLens = contentData.map(tweetLength);
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
    // Hang doi luu tu ban cu (boc san content, kieu cu) thi dung lai ngay, khong
    // doi nguoi dung sua o nhap moi dung.
    const hadQueue = state.queue.length > 0;
    if (refreshQueue()) {
      save(state);
      if (hadQueue) addLog('Ban moi: da dung lai hang doi, content se boc ngau nhien luc dang tung bai.', 'warn');
    }
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
