import { describe, it, expect } from 'vitest';
import { shouldMarkGhosted } from '../../src/utils/ghosting';

const mockRecord = (fields: Record<string, any>) => ({
    get: (key: string) => fields[key],
});

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('shouldMarkGhosted', () => {

    // ── Basic threshold behaviour ──────────────────────────────────────────
    describe('threshold boundary', () => {
        it('returns true when last activity exceeds threshold', () => {
            const record = mockRecord({ 'Last Email Date': daysAgo(60) });
            expect(shouldMarkGhosted(record, daysAgo(60), 45)).toBe(true);
        });

        it('returns false when recent activity is within threshold', () => {
            const record = mockRecord({ 'Last Status Change Date': daysAgo(10) });
            expect(shouldMarkGhosted(record, daysAgo(10), 45)).toBe(false);
        });

        it('returns true at exactly the threshold (>= semantics)', () => {
            // Exactly 45 days ago (allow 1s slack for test execution time)
            const record = mockRecord({ 'Last Email Date': daysAgo(45) });
            expect(shouldMarkGhosted(record, daysAgo(45), 45)).toBe(true);
        });

        it('returns false at one day short of the threshold', () => {
            const record = mockRecord({ 'Last Email Date': daysAgo(44) });
            expect(shouldMarkGhosted(record, daysAgo(44), 45)).toBe(false);
        });
    });

    // ── Fallback date behaviour ────────────────────────────────────────────
    describe('fallback email date', () => {
        it('uses fallback email date when all record dates are missing', () => {
            const record = mockRecord({});
            expect(shouldMarkGhosted(record, daysAgo(50), 45)).toBe(true);
        });

        it('returns false via fallback when fallback is recent', () => {
            const record = mockRecord({});
            expect(shouldMarkGhosted(record, daysAgo(5), 45)).toBe(false);
        });
    });

    // ── Multiple date fields: picks the most recent ───────────────────────
    describe('multiple date fields', () => {
        it('returns false when the most recent date is within threshold, even if older dates exceed it', () => {
            const record = mockRecord({
                'Last Status Change Date': daysAgo(90), // old – would trigger alone
                'Last Email Date': daysAgo(10),         // recent – should win
            });
            expect(shouldMarkGhosted(record, daysAgo(90), 45)).toBe(false);
        });

        it('returns true when all available dates exceed threshold', () => {
            const record = mockRecord({
                'Last Status Change Date': daysAgo(60),
                'Last Email Date': daysAgo(50),
                'Email Date': daysAgo(55),
            });
            expect(shouldMarkGhosted(record, daysAgo(60), 45)).toBe(true);
        });

        it('prefers the most recent date across all three record fields', () => {
            const record = mockRecord({
                'Last Status Change Date': daysAgo(80),
                'Last Email Date': daysAgo(70),
                'Email Date': daysAgo(20), // most recent – within threshold
            });
            expect(shouldMarkGhosted(record, daysAgo(80), 45)).toBe(false);
        });
    });

    // ── Invalid / missing data ─────────────────────────────────────────────
    describe('invalid dates', () => {
        it('ignores invalid date strings and falls back to fallbackEmailDate', () => {
            const record = mockRecord({ 'Last Email Date': 'not-a-date' });
            expect(shouldMarkGhosted(record, daysAgo(50), 45)).toBe(true);
        });

        it('returns false when all dates are invalid and fallback is recent', () => {
            const record = mockRecord({
                'Last Status Change Date': 'invalid',
                'Last Email Date': null,
            });
            expect(shouldMarkGhosted(record, daysAgo(5), 45)).toBe(false);
        });
    });

    // ── Custom threshold ───────────────────────────────────────────────────
    describe('custom thresholdDays', () => {
        it('respects a custom 30-day threshold', () => {
            const record = mockRecord({ 'Last Email Date': daysAgo(35) });
            expect(shouldMarkGhosted(record, daysAgo(35), 30)).toBe(true);
        });

        it('does not ghost when within a custom 60-day threshold', () => {
            const record = mockRecord({ 'Last Email Date': daysAgo(45) });
            expect(shouldMarkGhosted(record, daysAgo(45), 60)).toBe(false);
        });
    });
});
