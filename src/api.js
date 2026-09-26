import fs from 'node:fs';
import { config } from './config.js';
import { log } from './logger.js';
import { sleep, redact } from './util.js';

/** Loi tra ve tu twitterapi.io, kem status/msg de phia tren quyet dinh retry. */
export class ApiError extends Error {
  constructor(message, { httpStatus, payload, endpoint } = {}) {
    super(message);
    this.name = 'ApiError';
    this.httpStatus = httpStatus;
    this.payload = payload;
    this.endpoint = endpoint;
  }
}

const RETRIABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

async function request(endpoint, { body, form, query, method, timeout = 120_000, retries = 3 } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')).toString()
    : '';
  const url = `${config.baseUrl}${endpoint}${qs}`;
  const headers = { 'X-API-Key': config.apiKey };
  const verb = method || (query && !body && !form ? 'GET' : 'POST');
  let init;

  if (verb === 'GET') {
    init = { method: 'GET', headers };
  } else if (form) {
    init = { method: 'POST', headers, body: form };
  } else {
    init = {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    };
  }

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      log.debug(`${verb} ${endpoint}${qs} (lan ${attempt}/${retries})`);
      const res = await fetch(url, { ...init, signal: ac.signal });
      const text = await res.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }

      if (!res.ok) {
        const msg = payload.message || payload.msg || payload.raw || res.statusText;

        // Het credit: retry chi to phi thoi gian, bao ro cho nguoi dung
        if (res.status === 402 || /credits? is not enough|please recharge/i.test(msg)) {
          throw new ApiError(
            `Het credit twitterapi.io. Nap them tai https://twitterapi.io (Dashboard -> Recharge).\n` +
              `   API tra ve: ${msg}`,
            { httpStatus: res.status, payload, endpoint }
          );
        }
        const err = new ApiError(`HTTP ${res.status} tu ${endpoint}: ${msg}`, {
          httpStatus: res.status,
          payload,
          endpoint,
        });
        if (RETRIABLE_HTTP.has(res.status) && attempt < retries) {
          lastErr = err;
          const wait = Math.min(30_000, 2 ** attempt * 1000);
          log.warn(`${err.message} — thu lai sau ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        throw err;
      }

      // API tra HTTP 200 nhung status:"error" khi login/post that bai
      if (payload.status && payload.status !== 'success') {
        throw new ApiError(payload.msg || payload.message || 'API tra ve status=error', {
          httpStatus: res.status,
          payload,
          endpoint,
        });
      }
      return payload;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ApiError) throw e;
      // loi mang / timeout
      lastErr = e;
      if (attempt < retries) {
        const wait = Math.min(30_000, 2 ** attempt * 1000);
        log.warn(`Loi ket noi (${e.message}) — thu lai sau ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      throw new ApiError(`Khong goi duoc ${endpoint}: ${e.message}`, { endpoint });
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Dang nhap va lay login_cookie.
 * POST /twitter/user_login_v2
 */
export async function login() {
  const { userName, email, password, proxy, totpSecret } = config.account;
  log.info(`Dang nhap @${userName || email} qua proxy ${redact(proxy)} ...`);
  const payload = await request('/twitter/user_login_v2', {
    body: {
      user_name: userName,
      email,
      password,
      proxy,
      ...(totpSecret ? { totp_secret: totpSecret } : {}),
    },
    retries: 2,
  });
  if (!payload.login_cookie) {
    throw new ApiError(`Login khong tra ve login_cookie: ${payload.msg || '(khong ro)'}`, { payload });
  }
  return payload.login_cookie;
}

/**
 * Dang tweet.
 * POST /twitter/create_tweet_v2
 */
export async function createTweet({
  loginCookies,
  text,
  mediaIds,
  replyToTweetId,
  quoteTweetId,
  communityId,
  attachmentUrl,
  isNoteTweet,
  scheduleFor,
}) {
  const body = {
    login_cookies: loginCookies,
    tweet_text: text,
    proxy: config.account.proxy,
  };
  if (mediaIds?.length) body.media_ids = mediaIds;
  if (replyToTweetId) body.reply_to_tweet_id = replyToTweetId;
  if (quoteTweetId) body.quote_tweet_id = quoteTweetId;
  if (communityId) body.community_id = communityId;
  if (attachmentUrl) body.attachment_url = attachmentUrl;
  if (isNoteTweet) body.is_note_tweet = true;
  if (scheduleFor) body.schedule_for = scheduleFor;

  const payload = await request('/twitter/create_tweet_v2', { body, retries: 2 });
  return { tweetId: payload.tweet_id, msg: payload.msg };
}

/**
 * Retweet mot tweet co san.
 * POST /twitter/retweet_tweet_v2
 */
export async function retweet({ loginCookies, tweetId }) {
  const payload = await request('/twitter/retweet_tweet_v2', {
    body: {
      login_cookies: loginCookies,
      tweet_id: String(tweetId),
      proxy: config.account.proxy,
    },
    retries: 2,
  });
  return { tweetId: String(tweetId), msg: payload.msg };
}

/**
 * Upload anh/video, tra ve media_id.
 * POST /twitter/upload_media_v2 (multipart/form-data)
 */
export async function uploadMedia({ loginCookies, filePath, isLongVideo = false }) {
  if (!fs.existsSync(filePath)) throw new Error(`Khong tim thay file media: ${filePath}`);
  const form = new FormData();
  form.append('file', await fs.openAsBlob(filePath), filePath.split('/').pop());
  form.append('proxy', config.account.proxy);
  form.append('login_cookies', loginCookies);
  if (isLongVideo) form.append('is_long_video', 'true');

  const payload = await request('/twitter/upload_media_v2', { form, timeout: 300_000, retries: 2 });
  if (!payload.media_id) {
    throw new ApiError(`Upload media that bai: ${payload.msg || '(khong ro)'}`, { payload });
  }
  return payload.media_id;
}

/**
 * Lay tweet moi nhat cua 1 account (toi da 20/trang).
 * GET /twitter/user/last_tweets
 * Tinh phi $0.00015 moi tweet tra ve, toi thieu $0.00015 moi request.
 */
export async function getUserLastTweets({ userName, userId, cursor = '', includeReplies = false }) {
  const payload = await request('/twitter/user/last_tweets', {
    query: {
      ...(userId ? { userId } : { userName }),
      cursor,
      includeReplies: String(includeReplies),
    },
    retries: 2,
  });
  const list = payload.tweets || payload.data?.tweets || [];
  return {
    tweets: list,
    hasNextPage: payload.has_next_page ?? false,
    nextCursor: payload.next_cursor ?? '',
  };
}

/** So du credit hien tai. Khong ton phi. */
export async function getBalance() {
  const res = await fetch(`${config.baseUrl}/oapi/my/info`, {
    headers: { 'X-API-Key': config.apiKey },
  });
  if (!res.ok) throw new ApiError(`Khong doc duoc so du: HTTP ${res.status}`, { httpStatus: res.status });
  const d = await res.json();
  const credits = d.recharge_credits ?? 0;
  const bonus = d.total_bonus_credits ?? 0;
  return { credits, bonus, total: credits + bonus, usd: (credits + bonus) / 100000 };
}

/**
 * Tim tweet nang cao.
 * GET /twitter/tweet/advanced_search — 20 tweet/trang, tinh phi $0.00015/tweet.
 */
export async function advancedSearch({ query, queryType = 'Latest', cursor = '' }) {
  const payload = await request('/twitter/tweet/advanced_search', {
    query: { query, queryType, cursor },
    retries: 2,
  });
  return {
    tweets: payload.tweets || [],
    hasNextPage: payload.has_next_page ?? false,
    nextCursor: payload.next_cursor ?? '',
  };
}

/**
 * Lay reply cua mot tweet.
 * GET /twitter/tweet/replies — 20 reply/trang, $0.00015 moi reply tra ve.
 * Luu y: tweetId phai la tweet GOC, khong phai mot reply trong luong.
 */
export async function getTweetReplies({ tweetId, cursor = '' }) {
  const payload = await request('/twitter/tweet/replies', {
    query: { tweetId: String(tweetId), cursor },
    retries: 2,
  });
  const list = payload.replies || payload.tweets || payload.data || [];
  return {
    replies: Array.isArray(list) ? list : [],
    hasMore: payload.has_more ?? payload.has_next_page ?? false,
    nextCursor: payload.next_cursor ?? '',
  };
}

/**
 * Lay danh sach nguoi da retweet mot tweet.
 * GET /twitter/tweet/retweeters — tra ve mang `users`.
 */
export async function getRetweeters({ tweetId, cursor = '' }) {
  const payload = await request('/twitter/tweet/retweeters', {
    query: { tweetId: String(tweetId), cursor },
    retries: 2,
  });
  return {
    users: payload.users || [],
    hasMore: payload.has_next_page ?? payload.has_more ?? false,
    nextCursor: payload.next_cursor ?? '',
  };
}

/** Doan xem loi co phai do session het han khong, de tu dang nhap lai. */
export function isAuthError(err) {
  const msg = `${err?.message || ''} ${JSON.stringify(err?.payload || {})}`.toLowerCase();
  return (
    err?.httpStatus === 401 ||
    err?.httpStatus === 403 ||
    /cookie|session|login|unauthor|not logged|expired|authenticat/.test(msg)
  );
}
