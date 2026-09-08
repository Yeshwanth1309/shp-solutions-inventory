import { getEnv } from './env';

/**
 * Structured JSON logging. Fields listed in REDACTED never appear in output,
 * whatever the caller passes.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACTED = new Set([
  'password',
  'passwordhash',
  'confirmpassword',
  'currentpassword',
  'newpassword',
  'token',
  'tokenhash',
  'secret',
  'secretciphertext',
  'authsecret',
  'mfasecret',
  'totp',
  'code',
  'recoverycode',
  'authorization',
  'cookie',
  'sessiontoken',
  'clientsecret',
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED.has(key.toLowerCase().replace(/[_-]/g, '')) ? '[redacted]' : scrub(val, depth + 1);
  }
  return out;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  event?: string;
  [key: string]: unknown;
}

function threshold(): number {
  try {
    return ORDER[getEnv().LOG_LEVEL];
  } catch {
    return ORDER.info;
  }
}

function emit(level: Level, message: string, context: LogContext = {}): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(scrub(context) as LogContext),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, c?: LogContext) => emit('debug', m, c),
  info: (m: string, c?: LogContext) => emit('info', m, c),
  warn: (m: string, c?: LogContext) => emit('warn', m, c),
  error: (m: string, c?: LogContext) => emit('error', m, c),
};
