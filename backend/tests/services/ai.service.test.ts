import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplicationStatus, EventType } from '../../src/types/job.types';

// ── Hoist the mock function so it's available inside vi.mock factories ─────
const mockCreate = vi.hoisted(() => vi.fn());

// Mock Anthropic SDK before AIService is imported
vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
    })),
}));

// Make withRetry transparent — retry behaviour is covered in retry.test.ts
vi.mock('../../src/utils/retry', () => ({
    withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

// Silence logger output
vi.mock('../../src/utils/logger', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks are registered
import { AIService } from '../../src/services/ai.service';
import { EmailMessage } from '../../src/types/email.types';

// ── Helpers ────────────────────────────────────────────────────────────────
const buildEmail = (partial: Partial<EmailMessage> = {}): EmailMessage => ({
    id: 'msg-001',
    threadId: 'thread-001',
    subject: 'Your application at Acme',
    from: 'recruiting@acme.com',
    to: 'me@example.com',
    date: new Date('2024-03-01'),
    body: 'Thank you for applying to the Software Engineer role at Acme Corp.',
    snippet: 'Thank you for applying',
    ...partial,
});

const claudeResponse = (json: object) => ({
    content: [{ type: 'text', text: JSON.stringify(json) }],
});

// ── Tests ──────────────────────────────────────────────────────────────────
describe('AIService.parseEmail', () => {
    let service: AIService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AIService();
    });

    // ── Valid parse ────────────────────────────────────────────────────────
    describe('valid response', () => {
        it('returns a JobApplication with correct company and role', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Acme', role: 'Software Engineer',
                status: 'Applied', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));

            const result = await service.parseEmail(buildEmail());
            expect(result).not.toBeNull();
            expect(result!.company).toBe('Acme');
            expect(result!.role).toBe('Software Engineer');
            expect(result!.status).toBe(ApplicationStatus.APPLIED);
        });

        it('sets gmailMessageId and gmailThreadId from the email', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'TechCo', role: 'Engineer',
                status: 'Applied', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));

            const email = buildEmail({ id: 'msg-xyz', threadId: 'thread-xyz' });
            const result = await service.parseEmail(email);
            expect(result!.gmailMessageId).toBe('msg-xyz');
            expect(result!.gmailThreadId).toBe('thread-xyz');
        });

        it('sets appliedDate from the email date', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Corp', role: 'Dev',
                status: 'Applied', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));
            const date = new Date('2024-06-15');
            const result = await service.parseEmail(buildEmail({ date }));
            expect(result!.appliedDate).toEqual(date);
        });
    });

    // ── Status normalisation ───────────────────────────────────────────────
    describe('status normalisation', () => {
        const statusCases: Array<[string, ApplicationStatus, EventType]> = [
            ['Rejected',     ApplicationStatus.REJECTED,     EventType.REJECTION],
            ['Interviewing', ApplicationStatus.INTERVIEWING, EventType.INTERVIEW],
            ['Offer',        ApplicationStatus.OFFER,        EventType.OFFER],
            ['Ghosted',      ApplicationStatus.GHOSTED,      EventType.STATUS_UPDATE],
            ['Applied',      ApplicationStatus.APPLIED,      EventType.APPLICATION_CONFIRMATION],
        ];

        it.each(statusCases)('maps Claude status "%s" → %s', async (claudeStatus, expectedStatus, expectedEvent) => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Corp', role: 'Dev',
                status: claudeStatus, location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));
            const result = await service.parseEmail(buildEmail());
            expect(result!.status).toBe(expectedStatus);
            expect(result!.lastEventType).toBe(expectedEvent);
        });

        it('defaults to Applied for an unrecognised status string', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Corp', role: 'Dev',
                status: 'PendingReview', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));
            const result = await service.parseEmail(buildEmail());
            expect(result!.status).toBe(ApplicationStatus.APPLIED);
        });
    });

    // ── Null / skip cases ──────────────────────────────────────────────────
    describe('null returns', () => {
        it('returns null when role is N/A (the effective null guard)', async () => {
            // The role fallback in pickValue is the literal string 'N/A', so isNa()
            // fires reliably. This is the primary path that produces null.
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Acme', role: 'N/A',
                status: 'Applied', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));
            expect(await service.parseEmail(buildEmail())).toBeNull();
        });

        it('uses domain fallback when Claude returns N/A for company', async () => {
            // pickValue falls back to extractCompanyName(body, from).
            // 'recruiting@acme.com' → domain 'acme' → 'Acme' overrides Claude's N/A.
            // Result is NOT null — the fallback rescues the record.
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'N/A', role: 'Engineer',
                status: 'Applied', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));
            const result = await service.parseEmail(buildEmail()); // from: recruiting@acme.com
            expect(result).not.toBeNull();
            expect(result!.company).toBe('Acme');
        });

        it('produces "Unknown Company" when both Claude and domain fallback fail', async () => {
            // extractCompanyName always returns at least 'Unknown Company'; isNa()
            // does NOT block it, so the record is created rather than skipped.
            // This documents a known limitation: the company guard is effectively
            // bypassed by the fallback.
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'N/A', role: 'Engineer',
                status: 'Applied', location: 'N/A', salary: 'N/A', jobUrl: 'N/A',
            }));
            const email = buildEmail({ from: 'someone@gmail.com', body: 'no info here' });
            const result = await service.parseEmail(email);
            expect(result).not.toBeNull();
            expect(result!.company).toBe('Unknown Company');
        });

        it('returns null when Claude returns malformed JSON', async () => {
            mockCreate.mockResolvedValueOnce({
                content: [{ type: 'text', text: 'Sorry, I cannot parse this email.' }],
            });
            expect(await service.parseEmail(buildEmail())).toBeNull();
        });

        it('returns null when the API call throws', async () => {
            mockCreate.mockRejectedValueOnce(new Error('Anthropic API error'));
            expect(await service.parseEmail(buildEmail())).toBeNull();
        });

        it('returns null when content block is not a text type', async () => {
            mockCreate.mockResolvedValueOnce({
                content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
            });
            expect(await service.parseEmail(buildEmail())).toBeNull();
        });
    });

    // ── Field extraction ───────────────────────────────────────────────────
    describe('optional field extraction', () => {
        it('passes through a non-N/A location from Claude', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Corp', role: 'Dev',
                status: 'Applied', location: 'San Francisco, CA', salary: 'N/A', jobUrl: 'N/A',
            }));
            const result = await service.parseEmail(buildEmail());
            expect(result!.location).toBe('San Francisco, CA');
        });

        it('passes through a salary range from Claude', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Corp', role: 'Dev',
                status: 'Applied', location: 'N/A', salary: '$100,000 - $130,000', jobUrl: 'N/A',
            }));
            const result = await service.parseEmail(buildEmail());
            expect(result!.salary).toBe('$100,000 - $130,000');
        });

        it('passes through a job URL from Claude', async () => {
            mockCreate.mockResolvedValueOnce(claudeResponse({
                company: 'Corp', role: 'Dev',
                status: 'Applied', location: 'N/A', salary: 'N/A',
                jobUrl: 'https://boards.greenhouse.io/corp/jobs/123',
            }));
            const result = await service.parseEmail(buildEmail());
            expect(result!.jobUrl).toBe('https://boards.greenhouse.io/corp/jobs/123');
        });
    });
});
