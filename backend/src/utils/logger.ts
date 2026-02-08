type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
    private level: LogLevel;

    constructor() {
        this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    private formatMessage(level: LogLevel, message: string, meta?: any) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(meta && { meta }),
        });
    }

    info(message: string, meta?: any) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, meta));
        }
    }

    warn(message: string, meta?: any) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, meta));
        }
    }

    error(message: string, meta?: any) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, meta));
        }
    }

    debug(message: string, meta?: any) {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message, meta));
        }
    }
}

export const logger = new Logger();
