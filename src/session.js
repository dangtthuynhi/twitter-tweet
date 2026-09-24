import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { login } from './api.js';
import { log } from './logger.js';
import { hash, humanDuration } from './util.js';

function read() {
  try {
    return JSON.parse(fs.readFileSync(config.sessionFile, 'utf8'));
  } catch {
    return null;
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(config.sessionFile), { recursive: true });
  fs.writeFileSync(config.sessionFile, JSON.stringify(data, null, 2));
  fs.chmodSync(config.sessionFile, 0o600);
}

/** Cookie chi dung lai duoc khi cung tai khoan + cung proxy. */
const fingerprint = () =>
  hash(`${config.account.userName}|${config.account.email}|${config.account.proxy}`);

/**
 * Tra ve login_cookie, uu tien cache tren dia; tu dang nhap lai khi het han.
 * @param {boolean} force - bo qua cache, login moi
 */
export async function getLoginCookies(force = false) {
  // Cookie tu cung cap duoc uu tien tuyet doi — khong goi login.
  if (config.account.loginCookies) {
    log.debug('Dung TW_LOGIN_COOKIES tu .env (bo qua buoc dang nhap).');
    trackCookieAge(config.account.loginCookies);
    return config.account.loginCookies;
  }

  const cached = read();
  if (!force && cached?.loginCookie) {
    const age = Date.now() - cached.createdAt;
    if (cached.fingerprint !== fingerprint()) {
      log.info('Tai khoan hoac proxy da doi — dang nhap lai.');
    } else if (age > config.sessionTtl) {
      log.info(`Session cu ${humanDuration(age)} (> SESSION_TTL) — dang nhap lai.`);
    } else {
      log.debug(`Dung session cache (tao ${humanDuration(age)} truoc).`);
      return cached.loginCookie;
    }
  }

  const loginCookie = await login();
  write({
    loginCookie,
    createdAt: Date.now(),
    fingerprint: fingerprint(),
    account: config.account.userName || config.account.email,
  });
  log.ok(`Dang nhap thanh cong, da luu session vao ${path.relative(process.cwd(), config.sessionFile)}`);
  return loginCookie;
}

/** Ghi lai lan dau thay cookie nay, de biet no da song bao lau. */
function trackCookieAge(cookie) {
  const fp = hash(cookie);
  const cached = read();
  if (cached?.cookieFingerprint === fp) return;
  write({ cookieFingerprint: fp, firstSeen: Date.now(), manual: true });
}

/** Cookie thu cong da dung duoc bao lau. null neu khong dung che do nay. */
export function cookieAge() {
  if (!config.account.loginCookies) return null;
  const cached = read();
  if (cached?.cookieFingerprint !== hash(config.account.loginCookies)) return null;
  return Date.now() - cached.firstSeen;
}

export function clearSession() {
  try {
    fs.unlinkSync(config.sessionFile);
    return true;
  } catch {
    return false;
  }
}

export function sessionInfo() {
  const s = read();
  if (!s) return null;
  return {
    account: s.account,
    ageMs: Date.now() - s.createdAt,
    stale: s.fingerprint !== fingerprint() || Date.now() - s.createdAt > config.sessionTtl,
  };
}
