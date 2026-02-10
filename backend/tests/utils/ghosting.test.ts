import { describe, it, expect } from 'vitest';
import { shouldMarkGhosted } from '../../src/utils/ghosting';

const mockRecord = (fields: Record<string, any>) => ({
    get: (key: string) => fields[key],
});

describe('shouldMarkGhosted', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    it('returns true when last activity exceeds threshold', () => {
        const record = mockRecord({ 'Last Email Date': daysAgo(60) });
        expect(shouldMarkGhosted(record, daysAgo(60), 45)).toBe(true);
    });

    it('returns false when recent activity is within threshold', () => {
        const record = mockRecord({ 'Last Status Change Date': daysAgo(10) });
        expect(shouldMarkGhosted(record, daysAgo(10), 45)).toBe(false);
    });

    it('uses fallback email date when record dates are missing', () => {
        const record = mockRecord({});
        expect(shouldMarkGhosted(record, daysAgo(50), 45)).toBe(true);
    });
});
