import { EmailMessage } from '../../../common/types/email.types';

export function isJobRelated(email: EmailMessage): boolean {
    const subject = email.subject.toLowerCase();
    const from = email.from.toLowerCase();
    const body = (email.body || email.snippet).toLowerCase();

    // 1. Strong signal keywords in Subject
    const strongSubjectKeywords = [
        'application', 'applied', 'interview', 'offer', 'candidate',
        'job', 'career', 'resume', 'cv', 'hiring', 'recruitment',
        'talent', 'position'
    ];

    // 2. Strong signal sender keywords
    const strongSenderKeywords = [
        'careers', 'jobs', 'talent', 'recruiting', 'recruitment',
        'hiring', 'hr', 'people', 'workday', 'greenhouse', 'lever',
        'ashby', 'bamboohr', 'smartrecruiters', 'jobvite'
    ];

    // 3. Negative keywords (spam, newsletters, etc.)
    const negativeKeywords = [
        'newsletter', 'digest', 'subscribe', 'webinar', 'marketing',
        'promo', 'verify your email', 'reset password', 'security alert',
        'signin', 'login', 'verification code'
    ];

    if (negativeKeywords.some(k => subject.includes(k) || from.includes(k))) {
        return false;
    }

    const hasSubjectKeyword = strongSubjectKeywords.some(k => subject.includes(k));
    const hasSenderKeyword = strongSenderKeywords.some(k => from.includes(k));

    // 4. Heuristics
    // A. Standard ATS auto-responders
    if (hasSubjectKeyword && hasSenderKeyword) return true;

    // B. "Thank you for applying" type subjects
    if (subject.includes('thank you') && (subject.includes('apply') || subject.includes('application'))) return true;

    // C. Rejection emails
    if (subject.includes('update') && subject.includes('application')) return true;
    if (subject.includes('status') && subject.includes('application')) return true;

    // D. Interview invites
    if (subject.includes('interview') && (subject.includes('invitation') || subject.includes('schedule'))) return true;

    // E. Explicit from ATS even if subject is vague
    if (hasSenderKeyword && body.includes('application')) return true;

    return false;
}
