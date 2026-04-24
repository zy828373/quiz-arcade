import type { LogLevel } from '../config/app-config.ts';

type LogBindings = Record<string, unknown>;

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  minLevel: LogLevel;
  bindings: LogBindings;

  constructor(minLevel: LogLevel, bindings: LogBindings = {}) {
    this.minLevel = minLevel;
    this.bindings = bindings;
  }

  child(bindings: LogBindings): Logger {
    return new Logger(this.minLevel, { ...this.bindings, ...bindings });
  }

  debug(message: string, context: LogBindings = {}): void {
    this.write('debug', message, context);
  }

  info(message: string, context: LogBindings = {}): void {
    this.write('info', message, context);
  }

  warn(message: string, context: LogBindings = {}): void {
    this.write('warn', message, context);
  }

  error(message: string, context: LogBindings = {}): void {
    this.write('error', message, context);
  }

  write(level: LogLevel, message: string, context: LogBindings): void {
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[this.minLevel]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...context,
    };

    console.log(JSON.stringify(entry));
  }
}
