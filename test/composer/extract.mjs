// Rut nguyen van cac ham can test ra khoi userscript, de bai test chay dung
// code that chu khong phai mot ban chep tay da khac di.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', '..', 'browser-script', 'x-auto-poster.user.js');
// Windows checkout voi core.autocrlf=true ra CRLF: tach theo '\n' thi moi dong
// con duoi '\r' va dong ket thuc ham khong bao gio bang '  }'.
const src = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

export function grabFn(name) {
  const start = src.findIndex((l) =>
    new RegExp(`^  (async )?function ${name}\\(`).test(l));
  if (start < 0) throw new Error(`khong thay function ${name}`);
  const end = src.findIndex((l, i) => i > start && l === '  }');
  if (end < 0) throw new Error(`khong thay cuoi ${name}`);
  return src.slice(start, end + 1).join('\n');
}

export function grabConst(name) {
  // "= " roi gia tri, hoac "=" cuoi dong khi gia tri xuong dong ben duoi
  const start = src.findIndex((l) => new RegExp(`^  const ${name} =( |$)`).test(l));
  if (start < 0) throw new Error(`khong thay const ${name}`);
  let end = start;
  // Bo chu thich cuoi dong ("...;   // ghi chu") truoc khi tim dau ';' ket thuc
  while (!src[end].replace(/\s+\/\/ .*$/, '').trimEnd().endsWith(';')) end++;
  return src.slice(start, end + 1).join('\n');
}

const parts = [
  grabConst('sleep'),
  grabFn('until'),
  grabConst('isEmpty'),
  grabConst('paceFactor'),
  grabConst('pause'),
  grabFn('selectAllIn'),
  grabFn('pasteInto'),
  grabFn('cutAll'),
  grabFn('staysEmpty'),
  grabFn('clearComposer'),
  grabFn('typeInto'),
];

export const bundle = `
window.__bot = (function () {
  'use strict';
  // stub: trong script that day la trang thai va log cua bot
  const state = { settings: { slowMode: false } };
  window.__logs = [];
  function addLog(msg, kind) { window.__logs.push([kind || 'info', msg]); }

${parts.join('\n\n')}

  return { typeInto, clearComposer, pasteInto, cutAll, selectAllIn, isEmpty, state };
})();
`;

if (process.argv[2] === '--print') console.log(bundle);
