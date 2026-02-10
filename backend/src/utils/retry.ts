import { logger } from './logger';

interface RetryOptions {
    retries?: number;
    backoff?: number;
    factor?: number;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
    context: string = 'Operation'
): Promise<T> {
    const retries = options.retries ?? 3;
    const backoff = options.backoff ?? 1000;
    const factor = options.factor ?? 2;

    let attempt = 0;
    let lastError: any;

    while (attempt <= retries) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            attempt++;

            if (attempt > retries) {
                break;
            }

            const delay = backoff * Math.pow(factor, attempt - 1);

            logger.warn(`${context} failed. Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`, {
                error: error instanceof Error ? error.message : String(error)
            });

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}
