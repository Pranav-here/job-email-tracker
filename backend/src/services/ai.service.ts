import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { EmailMessage } from '../../../common/types/email.types';
import { JobApplication, ApplicationStatus, EventType } from '../../../common/types/job.types';
import { logger } from '../utils/logger';
import { extractCompanyName, extractUrl, normalizeLocation, normalizeSalary } from '../utils/parser-helpers';

export class AIService {
    private client: Anthropic;
    private systemPrompt = `
You are an expert recruitment data parser. Extract structured job application data from emails.
Return ONLY JSON shaped as:
{
  "company": "string",
  "role": "string",
  "status": "Applied" | "Interviewing" | "Offer" | "Rejected" | "Ghosted" | "Withdrawn" | "Unknown",
  "location": "string | null",
  "salary": "string | null",
  "jobUrl": "string | null"
}
Rules:
- If a field is absent, write "N/A" (do not invent or guess).
- Rejection phrasing ("not moving forward", "unfortunately") -> Rejected
- Invitation / scheduling / screen / interview / challenge -> Interviewing
- Offer / compensation -> Offer
- Only mark Ghosted if the email itself indicates ghosting/no response; otherwise leave as parsed.
- Receipt/confirmation only -> Applied
- Prefer sender domain when inferring company.
- Only output a single JSON object, no commentary, no code fences.
`;

    constructor() {
        this.client = new Anthropic({
            apiKey: config.detailedAI.apiKey,
        });
    }

    async parseEmail(email: EmailMessage): Promise<JobApplication | null> {
        try {
            const contentBody = (email.body || '').substring(0, 8000);
            const content = `
Subject: ${email.subject}
From: ${email.from}
Body:
${contentBody}
`;

            const response = await this.client.messages.create({
                model: config.detailedAI.model || 'claude-3-haiku-20240307',
                max_tokens: 1024,
                system: this.systemPrompt,
                messages: [{ role: 'user', content: content }],
            });

            // Type guard for the content block
            const textContent = response.content[0];
            if (textContent.type !== 'text') {
                logger.warn('Unexpected response format from Claude');
                return null;
            }

            const jsonStr = this.extractJson(textContent.text);
            if (!jsonStr) {
                logger.warn(`Failed to extract JSON from AI response for email ${email.id}`);
                return null;
            }

            const parsed = JSON.parse(jsonStr);

            const status = this.normalizeStatus(parsed.status);

            const location = this.pickValue(parsed.location, normalizeLocation(email.body));
            const salary = this.pickValue(parsed.salary, normalizeSalary(email.body));
            const jobUrl = this.pickValue(parsed.jobUrl, extractUrl(email.body));
            const company = this.pickValue(parsed.company, extractCompanyName(email.body, email.from));
            const role = this.pickValue(parsed.role, 'N/A');

            const result: JobApplication = {
                gmailMessageId: email.id,
                gmailThreadId: email.threadId,
                company,
                role,
                status,
                appliedDate: email.date,
                location,
                salary,
                jobUrl,
                lastEventType: this.mapEventType(status)
            };

            return result;

        } catch (error) {
            logger.error('Error parsing email with AI', { error });
            return null;
        }
    }

    private extractJson(text: string): string | null {
        const match = text.match(/\{[\s\S]*\}/);
        return match ? match[0] : null;
    }

    private normalizeStatus(status: string): ApplicationStatus {
        const s = status.toLowerCase();
        if (s.includes('reject') || s.includes('decline') || s.includes('unsuccessful')) return ApplicationStatus.REJECTED;
        if (s.includes('offer') || s.includes('compensation')) return ApplicationStatus.OFFER;
        if (s.includes('ghost')) return ApplicationStatus.GHOSTED;
        if (s.includes('withdraw')) return ApplicationStatus.WITHDRAWN;
        if (s.includes('interview') || s.includes('screen') || s.includes('challenge') || s.includes('onsite') || s.includes('assessment')) return ApplicationStatus.INTERVIEWING;
        if (s.includes('applied') || s.includes('received') || s.includes('submitted') || s.includes('application')) return ApplicationStatus.APPLIED;
        return ApplicationStatus.APPLIED;
    }

    private mapEventType(status: ApplicationStatus): EventType {
        switch (status) {
            case ApplicationStatus.OFFER:
                return EventType.OFFER;
            case ApplicationStatus.REJECTED:
                return EventType.REJECTION;
            case ApplicationStatus.INTERVIEWING:
                return EventType.INTERVIEW;
            case ApplicationStatus.GHOSTED:
                return EventType.STATUS_UPDATE;
            default:
                return EventType.APPLICATION_CONFIRMATION;
        }
    }

    private pickValue(primary: any, fallback: any): string {
        const cleanedPrimary = typeof primary === 'string' ? primary.trim() : '';
        if (cleanedPrimary && cleanedPrimary.toLowerCase() !== 'n/a') return cleanedPrimary;
        const cleanedFallback = typeof fallback === 'string' ? fallback.trim() : '';
        if (cleanedFallback) return cleanedFallback;
        return 'N/A';
    }
}

export const aiService = new AIService();
