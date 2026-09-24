import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from './logger.js';
import { redact } from './util.js';

const run = promisify(execFile);

/** Doc list proxy tu TW_PROXY_LIST hoac content/proxies.txt */
export function loadProxyList() {
  const inline = (process.env.TW_PROXY_LIST || '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (inline.length) return inline;

  const file = path.resolve(process.cwd(), 'content/proxies.txt');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map(normalize);
}

/**
 * Chap nhan ca dang "ip:port:user:pass" (Webshare export) lan URL day du.
 */
export function normalize(raw) {
  const s = raw.trim();
  if (/^\w+:\/\//.test(s)) return s;
  const parts = s.split(':');
  if (parts.length === 4) {
    const [ip, port, user, pass] = parts;
    return `http://${user}:${pass}@${ip}:${port}`;
  }
  if (parts.length === 2) return `http://${s}`;
  return s;
}

/** Thu 1 proxy: con song khong, do tre bao nhieu, IP thoat thuoc loai gi. */
export async function testProxy(proxy, { timeout = 20 } = {}) {
  const out = { proxy, alive: false, ms: null, ip: null, hosting: null, isp: null, country: null, error: null };
  const t0 = Date.now();
  try {
    const fields = 'status,country,isp,org,hosting,proxy,mobile,query';
    const { stdout } = await run('curl', [
      '-sS', '--max-time', String(timeout), '-x', proxy,
      `http://ip-api.com/json/?fields=${fields}`,
    ]);
    out.ms = Date.now() - t0;
    const d = JSON.parse(stdout);
    if (d.status !== 'success') throw new Error('ip-api tra ve that bai');
    out.alive = true;
    out.ip = d.query;
    out.hosting = !!d.hosting;
    out.flaggedProxy = !!d.proxy;
    out.isp = d.isp;
    out.country = d.country;
  } catch (e) {
    out.error = String(e.stderr || e.message).trim().split('\n')[0].slice(0, 80);
    out.ms = Date.now() - t0;
  }
  return out;
}

/**
 * Co ip-api tra hosting=false nhung ISP van la nha cung cap datacenter
 * (Leaseweb, M247, Choopa...). Doi chieu ten ISP/org de bat cac truong hop do.
 */
const HOSTING_NAMES = [
  'leaseweb', 'digitalocean', 'ovh', 'hetzner', 'contabo', 'linode', 'vultr',
  'choopa', 'm247', 'hostpapa', 'cogent', 'colocrossing', 'quadranet', 'psychz',
  'hivelocity', 'datacamp', 'g-core', 'serverius', 'worldstream', 'ovhcloud',
  'amazon', 'aws', 'google cloud', 'microsoft', 'azure', 'oracle', 'alibaba',
  'syn-uk', 'heart internet', 'hostroyale', 'getechbrothers', 'zenlayer',
  'scaleway', 'ionos', 'godaddy', 'namecheap', 'dedipath', 'buyvm', 'frantech',
];
const GENERIC = /\b(hosting|datacenter|data center|colo|vps|dedicated server|cloud)\b/;

/** Tra ve 'datacenter' | 'nghi ngo' | 'residential' */
export function classify(r) {
  if (r.hosting) return 'datacenter';
  const hay = `${r.isp || ''} ${r.org || ''}`.toLowerCase();
  if (HOSTING_NAMES.some((n) => hay.includes(n))) return 'datacenter';
  if (GENERIC.test(hay)) return 'nghi ngo';
  return 'residential';
}

/** Diem cang cao cang dang dung. Uu tien residential, roi den do tre. */
function score(r) {
  if (!r.alive) return -1;
  let s = 100;
  const kind = classify(r);
  if (kind === 'datacenter') s -= 60;  // X rat de chan
  else if (kind === 'nghi ngo') s -= 35;
  if (r.flaggedProxy) s -= 25;         // IP bi danh dau la proxy cong khai
  s -= Math.min(30, r.ms / 200);       // moi 200ms tre tru 1 diem, toi da 30
  return Math.round(s);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

export async function rankProxies(list) {
  log.plain(`\nDang thu ${list.length} proxy (song song 5 cai mot)...\n`);
  const results = await mapLimit(list, 5, (p) => testProxy(p, { timeout: 12 }));
  for (const r of results) r.score = score(r);
  results.sort((a, b) => b.score - a.score);

  const w = Math.max(...results.map((r) => redact(r.proxy).length), 20);
  log.plain(`  ${'#'.padStart(3)}  ${'PROXY'.padEnd(w)}  ${'DIEM'.padStart(5)}  ${'TRE'.padStart(7)}  ${'LOAI'.padEnd(12)}  ISP`);
  log.plain(`  ${'-'.repeat(3)}  ${'-'.repeat(w)}  ${'-'.repeat(5)}  ${'-'.repeat(7)}  ${'-'.repeat(12)}  ${'-'.repeat(20)}`);

  results.forEach((r, i) => {
    const kind = !r.alive ? 'CHET' : classify(r);
    const isp = !r.alive ? r.error : `${r.isp} (${r.country})`;
    log.plain(
      `  ${String(i + 1).padStart(3)}  ${redact(r.proxy).padEnd(w)}  ` +
        `${String(r.alive ? r.score : '-').padStart(5)}  ${String(r.ms ? r.ms + 'ms' : '-').padStart(7)}  ` +
        `${kind.padEnd(12)}  ${(isp || '').slice(0, 45)}`
    );
  });

  const alive = results.filter((r) => r.alive);
  const residential = alive.filter((r) => classify(r) === 'residential');
  const best = residential[0] || alive.find((r) => classify(r) === 'nghi ngo') || alive[0];

  log.plain(`\n  Tong ket: ${alive.length}/${results.length} song, ${residential.length} residential that su.`);
  if (!best) {
    log.plain('  Khong co proxy nao dung duoc.\n');
    return null;
  }
  if (classify(best) !== 'residential') {
    log.plain('');
    log.plain('  ⚠️  CA LIST DEU LA IP DATACENTER, khong co cai nao residential.');
    log.plain('      twitterapi.io ghi ro trong docs: "use high-quality residential proxies".');
    log.plain('      Login vao X tu IP datacenter rat de an challenge hoac khoa tai khoan.');
    log.plain('      Nen doi sang goi ISP / static residential truoc khi chay that.');
  }
  log.plain(`\n  ➜ Nen dung cai nay, dan vao TW_PROXY trong .env:\n\n    TW_PROXY=${best.proxy}\n`);
  log.plain('  Chon 1 cai roi DUNG CO DINH. Doi proxy giua chung buoc bot login lai,');
  log.plain('  va nhieu lan login tu nhieu IP khac nhau la dau hieu X canh giac nhat.\n');
  return best;
}
