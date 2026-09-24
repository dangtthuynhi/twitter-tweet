import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';
import { getBalance } from './api.js';
import { classify } from './proxies.js';
import { log } from './logger.js';
import { redact, humanDuration } from './util.js';
import { loadState, saveState } from './store.js';

const run = promisify(execFile);

const ok = (s) => log.plain(`  ✅ ${s}`);
const bad = (s) => log.plain(`  ❌ ${s}`);
const warn = (s) => log.plain(`  ⚠️  ${s}`);

/**
 * Goi curl di qua proxy. Dung curl vi Node chua co ProxyAgent trong core.
 * Tra ve { body, ms } hoac nem loi kem stderr cua curl.
 */
async function viaProxy(url, { timeout = 25 } = {}) {
  const t0 = Date.now();
  const { stdout } = await run('curl', [
    '-sS', '--max-time', String(timeout),
    '-x', config.account.proxy,
    url,
  ]);
  return { body: stdout, ms: Date.now() - t0 };
}

function checkEnv() {
  log.plain('\n=== 1. Bien moi truong ===');
  let fail = 0;
  const need = [
    ['TWITTERAPI_KEY', config.apiKey],
    ['TW_PASSWORD', config.account.password],
    ['TW_PROXY', config.account.proxy],
  ];
  for (const [name, val] of need) {
    if (val) ok(name);
    else { bad(`${name} — chua dat`); fail++; }
  }
  if (config.account.userName || config.account.email) ok('TW_USERNAME / TW_EMAIL');
  else { bad('Can it nhat TW_USERNAME hoac TW_EMAIL'); fail++; }

  const ck = config.account.loginCookies;
  if (ck) {
    const hasAuth = /auth_token=/.test(ck);
    const hasCt0 = /ct0=/.test(ck);
    if (hasAuth && hasCt0) ok('TW_LOGIN_COOKIES co ca auth_token va ct0 — se BO QUA buoc login');
    else {
      bad(`TW_LOGIN_COOKIES thieu ${!hasAuth ? 'auth_token' : 'ct0'}`);
      log.plain('     Dang dung: auth_token=xxx; ct0=yyy');
      fail++;
    }
  }

  if (config.account.proxy && !/^(https?|socks5h?):\/\/.+:.+@.+:\d+$/.test(config.account.proxy)) {
    warn(`TW_PROXY khong dung dang http://user:pass@ip:port — dang la: ${redact(config.account.proxy)}`);
  }
  return fail === 0;
}

async function checkProxy() {
  log.plain('\n=== 3. Proxy ===');
  log.plain(`  Dang thu: ${redact(config.account.proxy)}`);
  let exitIp;
  try {
    const { body, ms } = await viaProxy('https://api.ipify.org');
    exitIp = body.trim();
    if (!/^[\d.]+$|:/.test(exitIp)) {
      bad(`Proxy tra ve thu la: ${exitIp.slice(0, 120)}`);
      return null;
    }
    ok(`Proxy song. IP thoat: ${exitIp} (${ms}ms)`);
    if (ms > 5000) warn('Proxy cham (>5s) — login vao X co the timeout.');
  } catch (e) {
    bad(`Khong di qua duoc proxy: ${String(e.stderr || e.message).trim().slice(0, 200)}`);
    log.plain('     Kiem tra lai user/pass, port, va xem goi proxy con han khong.');
    return null;
  }
  return exitIp;
}

/**
 * Ghi lai IP thoat moi lan chay check, canh bao neu no doi.
 * Voi proxy tu dung tai nha, IP dong la van de lon hon toc do rat nhieu:
 * IP nhay = bot phai login lai = dung cai pattern X canh giac nhat.
 */
function trackIpStability(ip) {
  log.plain('\n=== 5. Do on dinh cua IP ===');
  const state = loadState();
  state.ipHistory ||= [];
  const prev = state.ipHistory.at(-1);

  if (!prev) {
    state.ipHistory.push({ ip, at: Date.now() });
    saveState(state);
    log.plain('  Lan dau ghi nhan IP nay. Chay lai `check` sau vai ngay de biet no co doi khong.');
    log.plain('  Meo: dat cron chay `node src/cli.js check` moi vai tieng trong 2-3 ngay truoc khi chay that.');
    return;
  }

  if (prev.ip === ip) {
    const stableFor = Date.now() - (state.ipHistory.find((h, i, a) => a.slice(i).every((x) => x.ip === ip))?.at ?? prev.at);
    ok(`IP khong doi. On dinh duoc ${humanDuration(stableFor)} (qua ${state.ipHistory.length} lan kiem tra).`);
  } else {
    state.ipHistory.push({ ip, at: Date.now() });
    saveState(state);
    bad(`IP DA DOI: ${prev.ip} -> ${ip}`);
    log.plain('     Day la IP dong. Moi lan doi, bot buoc phai dang nhap lai tu IP moi —');
    log.plain('     dung cai pattern khien X gan co tai khoan.');
    log.plain('     Can IP tinh, hoac dung proxy mua (ISP/static residential).');
    return;
  }

  const changes = state.ipHistory.length - 1;
  if (changes > 0) {
    const span = Date.now() - state.ipHistory[0].at;
    warn(`Da thay ${changes} lan doi IP trong ${humanDuration(span)}.`);
    log.plain('     Duong truyen nay khong du on dinh de lam proxy co dinh.');
  }
  if (state.ipHistory.length > 50) state.ipHistory = state.ipHistory.slice(-50);
  saveState(state);
}

async function checkIpQuality() {
  log.plain('\n=== 4. Chat luong IP ===');
  log.plain('  (hoi ip-api.com xem IP thoat thuoc loai nao)');
  try {
    const fields = 'status,country,regionName,isp,org,hosting,proxy,mobile,query';
    const { body } = await viaProxy(`http://ip-api.com/json/?fields=${fields}`);
    const d = JSON.parse(body);
    if (d.status !== 'success') { warn('Khong tra cuu duoc thong tin IP.'); return; }

    log.plain(`  IP     : ${d.query}`);
    log.plain(`  Vi tri : ${d.regionName}, ${d.country}`);
    log.plain(`  ISP    : ${d.isp}`);
    log.plain(`  Org    : ${d.org || '(khong co)'}`);

    const kind = classify({ hosting: d.hosting, isp: d.isp, org: d.org });
    if (kind === 'datacenter') {
      bad('Day la IP DATACENTER, khong phai residential.');
      log.plain('     X rat de bat challenge/khoa khi login tu IP nay.');
      log.plain('     Nen doi sang ISP/static residential proxy.');
    } else if (kind === 'nghi ngo') {
      warn('Ten nha cung cap co dau hieu la hosting — co the la datacenter tra ve.');
    } else {
      ok('IP khong bi danh dau la datacenter — dau hieu tot.');
    }
    if (d.proxy) warn('IP bi danh dau la proxy/VPN cong khai — rui ro cao hon binh thuong.');
    if (d.mobile) log.plain('  ℹ IP di dong (mobile carrier).');
  } catch (e) {
    warn(`Bo qua buoc nay: ${String(e.stderr || e.message).trim().slice(0, 120)}`);
  }
}

async function checkBalance() {
  log.plain('\n=== 2. So du twitterapi.io ===');
  try {
    const b = await getBalance();
    const line = `${b.total.toLocaleString()} credit (~$${b.usd.toFixed(4)})`;
    if (b.total <= 0) {
      bad(`HET CREDIT: ${line}`);
      log.plain('     Moi request deu se bi tu choi voi HTTP 402.');
      log.plain('     Nap them tai https://twitterapi.io — Dashboard -> Recharge.');
      return false;
    }
    if (b.usd < 0.5) {
      warn(`Sap het: ${line}`);
      log.plain('     Du cho vai chuc request nua thoi. Nen nap them truoc khi chay `run`.');
    } else {
      ok(`Con ${line}`);
    }
    return true;
  } catch (e) {
    warn(`Khong kiem tra duoc so du: ${e.message}`);
    return true;
  }
}

function checkPlan() {
  log.plain('\n=== 6. Han muc dang ===');
  const perDay = config.maxPerDay;
  if (!perDay) {
    warn('MAX_PER_DAY=0 (khong gioi han). Nen dat tran de tranh dang qua han muc cua X.');
  } else if (perDay > 50) {
    warn(`MAX_PER_DAY=${perDay} > 50.`);
    log.plain('     Tai khoan CHUA verified chi dang duoc 50 original post/ngay (X ap tu 5/2026).');
    log.plain('     Can X Premium thi moi vuot duoc muc nay. Khong co backend nao lach duoc.');
  } else {
    ok(`MAX_PER_DAY=${perDay} — nam trong han muc 50/ngay cua tai khoan thuong.`);
  }
  if (config.maxPerWindow === 0 && perDay > 50) {
    warn('Nen dat MAX_PER_WINDOW (vd 20) vi X chia han muc theo khung nua tieng.');
  }
}

export async function check() {
  log.plain('\n┌─ Kiem tra truoc khi chay that ─┐');
  const envOk = checkEnv();
  if (!envOk) {
    log.plain('\nDien not cac bien con thieu trong .env roi chay lai.\n');
    process.exitCode = 1;
    return;
  }
  const hasCredit = await checkBalance();
  const ip = await checkProxy();
  if (ip) {
    await checkIpQuality();
    trackIpStability(ip);
  }
  checkPlan();

  log.plain('\n=== Buoc tiep theo ===');
  if (!hasCredit) {
    log.plain('  Nap credit truoc da — khong co credit thi khong request nao chay duoc.\n');
    process.exitCode = 1;
    return;
  }
  if (!ip) {
    log.plain('  Sua proxy truoc da — chua qua duoc buoc nay thi login chac chan fail.\n');
    process.exitCode = 1;
    return;
  }
  log.plain('  1) node src/cli.js login       # thu dang nhap that (ton ~$0.07 MOI LAN, ke ca khi fail)');
  log.plain('  2) node src/cli.js post --dry  # xem truoc bai ke tiep');
  log.plain('  3) node src/cli.js post        # dang 1 bai that de kiem chung');
  log.plain('  4) node src/cli.js run         # bat scheduler\n');
}
