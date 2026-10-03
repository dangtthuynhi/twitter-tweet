import { chromium } from 'playwright';
import { bundle } from './extract.mjs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const PAGE = url.pathToFileURL(path.join(here, 'composer.html')).href;

const CONTENT = 'LenaMiu is the definition of extraordinary.';
const LABELS = 'LENAMIU PLS LOVE EP 4\n#PlsLove';
const TWEET = `${CONTENT}\n\n${LABELS}`;

let pass = 0, fail = 0;
const check = (name, ok, got) => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got: ${JSON.stringify(got)}`); }
};

const browser = await chromium.launch();

async function fresh() {
  const page = await browser.newPage();
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__ready === true);
  await page.addScriptTag({ content: bundle });
  return page;
}
// Doc dung chuoi Draft.js se dem di dang, khong phai innerText cua DOM.
const box = (page) => page.evaluate(() => window.__text ?? '');
const alive = (page) => page.evaluate(() =>
  !!document.querySelector('.public-DraftEditor-content'));

const type = (page, text) => page.evaluate(async (t) => {
  const el = document.querySelector('.public-DraftEditor-content');
  try { await window.__bot.typeInto(el, t); return { ok: true }; }
  catch (e) { return { ok: false, err: e.message }; }
}, text);

// --- 1. go vao o rong -------------------------------------------------------
console.log('\n1. Go bai vao o soan thao rong');
{
  const page = await fresh();
  const r = await type(page, TWEET);
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('o soan thao con song', await alive(page), null);
  check('noi dung dung tung ky tu', got === TWEET, got);
  check('content khong bi lap', (got.match(/definition of extraordinary/g) || []).length === 1, got);
  check('giu dong trong giua content va label', got.includes(`${CONTENT}\n\n`), got);
  await page.close();
}

// --- 2. o dang co chu cu ----------------------------------------------------
console.log('\n2. O soan thao dang con chu cu');
{
  const page = await fresh();
  await page.evaluate(() => {
    const el = document.querySelector('.public-DraftEditor-content');
    window.__bot.selectAllIn(el);
    window.__bot.pasteInto(el, 'RAC CU CON SOT LAI');
  });
  await page.waitForTimeout(400);
  const before = await box(page);
  const r = await type(page, TWEET);
  const got = await box(page);
  check('co chu cu that truoc khi go', before.includes('RAC CU'), before);
  check('khong nem loi', r.ok, r.err);
  check('chu cu da bi xoa het', !got.includes('RAC CU'), got);
  check('o soan thao con song', await alive(page), null);
  check('noi dung dung tung ky tu', got === TWEET, got);
  await page.close();
}

// --- 3. go hai lan lien tiep ------------------------------------------------
console.log('\n3. Go hai lan lien tiep vao cung mot o');
{
  const page = await fresh();
  await type(page, TWEET);
  const r = await type(page, TWEET);
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('khong nhan ban', (got.match(/definition of extraordinary/g) || []).length === 1, got);
  check('o soan thao con song', await alive(page), null);
  check('noi dung dung tung ky tu', got === TWEET, got);
  await page.close();
}

// --- 4. clearComposer -------------------------------------------------------
console.log('\n4. clearComposer tren o day chu');
{
  const page = await fresh();
  await type(page, TWEET);
  const r = await page.evaluate(async () => {
    const el = document.querySelector('.public-DraftEditor-content');
    try { await window.__bot.clearComposer(el); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  });
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('o da sach', got.trim() === '', got);
  check('o soan thao con song (khong phai sach vi bi vo)', await alive(page), null);
  await page.close();
}

// --- 5. duong dan co that su duoc dung khong --------------------------------
console.log('\n5. Duong dan (ClipboardEvent) co an khong');
{
  const page = await fresh();
  const used = await page.evaluate(() => {
    const el = document.querySelector('.public-DraftEditor-content');
    window.__bot.selectAllIn(el);
    return window.__bot.pasteInto(el, 'thu dan mot cau');
  });
  await page.waitForTimeout(500);
  const got = await box(page);
  check('DraftJS nhan xu ly su kien paste', used, used);
  check('chu vao dung mot ban', got === 'thu dan mot cau', got);
  await page.close();
}

// --- 6. emoji + hashtag -----------------------------------------------------
console.log('\n6. Bai co emoji va hashtag tieng Thai');
{
  const page = await fresh();
  const hard = 'LenaMiu is the definition of extraordinary. \u{1F496}\n\nLENAMIU PLS LOVE EP 4\n#PlsLoveรักได้ไหมEP4';
  const r = await type(page, hard);
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('o soan thao con song', await alive(page), null);
  check('noi dung dung tung ky tu', got === hard, got);
  await page.close();
}

// --- 7. chu cu la CHINH bai sap dang (ca hong that trong log) ---------------
console.log('\n7. Chu cu trung voi bai sap dang');
{
  const page = await fresh();
  await page.evaluate((t) => {
    const el = document.querySelector('.public-DraftEditor-content');
    window.__bot.selectAllIn(el); window.__bot.pasteInto(el, t);
  }, CONTENT);
  await page.waitForTimeout(400);
  const r = await type(page, TWEET);
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('content dung mot ban', (got.match(/definition of extraordinary/g) || []).length === 1, got);
  check('noi dung dung tung ky tu', got === TWEET, got);
  await page.close();
}

// --- 8. o soan thao bi go khoi trang giua chung -----------------------------
console.log('\n8. O soan thao bien mat giua chung');
{
  const page = await fresh();
  const r = await page.evaluate(async (t) => {
    const el = document.querySelector('.public-DraftEditor-content');
    el.remove();                       // y nhu khi X dung lai modal
    try { await window.__bot.typeInto(el, t); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  }, TWEET);
  check('nem loi ro rang chu khong vo', !r.ok && /bien mat|that bai/.test(r.err || ''), r.err);
  await page.close();
}

// --- 9. che do "may cham" ---------------------------------------------------
console.log('\n9. Che do may cham');
{
  const page = await fresh();
  await page.evaluate(() => { window.__bot.state.settings.slowMode = true; });
  const t0 = Date.now();
  const r = await type(page, TWEET);
  const ms = Date.now() - t0;
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('noi dung dung tung ky tu', got === TWEET, got);
  check('co gian nhip that (>600ms)', ms > 600, ms);
  await page.close();
}

// --- 10. bai dai sat tran 280 ky tu -----------------------------------------
console.log('\n10. Bai dai sat tran');
{
  const page = await fresh();
  const long = 'x'.repeat(230) + '\n\n#LenaMiu #LalinaLena';
  const r = await type(page, long);
  const got = await box(page);
  check('khong nem loi', r.ok, r.err);
  check('noi dung dung tung ky tu', got === long, got.slice(0, 60) + '...');
  await page.close();
}

await browser.close();
console.log(`\n==== ${pass} dat / ${fail} hong ====`);
process.exit(fail ? 1 : 0);
