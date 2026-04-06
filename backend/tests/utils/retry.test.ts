import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '../../src/utils/retry';

// Silence logger output during retry tests
vi.mock('../../src/utils/logger', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('withRetry', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Success paths ──────────────────────────────────────────────────────
    describe('success', () => {
        it('resolves immediately and calls fn exactly once on first success', async () => {
            const fn = vi.fn().mockResolvedValueOnce('result');
            const value = await withRetry(fn, { retries: 3, backoff: 0 });
            expect(value).toBe('result');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('succeeds after one failure (second attempt)', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('transient'))
                .mockResolvedValueOnce('ok');
            const value = await withRetry(fn, { retries: 3, backoff: 0 });
            expect(value).toBe('ok');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('succeeds on the last allowed attempt', async () => {
            // retries: 3 means up to 4 total calls (1 initial + 3 retries)
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockRejectedValueOnce(new Error('fail 3'))
                .mockResolvedValueOnce('finally');
            const value = await withRetry(fn, { retries: 3, backoff: 0 });
            expect(value).toBe('finally');
            expect(fn).toHaveBeenCalledTimes(4);
        });
    });

    // ── Failure paths ──────────────────────────────────────────────────────
    describe('exhausted retries', () => {
        it('throws the last error after exhausting all retries', async () => {
            const lastError = new Error('final failure');
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockRejectedValueOnce(new Error('fail 3'))
                .mockRejectedValueOnce(lastError);
            await expect(withRetry(fn, { retries: 3, backoff: 0 })).rejects.toThrow('final failure');
            expect(fn).toHaveBeenCalledTimes(4);
        });

        it('does not retry when retries is 0', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('immediate'));
            await expect(withRetry(fn, { retries: 0, backoff: 0 })).rejects.toThrow('immediate');
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });

    // ── Default options ────────────────────────────────────────────────────
    describe('default options', () => {
        it('uses 3 retries by default (4 total calls before throwing)', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('always fails'));
            // Override backoff to 0 via options to avoid real delays; retries defaults to 3
            await expect(withRetry(fn, { backoff: 0 })).rejects.toThrow();
            expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
        });
    });

    // ── Context label ──────────────────────────────────────────────────────
    describe('context label', () => {
        it('accepts a context string without throwing', async () => {
            const fn = vi.fn().mockResolvedValueOnce('value');
            const value = await withRetry(fn, { retries: 1, backoff: 0 }, 'test-operation');
            expect(value).toBe('value');
        });
    });
});
