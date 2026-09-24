import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { hash } from './util.js';
import { wasPosted } from './store.js';

const DIRECTIVE = /^@(media|reply|quote|retweet|community|note|schedule|url)\s*:\s*(.+)$/i;

/**
 * Doc file queue. Moi tweet cach nhau bang dong "---".
 * Trong 1 tweet, cac dong @media:/@reply:/@retweet:/... o dau la metadata.
 * Dong bat dau bang "#" o dau tweet la comment.
 */
export function loadQueue(file = config.tweetsFile) {
  if (!fs.existsSync(file)) {
    throw new Error(`Khong tim thay file noi dung: ${path.relative(process.cwd(), file)}`);
  }
  const blocks = fs.readFileSync(file, 'utf8').split(/^\s*---\s*$/m);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const meta = {};
    let i = 0;
    // an comment + dong trong o dau block
    while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++;
    // gom directive
    while (i < lines.length) {
      const m = lines[i].trim().match(DIRECTIVE);
      if (!m) break;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'media') (meta.media ||= []).push(val);
      else meta[key] = val;
      i++;
    }
    const text = lines.slice(i).join('\n').trim();
    // entry retweet khong can noi dung, chi can id
    if (!text && !meta.retweet) continue;

    entries.push({
      type: meta.retweet ? 'retweet' : 'tweet',
      retweetId: meta.retweet,
      text,
      hash: meta.retweet ? hash(`RT:${meta.retweet}`) : hash(text),
      media: (meta.media || []).map((p) => path.resolve(process.cwd(), p)),
      replyToTweetId: meta.reply,
      quoteTweetId: meta.quote,
      communityId: meta.community,
      attachmentUrl: meta.url,
      scheduleFor: meta.schedule,
      isNoteTweet: meta.note ? /^(1|true|yes)$/i.test(meta.note) : undefined,
    });
  }
  return entries;
}

/**
 * Chon tweet ke tiep chua dang.
 * @returns {{entry: object, index: number} | null}
 */
export function pickNext(entries, state) {
  const pending = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !wasPosted(state, entry.hash));

  if (!pending.length) {
    if (!config.loopQueue) return null;
    // LOOP_QUEUE: dang lai tu dau, bo qua lich su
    if (!entries.length) return null;
    const idx = config.order === 'random'
      ? Math.floor(Math.random() * entries.length)
      : state.cursor % entries.length;
    return { entry: entries[idx], index: idx, repeat: true };
  }

  if (config.order === 'random') {
    return pending[Math.floor(Math.random() * pending.length)];
  }
  // sequential: uu tien tu cursor tro di, neu het thi lay tu dau
  return pending.find((p) => p.index >= state.cursor) || pending[0];
}
