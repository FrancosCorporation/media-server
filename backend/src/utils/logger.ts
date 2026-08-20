// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
const isDev = process.env.NODE_ENV !== 'production';

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

function timestamp() { return new Date().toISOString(); }

function colorize(level: string, msg: string): string {
  if (!isDev) return `[${timestamp()}] [${level}] ${msg}`;
  const c = level === 'ERROR' ? colors.red : level === 'WARN' ? colors.yellow : level === 'INFO' ? colors.cyan : colors.gray;
  return `${colors.gray}[${timestamp()}]${colors.reset} ${c}[${level}]${colors.reset} ${msg}`;
}

export const logger = {
  info: (c: string, m: string, d?: Record<string, unknown>) => console.log(colorize('INFO', `[${c}] ${m}${d ? ' ' + JSON.stringify(d) : ''}`)),
  warn: (c: string, m: string, d?: Record<string, unknown>) => console.warn(colorize('WARN', `[${c}] ${m}${d ? ' ' + JSON.stringify(d) : ''}`)),
  error: (c: string, m: string, d?: Record<string, unknown>) => console.error(colorize('ERROR', `[${c}] ${m}${d ? ' ' + JSON.stringify(d) : ''}`)),
};
