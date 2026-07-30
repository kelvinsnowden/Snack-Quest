export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  requestId?: string;
  userId?: string;
  ip?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  event?: string;
  message: string;
  metadata?: Record<string, any>;
}

class Logger {
  private formatLog(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      requestId: entry.requestId || 'system',
      userId: entry.userId || null,
      ip: entry.ip || null,
      route: entry.route || null,
      method: entry.method || null,
      statusCode: entry.statusCode || null,
      durationMs: entry.durationMs || null,
      event: entry.event || 'general',
      message: entry.message,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    });
  }

  info(message: string, meta?: Record<string, any>, context?: Partial<LogEntry>) {
    console.log(
      this.formatLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        metadata: meta,
        ...context,
      })
    );
  }

  warn(message: string, meta?: Record<string, any>, context?: Partial<LogEntry>) {
    console.warn(
      this.formatLog({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message,
        metadata: meta,
        ...context,
      })
    );
  }

  error(message: string, meta?: Record<string, any>, context?: Partial<LogEntry>) {
    console.error(
      this.formatLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        message,
        metadata: meta,
        ...context,
      })
    );
  }

  payment(message: string, meta?: Record<string, any>, context?: Partial<LogEntry>) {
    this.info(`[PAYMENT] ${message}`, meta, { event: 'payment_event', ...context });
  }

  webhook(source: string, message: string, meta?: Record<string, any>, context?: Partial<LogEntry>) {
    this.info(`[WEBHOOK:${source}] ${message}`, meta, { event: `webhook_${source}`, ...context });
  }

  auth(message: string, meta?: Record<string, any>, context?: Partial<LogEntry>) {
    this.info(`[AUTH] ${message}`, meta, { event: 'auth_event', ...context });
  }
}

export const logger = new Logger();
