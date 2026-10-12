// Kiem tra phan doc ten nguoi dung va loc/xep tweet cua lenh `tweets`.
// Khong goi API: chi chay phan xu ly tren du lieu gia.
//
//   node test/usertweets/run.mjs
import { parseUserName, pickLatest, keepSearchResults } from '../../src/usertweets.js';

let pass = 0, fail = 0;
const check = (name, ok, got) => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got: ${JSON.stringify(got)}`); }
};

console.log('\n1. Doc ten nguoi dung');
for (const [raw, want] of [
  ['LenaMiu_CH3', 'LenaMiu_CH3'],
  ['@miunatshaa', 'miunatshaa'],
  ['  lena__lorena  ', 'lena__lorena'],
  ['https://x.com/LenaMiu_CH3', 'LenaMiu_CH3'],
  ['https://twitter.com/LenaMiu_CH3/status/2103095712292696459?s=20', 'LenaMiu_CH3'],
  ['x.com/@LenaMiu_CH3/', 'LenaMiu_CH3'],
  ['https://x.com/home', null],
  ['ten co dau cach', null],
  ['qua_dai_hon_muoi_lam_ky_tu', null],
  ['', null],
]) {
  const got = parseUserName(raw);
  check(`${JSON.stringify(raw)} -> ${want}`, got === want, got);
}

console.log('\n2. Loc va xep tweet');
{
  const tw = (id, extra = {}) => ({ id: String(id), text: `bai ${id}`, ...extra });
  const api = [
    tw('1000000000000000001', { isPinned: true }),                       // bai ghim cu, API tra dau tien
    tw('2103095712292696459'),
    tw('2103095712292696460', { retweeted_tweet: { id: '9' } }),          // repost bai nguoi khac
    tw('2103095712292696458', { isReply: true, inReplyToId: '7' }),       // reply
    tw('2103095712292696461'),
    tw('2103095712292696459'),                                            // trung (trang sau tra lai)
    tw('2103095712292696457'),
  ];
  const ids = (list) => list.map((t) => t.id.slice(-3));

  const got = pickLatest(api, { count: 3 });
  check('bo repost + reply + trung, moi nhat truoc, bai ghim cu bi day xuong',
    JSON.stringify(ids(got)) === '["461","459","457"]', ids(got));
  const withReplies = pickLatest(api, { count: 3, includeReplies: true });
  check('--replies thi giu reply', JSON.stringify(ids(withReplies)) === '["461","459","458"]', ids(withReplies));
  const few = pickLatest(api, { count: 20 });
  check('it hon count thi tra het (gom ca bai ghim)', few.length === 4 && few.at(-1).id.startsWith('1000'), ids(few));
  check('so sanh id dung voi so lon (khong lam tron)', pickLatest([tw('2103095712292696459'), tw('2103095712292696460')], { count: 1 })[0].id === '2103095712292696460', null);
}

console.log('\n3. Ket qua tim kiem (Top)');
{
  const top = [{ id: '30' }, { id: '10' }, { id: '50', retweeted_tweet: {} }, { id: '20' }, { id: '10' }];
  const got = keepSearchResults(top).map((t) => t.id);
  check('giu thu tu xep hang cua X, bo repost va bai trung', JSON.stringify(got) === '["30","10","20"]', got);
}

console.log(`\n==== ${pass} dat / ${fail} hong ====`);
process.exit(fail ? 1 : 0);
