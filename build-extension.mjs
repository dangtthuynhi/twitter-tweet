/**
 * Sinh chrome-extension/content.js tu userscript.
 * Giu mot nguon duy nhat: sua browser-script/x-auto-poster.user.js roi chay lai file nay.
 */
import fs from 'node:fs';

const SRC = 'browser-script/x-auto-poster.user.js';
const OUT = 'chrome-extension/content.js';

const src = fs.readFileSync(SRC, 'utf8');
const body = src.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/, '');

fs.writeFileSync(
  OUT,
  `// Sinh tu ${SRC} — DUNG SUA TRUC TIEP FILE NAY.\n` +
    `// Sua o file goc roi chay: node build-extension.mjs\n\n` +
    body
);

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`${OUT} <- ${SRC}  (${kb} KB)`);
