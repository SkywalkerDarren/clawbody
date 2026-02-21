type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

class Logger {
  private level: LogLevel = 'info';
  private entries: LogEntry[] = [];
  private maxEntries = 500;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setMaxEntries(max: number): void {
    this.maxEntries = max;
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clearEntries(): void {
    this.entries = [];
  }

  debug(module: string, message: string, data?: unknown): void {
    this.log('debug', module, message, data);
  }

  info(module: string, message: string, data?: unknown): void {
    this.log('info', module, message, data);
  }

  warn(module: string, message: string, data?: unknown): void {
    this.log('warn', module, message, data);
  }

  error(module: string, message: string, data?: unknown): void {
    this.log('error', module, message, data);
  }

  private log(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      module,
      message,
      data,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.print(entry);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private print(entry: LogEntry): void {
    const color = LOG_COLORS[entry.level];
    const time = entry.timestamp.toISOString().slice(11, 23);
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const moduleStr = entry.module.padEnd(12);

    let output = `${color}${time} ${levelStr}${RESET} [${moduleStr}] ${entry.message}`;

    if (entry.data !== undefined) {
      if (entry.data instanceof Error) {
        output += ` ${entry.data.message}`;
        if (entry.data.stack) {
          output += `\n${entry.data.stack}`;
        }
      } else {
        output += ` ${JSON.stringify(entry.data)}`;
      }
    }

    if (entry.level === 'error') {
      console.error(output);
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

// 单例导出
export const logger = new Logger();

// 从环境变量初始化日志级别
const envLevel = process.env['LOG_LEVEL']?.toLowerCase();
if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
  logger.setLevel(envLevel as LogLevel);
}
