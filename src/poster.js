import { config } from './config.js';
import { createTweet, uploadMedia, retweet, isAuthError } from './api.js';
import { getLoginCookies } from './session.js';
import { log } from './logger.js';
import { tweetLength } from './util.js';
import { loadState, recordPost, countToday } from './store.js';

const LIMIT = 280;

/** Dang 1 entry. Tu login lai 1 lan neu session het han. */
export async function postEntry(entry, { dryRun = config.dryRun } = {}) {
  if (entry.type === 'retweet') return retweetEntry(entry, { dryRun });

  const len = tweetLength(entry.text);
  if (len > LIMIT && !entry.isNoteTweet) {
    throw new Error(
      `Tweet dai ${len}/${LIMIT} ky tu. Cat ngan lai, hoac them "@note: true" (can X Premium).`
    );
  }

  const preview = entry.text.replace(/\n/g, ' ⏎ ').slice(0, 100);
  if (dryRun) {
    log.ok(`[DRY RUN] Se dang (${len} ky tu): ${preview}`);
    if (entry.media?.length) log.info(`[DRY RUN] Kem ${entry.media.length} media: ${entry.media.join(', ')}`);
    return { tweetId: null, dryRun: true };
  }

  const attempt = async (force) => {
    const loginCookies = await getLoginCookies(force);

    const mediaIds = [];
    for (const filePath of entry.media || []) {
      log.info(`Upload media: ${filePath}`);
      mediaIds.push(await uploadMedia({ loginCookies, filePath }));
    }

    return createTweet({
      loginCookies,
      text: entry.text,
      mediaIds,
      replyToTweetId: entry.replyToTweetId,
      quoteTweetId: entry.quoteTweetId,
      communityId: entry.communityId,
      attachmentUrl: entry.attachmentUrl,
      isNoteTweet: entry.isNoteTweet,
      scheduleFor: entry.scheduleFor,
    });
  };

  let result;
  try {
    result = await attempt(false);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    if (config.account.loginCookies) throw cookieExpiredError(err);
    log.warn(`Session co ve het han (${err.message}) — dang nhap lai va thu lai.`);
    result = await attempt(true);
  }

  const url = `https://x.com/${config.account.userName || 'i'}/status/${result.tweetId}`;
  log.ok(`Da dang: ${url}`);
  log.info(`   ${preview}`);
  return result;
}


/** Cookie tu cung cap thi khong the tu lam moi — bao ro thay vi thu lai vo ich. */
function cookieExpiredError(err) {
  return new Error(
    `Cookie trong TW_LOGIN_COOKIES da het han hoac bi thu hoi.\n` +
      `   Lay lai tu trinh duyet: F12 -> Application -> Cookies -> https://x.com\n` +
      `   Copy auth_token va ct0, cap nhat lai .env.\n` +
      `   Cookie chet khi: ban dang xuat, doi mat khau, hoac X thu hoi phien.\n` +
      `   Loi goc: ${err.message}`
  );
}

/** Retweet 1 tweet co san. Cung co che tu login lai. */
async function retweetEntry(entry, { dryRun }) {
  if (dryRun) {
    log.ok(`[DRY RUN] Se retweet: https://x.com/i/status/${entry.retweetId}`);
    return { tweetId: entry.retweetId, dryRun: true };
  }

  const attempt = async (force) =>
    retweet({ loginCookies: await getLoginCookies(force), tweetId: entry.retweetId });

  let result;
  try {
    result = await attempt(false);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    if (config.account.loginCookies) throw cookieExpiredError(err);
    log.warn(`Session co ve het han (${err.message}) — dang nhap lai va thu lai.`);
    result = await attempt(true);
  }
  log.ok(`Da retweet: https://x.com/i/status/${entry.retweetId}`);
  return result;
}

/** Dang 1 entry + ghi lai lich su/cursor. Tra ve state moi. */
export async function postAndRecord(entry, index, { dryRun = config.dryRun } = {}) {
  const state = loadState();

  if (config.maxPerDay > 0 && countToday(state) >= config.maxPerDay) {
    throw new Error(`Da dat tran MAX_PER_DAY=${config.maxPerDay} tweet hom nay.`);
  }

  const result = await postEntry(entry, { dryRun });
  if (!dryRun) {
    state.cursor = index + 1;
    recordPost(state, { entryHash: entry.hash, text: entry.text, tweetId: result.tweetId });
  }
  return result;
}
