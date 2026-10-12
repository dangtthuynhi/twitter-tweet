// Kiem tra phan dung hang doi va boc content cua bot, chay bang Node thuan
// (khong can trinh duyet). Ham lay nguyen van tu userscript.
//
//   node test/queue/run.mjs
import { grabFn, grabConst } from '../composer/extract.mjs';

let pass = 0, fail = 0;
const check = (name, ok, got) => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got: ${JSON.stringify(got)}`); }
};

/** Nap cac ham can test vao mot pham vi rieng, voi state/content gia. */
function load({ contents, postedContent = [], settings = {} }) {
  const env = {
    state: { postedContent, posted: [], queue: [], queueSig: '', settings: {
      labels: '', quantity: 0, links: '', repliesPerLink: 1, ...settings } },
    logs: [],
  };
  const code = [
    grabConst('MAX_TWEET'), grabConst('QUEUE_FORMAT'), grabConst('EMOJI_RE'),
    grabFn('tweetLength'), grabConst('fingerprint'), grabConst('MIN_ROOM'),
    grabConst('contentRoom'), grabFn('usableContent'), grabConst('NAME_RE'),
    grabConst('EMOJI_TAIL_RE'), grabFn('cutWords'), grabFn('fitContent'),
    grabFn('assignContent'), grabFn('readLabels'), grabFn('parseLinks'),
    grabFn('buildQueue'), grabConst('pendingCount'), grabFn('clearQueue'), grabFn('refreshQueue'),
    'const contentLens = contentData.map(tweetLength);',
    'return { tweetLength, fingerprint, usableContent, fitContent, assignContent, buildQueue,',
    '  pendingCount, clearQueue, refreshQueue };',
  ].join('\n');
  // contentLens khai bao sau cac ham nhung truoc khi goi, nen van dung duoc
  const fns = new Function('state', 'contentData', 'addLog', code)(
    env.state, contents, (m, k) => env.logs.push([k, m]));
  return { ...env, ...fns };
}

const LABELS = 'LENAMIU AT FLEX\n#Flex1045xPLSLoveรักได้ไหม\n#LenaMiu #ลีน่าหมิว';
const LINK = 'https://x.com/LenaMiu_CH3/status/2103095712292696459';

// --- 1. dem do dai nhu X ----------------------------------------------------
console.log('\n1. Dem do dai theo cach X dem');
{
  const { tweetLength } = load({ contents: [] });
  check('chu Latin 1 ky tu', tweetLength('LenaMiu') === 7, tweetLength('LenaMiu'));
  check('emoji tinh 2', tweetLength('💗') === 2 && tweetLength('✨') === 2, [tweetLength('💗'), tweetLength('✨')]);
  check('co (🇹🇭) tinh 2', tweetLength('🇹🇭') === 2, tweetLength('🇹🇭'));
  check('emoji ghep (🫶🏻) van tinh 2', tweetLength('🫶🏻') === 2, tweetLength('🫶🏻'));
  check('chu Thai tinh theo code point', tweetLength('ลีน่า') === 5, tweetLength('ลีน่า'));
  check('chu Viet co dau dung san tinh 2', tweetLength('Việt') === 5, tweetLength('Việt'));
  check('dau nhay cong ’ tinh 1', tweetLength('it’s') === 4, tweetLength('it’s'));
  check('label mau dai 62', tweetLength(LABELS) === 62, tweetLength(LABELS));
}

// --- 2. hang doi chi giu cho, chua boc content --------------------------------
console.log('\n2. Dung hang doi');
{
  const t = load({ contents: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    settings: { labels: LABELS, quantity: 3, links: `${LINK}\nrac`, repliesPerLink: 2 } });
  t.refreshQueue();
  const q = t.state.queue;
  check('thu tu: reply, reply, retweet, roi 3 tweet',
    q.map((i) => i.type).join(',') === 'reply,reply,retweet,tweet,tweet,tweet', q.map((i) => i.type));
  check('chua boc content nao', q.every((i) => i.text == null && i.contentIndex == null), q);
  check('tweet mang qid + so thu tu', q.filter((i) => i.type === 'tweet').every((i, k) => i.qid && i.slot === k), q);
  const fps = q.map(t.fingerprint);
  check('dau van tay khong trung nhau', new Set(fps).size === fps.length, fps);

  const before = t.state.queueId;
  t.state.settings.quantity = 4;
  t.refreshQueue();
  check('doi so luong thi dung lai, qid moi', t.state.queueId !== before && t.state.queue.length === 7, t.state.queueId);
  check('khong doi gi thi khong dung lai', t.refreshQueue() === false, null);

  // Dan them tweet id vao list giua luc dang chay: tweet moi giu nguyen dot
  const qid = t.state.queueId;
  const tweetFps = t.state.queue.filter((i) => i.type === 'tweet').map(t.fingerprint).join();
  t.state.settings.links += '\n2103000000000000001';
  t.refreshQueue();
  check('them tweet vao list: dung lai list nhung giu dot tweet moi (qid cu)',
    t.state.queueId === qid && t.state.queue.length === 10 &&
      t.state.queue.filter((i) => i.type === 'tweet').map(t.fingerprint).join() === tweetFps, t.state.queueId);
  t.state.settings.labels += '\n#Moi';
  t.refreshQueue();
  check('doi label thi sang dot tweet moi (qid moi)', t.state.queueId !== qid, t.state.queueId);
}

// --- 3. boc content luc dang ------------------------------------------------
console.log('\n3. Boc content ngau nhien luc dang');
{
  const contents = Array.from({ length: 40 }, (_, i) => `content so ${i} ${'x'.repeat(i)}`);
  const t = load({ contents });
  const picks = new Set();
  for (let i = 0; i < 60; i++) {
    const job = { type: 'tweet', labels: '', hashtag: '' };
    t.assignContent(job);
    picks.add(job.contentIndex);
  }
  check('60 lan boc ra nhieu content khac nhau (ngau nhien)', picks.size >= 20, picks.size);

  const job = { type: 'tweet', labels: LABELS, hashtag: 'k' };
  t.assignContent(job);
  check('bai = content + dong trong + label', job.text === `${job.content}\n\n${LABELS}`, job.text);
  const keep = job.text;
  t.assignContent(job);
  check('da boc roi (sau tai lai trang) thi giu nguyen', job.text === keep, job.text);
}

// --- 4. loc va cat bot content -----------------------------------------------
console.log('\n4. Loc content da dang, cat bot content qua dai');
{
  const short = 'Lena and Miu are the best. 💗';
  const long = 'Lena and Miu. ' + 'So good. '.repeat(30);
  const t = load({ contents: [short, long, 'da dang roi'],
    postedContent: [{ hashtag: 'lenamiu at flex', contentIndex: 2 }] });
  const usable = t.usableContent(LABELS, 'lenamiu at flex');
  check('bo content da dang kem nhom label nay', !usable.includes(2), usable);
  check('content dai qua KHONG bi bo (se cat bot)', usable.includes(1), usable);
  check('label khac thi content da dang van dung duoc', t.usableContent('', 'khac').includes(2), null);
  check('content vua thi giu nguyen', t.fitContent(short, 200) === short, t.fitContent(short, 200));

  const S1 = 'Okay, I need to talk about this.';
  const S2 = 'Lena and Miu make every scene feel like home.';
  const EN = `${S1} ${S2} Their chemistry is unreal. Forever proud of these two. 💗`;
  const r100 = t.fitContent(EN, 100);
  check('bo cau tu cuoi len, giu emoji cuoi', r100 === `${S1} ${S2} 💗`, r100);
  const r50 = t.fitContent(EN, 50);
  check('chat hon nua: bo emoji, bo cau mo dau, giu cau goi ten', r50 === S2, r50);
  const r30 = t.fitContent(EN, 30);
  check('mot cau van dai: cat o ranh gioi tu, them …',
    r30.endsWith('…') && t.tweetLength(r30) <= 30 && S2.startsWith(r30.slice(0, -1)) &&
      / /.test(S2[r30.length - 1] ?? ' '), r30);

  const TH = 'ขอพูดหน่อยนะ เคมีของลีน่ากับหมิวเป็นธรรมชาติมาก ดูแล้วอินตามทุกฉากเลย รักมากๆ เลย 🌸';
  const th = t.fitContent(TH, 60);
  check('tieng Thai: bo tung y (cach nhau dau cach), van con ten',
    t.tweetLength(th) <= 60 && th.includes('ลีน่า') && !th.endsWith('…'), th);

  const THLONG = 'ลีน่าหมิวน่ารักมากจริงๆดูแล้วมีความสุขทุกครั้งที่ได้เห็นสองคนนี้อยู่ด้วยกัน';
  const thc = t.fitContent(THLONG, 25);
  const cutAt = thc.length - 1;
  check('tieng Thai khong dau cach: cat dung ranh gioi, khong xe dau thanh/nguyen am',
    thc.endsWith('…') && t.tweetLength(thc) <= 25 && THLONG.startsWith(thc.slice(0, -1)) &&
      !/[ัิ-ฺ็-๎]/.test(THLONG[cutAt]), thc);

  for (let i = 0; i < 20; i++) {
    const job = { type: 'reply', labels: LABELS, hashtag: 'lenamiu at flex' };
    t.assignContent(job);
    if (t.tweetLength(job.text) > 280) { check('moi bai ghep xong <= 280', false, job.text); break; }
  }
  check('moi bai ghep xong <= 280', true, null);

  const hugeLabel = '#LenaMiu '.repeat(28);   // ~250 ky tu, con duoi 30 cho content
  const job = { type: 'tweet', labels: hugeLabel.trim(), hashtag: 'x' };
  check('label dai qua (con < 30 cho content) thi bao false', t.assignContent(job) === false && job.text == null, job);
}

// --- 5. list tweet id: reply kem label o tren ---------------------------------
console.log('\n5. List tweet id: reply kem label o tren, roi retweet');
{
  const IDS = '2103095712292696459\n2103000000000000001\nhttps://x.com/LenaMiu_CH3/status/2103000000000000002?s=20';
  const t = load({ contents: ['Lena and Miu are the best. 💗'],
    settings: { labels: `\n${LABELS}\n`, quantity: 0, links: IDS, repliesPerLink: 1 } });
  t.refreshQueue();
  const q = t.state.queue;
  check('3 tweet id -> reply, retweet cho tung tweet, dung thu tu',
    q.map((i) => `${i.type}:${i.id.slice(-1)}`).join(',') === 'reply:9,retweet:9,reply:1,retweet:1,reply:2,retweet:2',
    q.map((i) => `${i.type}:${i.id}`));
  check('reply mang dung label o tren (da cat dong trong dau/cuoi)', q[0].labels === LABELS, q[0].labels);

  const reply = { ...q[0] };
  t.assignContent(reply);
  check('reply = content + dong trong + label o tren', reply.text === `Lena and Miu are the best. 💗\n\n${LABELS}`, reply.text);

  const { default: data } = await import('../../content-lenamiu.json', { with: { type: 'json' } });
  const LONG = `${LABELS}\n#PlsLoveรักได้ไหมEP4 #LenaMiuxPlsLove #ลีน่าหมิวรักได้ไหม`;
  const big = load({ contents: data.contents });
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const j = { type: 'reply', labels: LONG, hashtag: 'z' };
    big.assignContent(j);
    if (big.tweetLength(j.text) > 280 || !j.text.endsWith(`\n\n${LONG}`)) bad++;
  }
  check('300 reply that voi label dai: <= 280 va giu nguyen label (content tu cat bot)', bad === 0, bad);
}

// --- 6. xoa hang doi --------------------------------------------------------
console.log('\n6. Nut Xoa hang doi');
{
  const t = load({ contents: ['a', 'b', 'c', 'd', 'e'],
    settings: { labels: LABELS, quantity: 2, links: LINK, repliesPerLink: 1 } });
  t.refreshQueue();
  const s = t.state;
  // Da reply xong link, dang chay, dang do mot viec qua lan tai trang
  s.posted.push(t.fingerprint(s.queue[0]));
  s.postedContent.push({ hashtag: 'k', contentIndex: 0 });
  Object.assign(s, { running: true, pending: { type: 'retweet' }, nextAt: 123, cursor: 1 });
  check('dem dung viec chua lam (4 viec, xong 1)', t.pendingCount() === 3, t.pendingCount());

  t.clearQueue();
  check('hang doi trong, bot dung, bo viec dang do',
    s.queue.length === 0 && s.running === false && s.pending === null && s.cursor === 0, s);
  check('lich su giu nguyen', s.posted.length === 1 && s.postedContent.length === 1, [s.posted, s.postedContent]);
  check('tai lai trang (o nhap khong doi) thi van trong', t.refreshQueue() === false && s.queue.length === 0, s.queue);

  // Bam Bat dau: dung moi tu o nhap
  const qidBefore = s.queueId;
  s.queueSig = '';
  t.refreshQueue();
  check('bam Bat dau thi dung lai du 4 viec', s.queue.length === 4, s.queue.map((i) => i.type));
  check('sau khi xoa hang doi, tweet moi la mot dot moi', s.queueId !== qidBefore, s.queueId);
  check('link da reply roi van tinh la xong, khong reply lai', t.pendingCount() === 3, t.pendingCount());
}

// --- 7. tab X bi an (chay nen) ------------------------------------------------
console.log('\n7. Tab X bi an (chay nen)');
{
  const env = (hidden) => {
    const state = { queue: [], posted: [], cursor: 0, retryWhenVisible: false, settings: { loop: true } };
    const logs = [];
    const code = [
      grabConst('sleep'), grabFn('clickWhenEnabled'), grabConst('fingerprint'),
      grabFn('pickNext'), grabFn('holdUntilVisible'),
      'return { clickWhenEnabled, fingerprint, pickNext, holdUntilVisible };',
    ].join('\n');
    const fns = new Function('state', 'document', 'addLog', 'save', code)(
      state, { hidden }, (m, k) => logs.push([k, m]), () => {});
    return { state, logs, ...fns };
  };

  // Hen gio bi Chrome don: da qua han ngay tu lan nhin dau tien (timeout 0)
  const t = env(true);
  let clicked = 0;
  const ready = { getAttribute: () => null, disabled: false, click: () => clicked++ };
  await t.clickWhenEnabled(ready, 0);
  check('qua han roi van nhin nut mot lan, nut bat thi bam', clicked === 1, clicked);
  const off = { getAttribute: () => 'true', disabled: false, click: () => clicked++ };
  let threw = false;
  try { await t.clickWhenEnabled(off, 0); } catch { threw = true; }
  check('nut van tat thi bao loi, khong bam', threw && clicked === 1, { threw, clicked });

  const reply = { type: 'reply', id: '2103095712292696459', n: 0 };
  check('reply hong luc tab an: giu lai', t.holdUntilVisible(reply) === true && t.state.retryWhenVisible, t.state);
  check('tweet moi hong luc tab an: khong giu (loi thuong)', t.holdUntilVisible({ type: 'tweet' }) === false, null);
  const shown = env(false);
  check('tab dang hien: reply hong la loi thuong', shown.holdUntilVisible(reply) === false && !shown.state.retryWhenVisible, null);

  // Hang doi: reply, retweet theo list roi 2 tweet moi
  const s = t.state;
  s.queue = [reply, { type: 'retweet', id: reply.id },
    { type: 'tweet', qid: 'q', slot: 0 }, { type: 'tweet', qid: 'q', slot: 1 }];
  check('dang doi tab: chi lay tweet moi', t.pickNext({ onlyTweets: true })?.type === 'tweet', t.pickNext({ onlyTweets: true }));
  s.posted.push('tw:q:0', 'tw:q:1');
  s.cursor = 4;
  check('dang doi tab ma chi con reply/retweet: tra null, KHONG xoa lich su du bat lap lai',
    t.pickNext({ onlyTweets: true }) === null && s.posted.length === 2, s.posted);
  const next = t.pickNext();
  check('tab hien lai: lam reply bi giu truoc, du cursor da di qua', next?.type === 'reply' && next.index === 0, next);
}

// --- 8. kho content that ----------------------------------------------------
console.log('\n8. Kho content-lenamiu.json that');
{
  const { default: data } = await import('../../content-lenamiu.json', { with: { type: 'json' } });
  const t = load({ contents: data.contents });
  const lens = data.contents.map(t.tweetLength);
  check('moi content <= 215 ky tu', Math.max(...lens) <= 215, Math.max(...lens));
  check('voi label mau, ca kho deu dung duoc', t.usableContent(LABELS, 'k').length === data.contents.length,
    t.usableContent(LABELS, 'k').length);
  check('voi label mau, khong cau nao phai cat', lens.every((l) => l <= 280 - 62 - 2), null);

  // Label dai 120 ky tu: con 158 cho content, phan lon cau phai cat bot
  const LONG = `${LABELS}\n#PlsLoveรักได้ไหมEP4 #LenaMiuxPlsLove #ลีน่าหมิวรักได้ไหม`;
  const room = 280 - t.tweetLength(LONG) - 2;
  let over = 0, noName = 0, midCut = 0, trimmed = 0;
  data.contents.forEach((c) => {
    const f = t.fitContent(c, room);
    if (f !== c) trimmed++;
    if (t.tweetLength(`${f}\n\n${LONG}`) > 280) over++;
    if (!/Lena|Miu|ลีน่า|หมิว/.test(f)) noName++;
    if (f.endsWith('…')) midCut++;
  });
  console.log(`       (label ${t.tweetLength(LONG)} ky tu: cat bot ${trimmed}/${data.contents.length} cau, cat giua cau ${midCut})`);
  check('label dai: ca kho ghep xong deu <= 280', over === 0, over);
  check('label dai: cau nao cung con ten Lena/Miu', noName === 0, noName);
  check('label dai: khong cau nao phai cat giua chung', midCut === 0, midCut);
}

console.log(`\n==== ${pass} dat / ${fail} hong ====`);
process.exit(fail ? 1 : 0);
