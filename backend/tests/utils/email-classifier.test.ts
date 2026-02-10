import { describe, it, expect } from 'vitest';
import { isJobRelated } from '../../src/utils/email-classifier';
import { EmailMessage } from '../../../common/types/email.types';

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
    it('detects interview invitations', () => {
        const email = buildEmail({
            subject: 'Interview invitation for Software Engineer',
            from: 'recruiter@company.com',
            body: 'We would like to schedule an interview.',
        });
        expect(isJobRelated(email)).toBe(true);
    });

    it('filters out newsletters', () => {
        const email = buildEmail({
            subject: 'Weekly newsletter and digest',
            from: 'news@marketing.com',
            body: 'unsubscribe here',
        });
        expect(isJobRelated(email)).toBe(false);
    });
});
