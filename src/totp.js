import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Giai ma base32 (RFC 4648), bo qua khoang trang va dau '=' */
export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Ky tu khong hop le trong base32: "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Sinh ma TOTP 6 so (RFC 6238, SHA-1, chu ky 30s) */
export function totp(secret, at = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, '0');
}

/** Kiem tra secret co dung dinh dang khong, kem chan doan loi thuong gap. */
export function validateSecret(secret) {
  const s = String(secret || '').trim();
  if (!s) return { ok: false, reason: 'trong' };
  if (/^\d{6}$/.test(s)) {
    return { ok: false, reason: 'day la MA 6 SO hien tren app, khong phai secret. Can chuoi base32 luc quet QR.' };
  }
  if (s.startsWith('otpauth://')) {
    const m = s.match(/[?&]secret=([^&]+)/i);
    return m
      ? { ok: true, extracted: m[1], reason: 'lay secret tu URI otpauth' }
      : { ok: false, reason: 'URI otpauth nhung khong tim thay tham so secret' };
  }
  const clean = s.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z2-7]+=*$/.test(clean)) {
    return { ok: false, reason: 'khong phai base32 hop le (chi duoc A-Z va 2-7)' };
  }
  if (clean.length < 16) return { ok: false, reason: `qua ngan (${clean.length} ky tu, thuong la 16 hoac 32)` };
  return { ok: true, reason: `base32 hop le, ${clean.length} ky tu` };
}
