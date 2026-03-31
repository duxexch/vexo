/**
 * Structured Logging Service
 * 
 * Provides production-grade logging with:
 * - Log levels (debug, info, warn, error, fatal)
 * - Structured context (JSON format)
 * - Request correlation IDs
 * - Error tracking with stack traces
 * - Performance metrics
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const LOG_DIR = process.env.LOG_DIR || './logs';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_LOG_FILES = 5; // keep 5 rotated files

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  action?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: LogLevel;
  private serviceName: string;
  private logStream: fs.WriteStream | null = null;
  private logFilePath: string = '';
  private currentLogSize: number = 0;

  constructor(serviceName: string = 'vex-platform') {
    this.serviceName = serviceName;
    this.minLevel = this.getLogLevelFromEnv();
    if (isProduction) {
      this.initFileLogging();
    }
  }

  private initFileLogging(): void {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
      this.logFilePath = path.join(LOG_DIR, 'app.log');
      this.currentLogSize = fs.existsSync(this.logFilePath)
        ? fs.statSync(this.logFilePath).size
        : 0;
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    } catch {
      // Silently fall back to console-only logging
    }
  }

  private rotateLogFile(): void {
    try {
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
      // Rotate: app.log.4 → delete, app.log.3 → .4, ... app.log → .1
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const src = `${this.logFilePath}${i === 1 ? '' : '.' + (i - 1)}`;
        const dst = `${this.logFilePath}.${i}`;
        if (i === 1) {
          // app.log → app.log.1
          if (fs.existsSync(this.logFilePath)) {
            fs.renameSync(this.logFilePath, dst);
          }
        } else {
          if (fs.existsSync(src)) {
            fs.renameSync(src, dst);
          }
        }
      }
      this.currentLogSize = 0;
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    } catch {
      // Fall back to console-only
    }
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    switch (level) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'FATAL': return LogLevel.FATAL;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatEntry(level: string, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      };
    }

    return entry;
  }

  private output(entry: LogEntry, level: LogLevel): void {
    const json = JSON.stringify(entry);
    
    if (level >= LogLevel.ERROR) {
      console.error(json);
    } else if (level >= LogLevel.WARN) {
      console.warn(json);
    } else {
      console.log(json);
    }

    // Write to rotated log file in production
    if (this.logStream) {
      const line = json + '\n';
      this.logStream.write(line);
      this.currentLogSize += Buffer.byteLength(line);
      if (this.currentLogSize >= MAX_LOG_SIZE) {
        this.rotateLogFile();
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.output(this.formatEntry('DEBUG', message, context), LogLevel.DEBUG);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.output(this.formatEntry('INFO', message, context), LogLevel.INFO);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.output(this.formatEntry('WARN', message, context), LogLevel.WARN);
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.output(this.formatEntry('ERROR', message, context, err), LogLevel.ERROR);
    }
  }

  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.output(this.formatEntry('FATAL', message, context, err), LogLevel.FATAL);
    }
  }

  // Financial operation logging with extra context
  financial(action: string, data: {
    userId: string;
    amount: string;
    type: string;
    sessionId?: string;
    result: 'success' | 'failure';
    error?: string;
  }): void {
    this.info(`Financial: ${action}`, {
      action,
      userId: data.userId,
      amount: data.amount,
      type: data.type,
      sessionId: data.sessionId,
      result: data.result,
      error: data.error
    });
  }

  // Game event logging
  game(event: string, data: {
    sessionId: string;
    gameType: string;
    players?: string[];
    action?: string;
    result?: unknown;
  }): void {
    this.info(`Game: ${event}`, {
      event,
      sessionId: data.sessionId,
      gameType: data.gameType,
      players: data.players,
      action: data.action,
      result: data.result
    });
  }

  // Security event logging
  security(event: string, data: {
    userId?: string;
    ip?: string;
    action: string;
    result: 'allowed' | 'blocked' | 'suspicious';
    reason?: string;
  }): void {
    const level = data.result === 'blocked' ? LogLevel.WARN : LogLevel.INFO;
    if (this.shouldLog(level)) {
      this.output(this.formatEntry(
        data.result === 'blocked' ? 'WARN' : 'INFO',
        `Security: ${event}`,
        data
      ), level);
    }
  }

  // Performance timing
  startTimer(label: string): () => number {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer: ${label}`, { label, duration });
      return duration;
    };
  }

  // Create a child logger with persistent context
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }
}

class ChildLogger {
  private parent: Logger;
  private baseContext: LogContext;

  constructor(parent: Logger, context: LogContext) {
    this.parent = parent;
    this.baseContext = context;
  }

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.baseContext, ...context };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.parent.error(message, error, this.mergeContext(context));
  }
}

// Singleton instance
export const logger = new Logger();

// Express middleware for request logging
export function requestLogger() {
  return (req: Record<string, unknown> & { headers: Record<string, string>; method: string; path: string; user?: { id: string }; ip: string; requestId?: string }, res: { setHeader: (k: string, v: string) => void; on: (event: string, cb: () => void) => void; statusCode: number }, next: () => void) => {
    const requestId = req.headers['x-request-id'] || 
                      `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      // Only log non-health endpoints to reduce noise
      if (req.path?.includes('/health')) {
        return;
      }
      
      const level = res.statusCode >= 500 ? 'error' : 
                    res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[level as 'info' | 'warn' | 'error'](`${req.method} ${req.path}`, {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
    });

    next();
  };
}

export default logger;
