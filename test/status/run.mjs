// Chay code reply / retweet that cua bot tren mot trang bai viet gia lap
// (status.html): bot phai bam dung bai can lam, khong phai bai cha hay reply.
//
//   node test/status/run.mjs
import { chromium } from 'playwright';
import { grabFn, grabConst } from '../composer/extract.mjs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const PAGE = url.pathToFileURL(path.join(here, 'status.html')).href;

const bundle = `
window.__bot = (function () {
  'use strict';
  const state = { settings: { slowMode: false } };
  window.__logs = [];
  function addLog(msg, kind) { window.__logs.push([kind || 'info', msg]); }

${[
  grabConst('sleep'), grabFn('until'), grabConst('isEmpty'), grabConst('paceFactor'),
  grabConst('pause'), grabFn('waitFor'), grabFn('selectAllIn'), grabFn('pasteInto'),
  grabFn('typeInto'), grabFn('clickWhenEnabled'), grabFn('buttonByText'),
  grabFn('answerSaveSheet'), grabFn('discardDraft'), grabFn('closeComposer'),
  grabFn('doPostTweet'), grabFn('findArticle'), grabFn('waitArticle'),
  grabConst('onStatusPage'), grabFn('doRetweet'), grabFn('doReply'), grabFn('parseLinks'),
].join('\n\n')}

  return { findArticle, doRetweet, doReply, parseLinks };
})();
`;

const REPLY = 'Lena and Miu make every scene feel like home. 💗\n\nLENAMIU AT FLEX\n#LenaMiu #ลีน่าหมิว';

let pass = 0, fail = 0;
const check = (name, ok, got) => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got: ${JSON.stringify(got)}`); }
};

const browser = await chromium.launch();

async function fresh(query = '') {
  const page = await browser.newPage();
  await page.goto(PAGE + query);
  await page.waitForFunction(() => window.__ready === true);
  await page.addScriptTag({ content: bundle });
  return page;
}
const call = (page, fn, ...args) => page.evaluate(async ([f, a]) => {
  try { return { ok: true, value: await window.__bot[f](...a) }; }
  catch (e) { return { ok: false, err: e.message }; }
}, [fn, args]);
const read = (page, expr) => page.evaluate(expr);

// --- 1. tim dung bai --------------------------------------------------------
console.log('\n1. Tim dung khung cua bai can lam');
{
  const page = await fresh();
  const id = (q) => page.evaluate((x) => window.__bot.findArticle(x)?.dataset.id ?? null, q);
  check('bai chinh 222, khong phai bai cha 111 nam tren', await id('222') === '222', await id('222'));
  check('reply 333 nam duoi van tim dung', await id('333') === '333', await id('333'));
  check('id la tien to cua id khac thi khong nham (22)', await id('22') === null, await id('22'));
  check('bai khong co tren trang thi null', await id('999') === null, await id('999'));
  await page.close();
}

// --- 2. retweet -------------------------------------------------------------
console.log('\n2. Retweet');
{
  const page = await fresh();
  const r = await call(page, 'doRetweet', '222');
  check('khong nem loi, bao da retweet', r.ok && r.value === true, r);
  const rts = await read(page, () => window.__retweeted);
  check('retweet dung bai 222, khong dong bai cha hay reply', JSON.stringify(rts) === '["222"]', rts);

  const again = await call(page, 'doRetweet', '444');
  check('bai da retweet tu truoc: tra false, khong nem loi', again.ok && again.value === false, again);
  const after = await read(page, () => window.__retweeted);
  check('va khong retweet nham bai nao khac', JSON.stringify(after) === '["222"]', after);
  await page.close();
}

// --- 3. reply ---------------------------------------------------------------
console.log('\n3. Reply');
{
  const page = await fresh();
  const r = await call(page, 'doReply', '222', REPLY);
  check('khong nem loi', r.ok, r.err);
  const replies = await read(page, () => window.__replies);
  check('gui dung mot reply', replies.length === 1, replies);
  check('reply vao dung bai 222', replies[0]?.id === '222', replies);
  check('noi dung dung tung ky tu, giu dong trong', replies[0]?.text === REPLY, replies[0]?.text);
  check('modal da dong', await read(page, () => !document.querySelector('[role="dialog"]')), null);

  const r2 = await call(page, 'doReply', '333', REPLY);
  const replies2 = await read(page, () => window.__replies.map((x) => x.id));
  check('reply tiep bai khac tren cung trang', r2.ok && JSON.stringify(replies2) === '["222","333"]', [r2, replies2]);

  const r3 = await call(page, 'doReply', '555', REPLY);
  check('bai khoa reply: nem loi ro rang', !r3.ok && /khong cho reply/.test(r3.err), r3);
  check('va khong mo modal nao', await read(page, () => !document.querySelector('[role="dialog"]')), null);
  await page.close();
}

// --- 4. reply hong giua chung ------------------------------------------------
console.log('\n4. Nut gui khong bat len (X chan) — phai vut ban nhap, khong luu');
{
  const page = await fresh('?locked=1');
  const r = await call(page, 'doReply', '222', REPLY);
  check('nem loi', !r.ok, r);
  check('khong gui gi', (await read(page, () => window.__replies.length)) === 0, null);
  const drafts = await read(page, () => window.__drafts);
  check('khong luu thanh draft', drafts.length === 0, drafts);
  check('modal da dong', await read(page, () => !document.querySelector('[role="dialog"]')), null);
  await page.close();
}

// --- 5. doc danh sach link ---------------------------------------------------
console.log('\n5. Doc o danh sach link');
{
  const page = await fresh();
  const raw = [
    'https://x.com/LenaMiu_CH3/status/2103095712292696459',
    '  https://twitter.com/miunatshaa/status/2103000000000000001?s=20  ',
    '',
    'https://x.com/LenaMiu_CH3/status/2103095712292696459/photo/1',
    '2103000000000000002',
    'https://x.com/i/web/status/2103000000000000003',
    'xem cai nay di',
    'https://x.com/LenaMiu_CH3',
  ].join('\n');
  const r = await call(page, 'parseLinks', raw);
  const want = ['2103095712292696459', '2103000000000000001', '2103000000000000002', '2103000000000000003'];
  check('lay dung id, dung thu tu, bo trung', JSON.stringify(r.value?.ids) === JSON.stringify(want), r.value);
  check('dem 2 dong khong phai link bai', r.value?.bad === 2, r.value);
  await page.close();
}

await browser.close();
console.log(`\n==== ${pass} dat / ${fail} hong ====`);
process.exit(fail ? 1 : 0);
