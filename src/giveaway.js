import fs from 'node:fs';
import path from 'node:path';

/**
 * Loc entry giveaway theo the le cua bai dang.
 *
 * Kiem tra duoc tu du lieu da tai ve (khong ton them tien):
 *   - da retweet chua
 *   - co so trong khoang cho phep
 *   - loi nhan du do dai toi thieu
 *   - co keyword bat buoc
 *   - co hashtag bat buoc
 *   - du so follower toi thieu
 *
 * KHONG kiem tra duoc neu khong goi them API:
 *   - co follow cac tai khoan yeu cau khong
 *   - co hoat dong lien quan trong 7-10 ngay gan day khong
 */

/** Bo @mention, keyword, hashtag va so ra khoi text de do do dai loi nhan that. */
function messageBody(text, { keyword, hashtag }) {
  let s = text;
  s = s.replace(/^(?:\s*@\w+)+/, '');                       // chuoi mention dau reply
  if (keyword) s = s.replace(new RegExp(escapeRe(keyword), 'gi'), '');
  if (hashtag) s = s.replace(new RegExp(escapeRe(hashtag), 'gi'), '');
  s = s.replace(/#[^\s#]+/g, '');                           // cac hashtag khac
  s = s.replace(/\bhttps?:\/\/\S+/g, '');
  s = s.replace(/\b\d{1,4}\b/g, '');                        // so du thi
  return s.replace(/\s+/g, ' ').trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tim so hop le trong khoang [min,max]. Tra ve so DAU TIEN tim thay. */
function findNumber(text, min, max) {
  const cleaned = text.replace(/^(?:\s*@\w+)+/, '');
  for (const m of cleaned.matchAll(/(?<![\w#])(\d{1,4})(?![\w])/g)) {
    const n = Number(m[1]);
    if (n >= min && n <= max) return { value: n, raw: m[1] };
  }
  return null;
}

export function checkEntry(reply, rules, retweeterSet) {
  const text = reply.text || '';
  const handle = (reply.author || '').toLowerCase();

  const num = findNumber(text, rules.numberMin, rules.numberMax);
  const body = messageBody(text, rules);
  const hasKeyword = rules.keyword
    ? text.toLowerCase().includes(rules.keyword.toLowerCase()) : true;
  const hasHashtag = rules.hashtag
    ? text.toLowerCase().includes(rules.hashtag.toLowerCase()) : true;

  const checks = {
    retweeted: retweeterSet.has(handle),
    number: !!num,
    message: body.length >= rules.minMessage,
    keyword: hasKeyword,
    hashtag: hasHashtag,
    followers: (reply.followers ?? 0) >= rules.minFollowers,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);

  return {
    author: reply.author,
    number: num?.value ?? null,
    message: body,
    messageLen: body.length,
    followers: reply.followers ?? 0,
    createdAt: reply.createdAt,
    at: reply.createdAt ? new Date(reply.createdAt).getTime() : 0,
    url: reply.url,
    text,
    checks,
    failed,
    valid: failed.length === 0,
  };
}

/**
 * Khi hai nguoi chon trung so: the le uu tien nguoi comment SOM hon.
 * Moi nguoi cung chi duoc tinh mot entry (lay entry hop le som nhat).
 */
export function resolveEntries(entries) {
  const valid = entries.filter((e) => e.valid).sort((a, b) => a.at - b.at);

  const byAuthor = new Map();
  for (const e of valid) if (!byAuthor.has(e.author)) byAuthor.set(e.author, e);

  const byNumber = new Map();
  const duplicates = [];
  for (const e of [...byAuthor.values()].sort((a, b) => a.at - b.at)) {
    if (byNumber.has(e.number)) { duplicates.push({ loser: e, winner: byNumber.get(e.number) }); continue; }
    byNumber.set(e.number, e);
  }

  return {
    accepted: [...byNumber.values()].sort((a, b) => a.at - b.at),
    duplicates,
    multiEntry: [...byAuthor.values()].length !== valid.length,
  };
}

export function saveEntries(rows, file) {
  const cols = ['author', 'number', 'messageLen', 'followers', 'createdAt', 'message', 'url'];
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = path.resolve(process.cwd(), file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
  return out;
}
