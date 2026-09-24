const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

const stamp = () => new Date().toLocaleString('sv').replace('T', ' ');

function emit(level, icon, args) {
  if (LEVELS[level] < current) return;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(`${stamp()} ${icon}`, ...args);
}

export const log = {
  debug: (...a) => emit('debug', '·', a),
  info: (...a) => emit('info', 'ℹ', a),
  ok: (...a) => emit('info', '✅', a),
  warn: (...a) => emit('warn', '⚠️ ', a),
  error: (...a) => emit('error', '❌', a),
  plain: (...a) => console.log(...a),
};
