import fs from 'node:fs';
import path from 'node:path';

/** Doc file .env vao process.env (khong ghi de bien da ton tai tu shell). */
export function loadEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    // Gia tri trong nhay: lay den nhay dong, phan con lai la comment.
    const quote = val[0] === '"' || val[0] === "'" ? val[0] : null;
    if (quote) {
      const end = val.indexOf(quote, 1);
      val = end === -1 ? val.slice(1) : val.slice(1, end);
    } else {
      // Gia tri rong, chi con comment -> rong.
      if (val.startsWith('#')) {
        val = '';
      } else {
        // Cat comment cuoi dong (dau # co khoang trang phia truoc).
        // Khong cat '#' dinh lien gia tri de mat khau chua '#' van dung.
        // Gia tri BAT DAU bang '#' thi phai dat trong nhay.
        const cut = val.search(/\s+#/);
        if (cut !== -1) val = val.slice(0, cut).trim();
      }
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
