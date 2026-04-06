import { describe, it, expect } from 'vitest';
import {
    extractUrl,
    normalizeSalary,
    normalizeLocation,
    extractCompanyName,
    extractDate,
} from '../../src/utils/parser-helpers';

// ── extractUrl ─────────────────────────────────────────────────────────────
describe('extractUrl', () => {
    it('returns null for empty input', () => {
        expect(extractUrl('')).toBeNull();
    });

    it('returns null when no URL is present', () => {
        expect(extractUrl('Thank you for applying. No links here.')).toBeNull();
    });

    it('returns the URL when exactly one is present', () => {
        const text = 'View your application at https://acme.com/jobs/123';
        expect(extractUrl(text)).toBe('https://acme.com/jobs/123');
    });

    it('prefers a Greenhouse URL over a generic URL', () => {
        const text = 'Visit https://acme.com for info. Apply at https://boards.greenhouse.io/acme/jobs/456';
        expect(extractUrl(text)).toBe('https://boards.greenhouse.io/acme/jobs/456');
    });

    it('prefers a Lever URL over a generic URL', () => {
        const text = 'See https://acme.com and apply at https://jobs.lever.co/acme/role';
        expect(extractUrl(text)).toBe('https://jobs.lever.co/acme/role');
    });

    it('prefers an Indeed URL over a plain URL', () => {
        const text = 'Posted at https://indeed.com/job/123 and also at https://acme.com/careers';
        expect(extractUrl(text)).toBe('https://indeed.com/job/123');
    });

    it('returns the first URL when no job-board URL is present', () => {
        const text = 'Visit https://first.com and https://second.com';
        expect(extractUrl(text)).toBe('https://first.com');
    });
});

// ── normalizeSalary ────────────────────────────────────────────────────────
describe('normalizeSalary', () => {
    it('returns null for empty input', () => {
        expect(normalizeSalary('')).toBeNull();
    });

    it('formats a dollar range correctly', () => {
        expect(normalizeSalary('The salary is $100,000 - $150,000 per year.')).toBe('$100,000 - $150,000');
    });

    it('formats a numeric range with "per year"', () => {
        expect(normalizeSalary('90,000 - 120,000 per year')).toBe('$90,000 - $120,000');
    });

    it('handles k notation (e.g. $150k)', () => {
        expect(normalizeSalary('Compensation: $150k')).toBe('$150000');
    });

    it('returns a truncated fallback string when no salary pattern matches', () => {
        const result = normalizeSalary('We offer competitive compensation.');
        expect(typeof result).toBe('string');
        expect((result as string).length).toBeLessThanOrEqual(100);
    });
});

// ── normalizeLocation ──────────────────────────────────────────────────────
describe('normalizeLocation', () => {
    it('returns null for empty input', () => {
        expect(normalizeLocation('')).toBeNull();
    });

    it('extracts a City, ST pattern', () => {
        const result = normalizeLocation('This role is based in San Francisco, CA.');
        expect(result).toContain('San Francisco');
        expect(result).toContain('CA');
    });

    it('extracts Remote from body text', () => {
        const result = normalizeLocation('This is a Remote position.');
        expect(result).toBe('Remote');
    });

    it('extracts Hybrid from body text', () => {
        const result = normalizeLocation('The role is Hybrid, based in New York.');
        expect(result).toBe('Hybrid');
    });

    it('returns a string for text with no recognisable location (truncated fallback)', () => {
        const result = normalizeLocation('No location info here at all.');
        expect(typeof result).toBe('string');
    });
});

// ── extractCompanyName ─────────────────────────────────────────────────────
describe('extractCompanyName', () => {
    it('extracts company name from a professional domain', () => {
        expect(extractCompanyName('', 'recruiter@acme.com')).toBe('Acme');
    });

    it('capitalises the extracted domain', () => {
        expect(extractCompanyName('', 'hr@google.com')).toBe('Google');
    });

    it('ignores generic email domains and falls back to text pattern', () => {
        // gmail is blocked; comma after company name stops the greedy regex
        const body = 'We at TechCorp Inc, and we would like to interview you.';
        const result = extractCompanyName(body, 'someone@gmail.com');
        expect(result).toBe('TechCorp Inc');
    });

    it('ignores noreply domain and falls back to text pattern', () => {
        const body = 'Thank you from Startup LLC for applying.';
        const result = extractCompanyName(body, 'noreply@noreply.com');
        // noreply is in the exclusion list; should fall through
        expect(typeof result).toBe('string');
    });

    it('returns "Unknown Company" when no domain or pattern matches', () => {
        expect(extractCompanyName('No company info.', 'user@gmail.com')).toBe('Unknown Company');
    });
});

// ── extractDate ────────────────────────────────────────────────────────────
describe('extractDate', () => {
    it('returns null for empty input', () => {
        expect(extractDate('')).toBeNull();
    });

    it('returns null when no date is present', () => {
        expect(extractDate('Thank you for your interest.')).toBeNull();
    });

    it('parses a MM/DD/YYYY date', () => {
        const result = extractDate('Interview on 04/15/2024');
        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(2024);
    });

    it('parses a Month DD, YYYY date', () => {
        const result = extractDate('We met on January 5, 2024');
        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(2024);
    });

    it('parses a YYYY-MM-DD date', () => {
        const result = extractDate('Start date: 2024-03-01');
        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(2024);
    });
});
