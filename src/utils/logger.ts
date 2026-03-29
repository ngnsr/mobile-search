/**
 * Structured logger with __DEV__ gating.
 *
 * - In DEV builds: all levels print.
 * - In production builds: only warn/error print (via console.warn / console.error).
 * - Sensitive values should never be passed to any log level.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function fmt(level: LogLevel, tag: string, args: unknown[]): string {
  return `[${level.toUpperCase()}][${tag}] ${args.map(String).join(' ')}`;
}

export const Logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (__DEV__) {
      console.log(fmt('debug', tag, args));
    }
  },

  info: (tag: string, ...args: unknown[]) => {
    if (__DEV__) {
      console.log(fmt('info', tag, args));
    }
  },

  warn: (tag: string, ...args: unknown[]) => {
    console.warn(fmt('warn', tag, args));
  },

  error: (tag: string, ...args: unknown[]) => {
    console.error(fmt('error', tag, args));
  },
};
