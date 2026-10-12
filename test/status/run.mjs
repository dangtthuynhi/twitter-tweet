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
  grabFn('composerScope'), grabConst('REPLY_HINT_RE'), grabFn('replyViaCompose'),
  grabFn('dismissOverlays'), grabConst('REPOST_RE'), grabConst('UNDO_REPOST_RE'),
  grabConst('CANCEL_RE'), grabConst('OVERLAY_SELECTOR'), grabFn('describeScreen'),
  grabFn('retweetViaIntent'),
].join('\n\n')}

  return { findArticle, doRetweet, doReply, parseLinks, replyViaCompose, retweetViaIntent };
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

// --- 5. reply qua o soan bai (tab an) ----------------------------------------
console.log('\n5. Reply qua o soan bai — duong dung khi tab X an');
{
  const page = await fresh();
  await page.evaluate(() => window.__openCompose({ replyTo: '222', placeholder: 'Post your reply' }));
  const r = await call(page, 'replyViaCompose', '222', REPLY);
  const replies = await read(page, () => window.__replies);
  check('o soan kem bai 222: gui dung mot reply, dung noi dung', r.ok && replies.length === 1 &&
    replies[0].id === '222' && replies[0].text === REPLY, [r, replies]);
  check('modal da dong', await read(page, () => !document.querySelector('[role="dialog"]')), null);

  await page.evaluate(() => window.__openCompose({ placeholder: 'Đăng câu trả lời của bạn' }));
  const r2 = await call(page, 'replyViaCompose', '333', REPLY);
  check('chi co chu goi y tieng Viet "tra loi": van nhan la dang reply', r2.ok, r2);

  await page.evaluate(() => window.__openCompose({ placeholder: "What's happening?" }));
  const before = await read(page, () => window.__replies.length);
  const r3 = await call(page, 'replyViaCompose', '444', REPLY);
  check('o soan bai MOI (khong dau hieu tra loi): bao loi, khong dang nham thanh bai moi',
    !r3.ok && /khong hien la dang tra loi/.test(r3.err) &&
      (await read(page, () => window.__replies.length)) === before, r3);
  await page.close();
}

// --- 6. retweet qua hop thoai (tab an) ----------------------------------------
console.log('\n6. Retweet qua hop thoai retweet — duong dung khi tab X an');
{
  const page = await fresh();
  const run = async (id, kind) => {
    await page.evaluate(([i, k]) => window.__openRetweetSheet(i, k), [id, kind]);
    return call(page, 'retweetViaIntent', id);
  };
  const state = () => read(page, () => ({
    rt: window.__retweeted.slice(), undone: window.__undone.slice(),
    open: !!document.querySelector('[role="dialog"], [role="menu"]'),
  }));

  let r = await run('101', 'sheet-en');
  let s = await state();
  check('hop thoai "Repost": bam, bao da retweet', r.ok && r.value === true && s.rt.includes('101') && !s.open, [r, s]);

  r = await run('102', 'sheet-th');
  s = await state();
  check('tieng Thai "รีโพสต์ / ยกเลิก": van retweet (khong nham "ยกเลิก" la go retweet)',
    r.ok && r.value === true && s.rt.includes('102'), [r, s]);

  r = await run('103', 'menu-testid');
  s = await state();
  check('menu co testid retweetConfirm: bam dung muc Repost', r.ok && r.value === true && s.rt.includes('103'), [r, s]);

  r = await run('104', 'undo-en');
  s = await state();
  check('hop thoai "Undo repost": KHONG bam, bam Huy, bao da retweet tu truoc',
    r.ok && r.value === false && !s.undone.length && !s.rt.includes('104') && !s.open, [r, s]);

  r = await run('105', 'menu-undo');
  s = await state();
  check('menu unretweetConfirm: KHONG go retweet, dong menu (Esc)', r.ok && r.value === false && !s.undone.length && !s.open, [r, s]);

  r = await run('107', 'confirm-sheet');
  s = await state();
  check('hop thoai xac nhan that cua X (alertdialog, confirmationSheetDialog): bam Repost',
    r.ok && r.value === true && s.rt.includes('107') && !s.open, [r, s]);

  r = await run('108', 'confirm-undo');
  s = await state();
  check('hop thoai "Undo repost?" ma nut chi ghi "Undo": KHONG bam, bam Cancel',
    r.ok && r.value === false && !s.undone.length && !s.rt.includes('108') && !s.open, [r, s]);

  r = await run('106', 'unknown');
  s = await state();
  check('khong nhan ra nut nao: bao loi kem mo ta man hinh, khong bam gi',
    !r.ok && /Khong thay hop thoai retweet/.test(r.err) && /dang o .*nut: OK/.test(r.err) &&
      !s.rt.includes('106'), [r, s]);
  await page.close();
}

// --- 7. doc danh sach link ---------------------------------------------------
console.log('\n7. Doc o danh sach link');
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
