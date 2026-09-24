import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from './logger.js';
import { humanDuration } from './util.js';

const run = promisify(execFile);
const FILE = path.resolve(process.cwd(), 'data/ip-history.json');

/**
 * Ghi lai IP public cua duong truyen (KHONG qua proxy).
 * Dung truoc khi tu dung proxy tai nha: chay cron vai ngay de biet
 * IP co dung yen khong. IP doi lien tuc = khong lam proxy co dinh duoc.
 */
export async function ipwatch({ report = false } = {}) {
  let history = [];
  try { history = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}

  if (!report) {
    let ip;
    for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
      try {
        const { stdout } = await run('curl', ['-sS', '--max-time', '15', url]);
        const v = stdout.trim();
        if (/^[\d.]+$|:/.test(v)) { ip = v; break; }
      } catch { /* thu nguon tiep theo */ }
    }
    if (!ip) { log.error('Khong lay duoc IP public tu nguon nao.'); process.exitCode = 1; return; }

    const last = history.at(-1);
    if (!last) {
      history.push({ ip, at: Date.now(), changes: 0 });
      log.ok(`Bat dau theo doi. IP hien tai: ${ip}`);
    } else if (last.ip === ip) {
      last.lastSeen = Date.now();
      log.info(`IP khong doi: ${ip} (on dinh ${humanDuration(Date.now() - last.at)})`);
    } else {
      history.push({ ip, at: Date.now(), changes: (last.changes || 0) + 1 });
      log.warn(`IP DA DOI: ${last.ip} -> ${ip} (sau ${humanDuration(Date.now() - last.at)})`);
    }
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(history, null, 2));
  }

  if (!history.length) { log.warn('Chua co du lieu. Chay `node src/cli.js ipwatch` truoc.'); return; }

  const span = Date.now() - history[0].at;
  const changes = history.length - 1;
  log.plain(`\n=== Lich su IP (${humanDuration(span)}) ===`);
  for (const h of history.slice(-10)) {
    const until = h.lastSeen || Date.now();
    log.plain(`  ${h.ip.padEnd(16)} tu ${new Date(h.at).toLocaleString('sv')} — giu duoc ${humanDuration(until - h.at)}`);
  }

  log.plain(`\n  Doi ${changes} lan trong ${humanDuration(span)}.`);
  if (span < 2 * 86400e3) {
    log.plain('  ⏳ Chua du du lieu. Theo doi it nhat 2-3 ngay roi hay ket luan.');
  } else if (changes === 0) {
    log.plain('  ✅ IP dung yen. Dung duoc de tu dung proxy tai nha.');
  } else if (changes / (span / 86400e3) < 0.2) {
    log.plain('  ⚠️  IP doi tho (duoi 1 lan/5 ngay). Chap nhan duoc — giong nguoi dung binh thuong doi mang.');
    log.plain('     Nhung can DDNS de router bao IP moi, va bot se phai login lai moi lan doi.');
  } else {
    log.plain('  ❌ IP doi qua thuong xuyen. KHONG nen tu dung proxy —');
    log.plain('     moi lan doi la mot lan login tu IP la, dung pattern X gan co.');
    log.plain('     Dung proxy mua (chay `node src/cli.js proxies` de chon).');
  }
  log.plain('');
}
