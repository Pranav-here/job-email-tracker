import { describe, it, expect } from 'vitest';
import { isJobRelated } from '../../src/utils/email-classifier';
import { EmailMessage } from '../../src/types/email.types';

const buildEmail = (partial: Partial<EmailMessage>): EmailMessage => ({
    id: 'id',
    threadId: 'thread',
    subject: '',
    from: '',
    to: '',
    date: new Date(),
    body: '',
    snippet: '',
    ...partial,
});

describe('isJobRelated', () => {

    // ── Pattern A: strong subject keyword + strong sender keyword ──────────
    describe('Pattern A: ATS auto-responders', () => {
        it('passes an application confirmation from a careers address', () => {
            const email = buildEmail({
                subject: 'Your application has been received',
                from: 'no-reply@careers.acme.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });

        it('passes a hiring email with "position" in subject', () => {
            const email = buildEmail({
                subject: 'Open position: Senior Engineer',
                from: 'recruiting@bigtech.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });

        it('passes an email from Greenhouse with "candidate" in subject', () => {
            const email = buildEmail({
                subject: 'Candidate update',
                from: 'noreply@greenhouse.io',
            });
            expect(isJobRelated(email)).toBe(true);
        });
    });

    // ── Pattern B: "Thank you for applying" ────────────────────────────────
    describe('Pattern B: thank-you-for-applying subjects', () => {
        it('passes "Thank you for your application"', () => {
            const email = buildEmail({
                subject: 'Thank you for your application',
                from: 'hr@somecompany.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });

        it('passes "Thank you for applying to Acme"', () => {
            const email = buildEmail({
                subject: 'Thank you for applying to Acme Corp',
                from: 'jobs@acme.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });
    });

    // ── Pattern C: update / status + application ───────────────────────────
    describe('Pattern C: application update/status subjects', () => {
        it('passes "Update on your application"', () => {
            const email = buildEmail({
                subject: 'Update on your application at TechCo',
                from: 'recruiter@techco.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });

        it('passes "Status of your application"', () => {
            const email = buildEmail({
                subject: 'Status of your application',
                from: 'hr@startup.io',
            });
            expect(isJobRelated(email)).toBe(true);
        });
    });

    // ── Pattern D: interview invitation / schedule ─────────────────────────
    describe('Pattern D: interview invites', () => {
        it('passes an interview invitation subject', () => {
            const email = buildEmail({
                subject: 'Interview invitation for Software Engineer role',
                from: 'recruiter@company.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });

        it('passes an interview schedule subject', () => {
            const email = buildEmail({
                subject: 'Interview schedule confirmation',
                from: 'noreply@calendly.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });
    });

    // ── Pattern E: ATS sender + "application" in body ─────────────────────
    describe('Pattern E: ATS sender with application body', () => {
        it('passes when sender is from lever.co and body mentions application', () => {
            const email = buildEmail({
                subject: 'Next steps',
                from: 'noreply@hire.lever.co',
                body: 'Thank you for submitting your application. We will be in touch.',
            });
            expect(isJobRelated(email)).toBe(true);
        });

        it('passes when sender is from workday with application in body', () => {
            const email = buildEmail({
                subject: 'Important update',
                from: 'donotreply@myworkday.com',
                body: 'Your application has been reviewed.',
            });
            expect(isJobRelated(email)).toBe(true);
        });
    });

    // ── Negative: explicit block keywords ─────────────────────────────────
    describe('Negative: blocked by negative keywords', () => {
        it('filters out newsletters', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Weekly newsletter and digest',
                from: 'news@marketing.com',
                body: 'unsubscribe here',
            }))).toBe(false);
        });

        it('filters out password reset emails', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Reset password for your account',
                from: 'security@platform.com',
            }))).toBe(false);
        });

        it('filters out security alert emails', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Security alert: new login detected',
                from: 'alerts@google.com',
            }))).toBe(false);
        });

        it('filters out verification code emails', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Your verification code',
                from: 'noreply@accounts.com',
            }))).toBe(false);
        });

        it('filters out webinar promotional emails', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Join our webinar: Career Tips',
                from: 'promo@jobsite.com',
            }))).toBe(false);
        });
    });

    // ── Negative: job alert digest patterns ───────────────────────────────
    describe('Negative: job alert digests', () => {
        it('filters out "job alert" subjects', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Job alert: Software Engineer near you',
                from: 'alerts@linkedin.com',
            }))).toBe(false);
        });

        it('filters out "new jobs posted" subjects', () => {
            expect(isJobRelated(buildEmail({
                subject: 'New jobs posted matching your profile',
                from: 'noreply@indeed.com',
            }))).toBe(false);
        });

        it('filters out "recommended jobs" subjects', () => {
            expect(isJobRelated(buildEmail({
                subject: 'Recommended jobs for you this week',
                from: 'jobs@linkedin.com',
            }))).toBe(false);
        });

        it('filters out "jobs that match" subjects', () => {
            expect(isJobRelated(buildEmail({
                subject: '5 jobs that match your preferences',
                from: 'noreply@glassdoor.com',
            }))).toBe(false);
        });
    });

    // ── Edge cases ─────────────────────────────────────────────────────────
    describe('Edge cases', () => {
        it('returns false for a completely empty email', () => {
            expect(isJobRelated(buildEmail({}))).toBe(false);
        });

        it('is case-insensitive for subject keywords', () => {
            const email = buildEmail({
                subject: 'INTERVIEW INVITATION for your role',
                from: 'hr@company.com',
            });
            expect(isJobRelated(email)).toBe(true);
        });
    });
});
