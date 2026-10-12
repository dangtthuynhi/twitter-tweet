import { getUserLastTweets, advancedSearch } from './api.js';

const COST_PER_TWEET = 0.00015;   // twitterapi.io, toi thieu 1 tweet moi request
const RESERVED = new Set(['home', 'i', 'search', 'explore', 'notifications', 'messages',
  'compose', 'settings', 'intent', 'share']);

/**
 * Doc ten nguoi dung tu "@LenaMiu_CH3", "LenaMiu_CH3" hay link trang ca nhan /
 * link mot bai cua ho. Tra ve null neu khong ra ten hop le.
 */
export function parseUserName(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i) ||
    s.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if (!m || RESERVED.has(m[1].toLowerCase())) return null;
  return m[1];
}

const isRetweet = (t) => Boolean(t.retweeted_tweet || t.retweetedTweet);
const isReply = (t) => Boolean(t.isReply || t.inReplyToId);

/** So sanh id tweet (snowflake, so lon hon = dang sau). */
const byNewest = (a, b) => {
  const x = BigInt(a.id), y = BigInt(b.id);
  return x === y ? 0 : x < y ? 1 : -1;
};

/**
 * Loc va xep: chi bai CUA CHINH nguoi do (bo bai ho repost lai cua nguoi
 * khac), bo reply neu khong yeu cau, bo trung, moi nhat truoc.
 * Xep theo id chu khong tin thu tu API tra ve: bai ghim cu co the nam dau.
 */
export function pickLatest(tweets, { count = 20, includeReplies = false } = {}) {
  const seen = new Set();
  return tweets
    .filter((t) => t && t.id && !isRetweet(t) && (includeReplies || !isReply(t)))
    .filter((t) => !seen.has(String(t.id)) && seen.add(String(t.id)))
    .sort(byNewest)
    .slice(0, count);
}

/**
 * Lay `count` tweet gan nhat cua @userName qua twitterapi.io (20 tweet/trang,
 * theo cursor sang trang sau neu loc xong chua du). Chan `maxPages` trang de
 * khong lo tay ton tien voi tai khoan toan retweet.
 */
export async function fetchLatestTweets(userName, {
  count = 20, includeReplies = false, maxPages = 5, onPage,
} = {}) {
  const all = [];
  let cursor = '';
  let billed = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await getUserLastTweets({ userName, cursor, includeReplies });
    billed += Math.max(1, res.tweets.length);
    all.push(...res.tweets);
    const picked = pickLatest(all, { count, includeReplies });
    onPage?.({ page, got: res.tweets.length, kept: picked.length });
    // Du roi, hoac het bai, thi dung. Them trang nua chi de bu bai ghim cu
    // chen vao: trang dau tra du `count` bai hop le la chac chan du.
    if (picked.length >= count || !res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return { tweets: pickLatest(all, { count, includeReplies }), cost: billed * COST_PER_TWEET };
}

/**
 * Ket qua tim kiem: bo trung (trang sau hay tra lai bai cu) va bo repost
 * thuan, GIU NGUYEN thu tu API tra ve — voi "Top" do la thu tu xep hang cua
 * X, xep lai theo id la mat no.
 */
export function keepSearchResults(tweets) {
  const seen = new Set();
  return tweets.filter((t) => t && t.id && !isRetweet(t) &&
    !seen.has(String(t.id)) && seen.add(String(t.id)));
}

/**
 * Lay `count` tweet theo cu phap tim kiem cua X (vd: '"CUM CHU" #hashtag'),
 * queryType 'Top' hoac 'Latest'. 20 tweet/trang, theo cursor toi khi du;
 * chan so trang de khong lo tay ton tien.
 */
export async function fetchSearchTweets(query, {
  count = 20, queryType = 'Top', maxPages = Math.ceil(count / 20) + 3, onPage,
} = {}) {
  const all = [];
  let cursor = '';
  let billed = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await advancedSearch({ query, queryType, cursor });
    billed += Math.max(1, res.tweets.length);
    all.push(...res.tweets);
    const kept = keepSearchResults(all);
    onPage?.({ page, got: res.tweets.length, kept: kept.length });
    if (kept.length >= count || !res.hasNextPage || !res.nextCursor || !res.tweets.length) break;
    cursor = res.nextCursor;
  }
  return { tweets: keepSearchResults(all).slice(0, count), cost: billed * COST_PER_TWEET };
}
