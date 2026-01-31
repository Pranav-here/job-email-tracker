import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { EmailMessage } from '../../../common/types/email.types';
import { JobApplication, ApplicationStatus } from '../../../common/types/job.types';
import { logger } from '../utils/logger';

export class AIService {
    private client: Anthropic;
    private systemPrompt = `
You are an expert recruitment data parser. Your goal is to extract structured job application data from emails.
Analyze the email content and determine:
1. Company Name
2. Role/Position Title
3. Status (Applied, Rejected, Interview, Offer, etc.)
4. Location (if mentioned)
5. Salary (if mentioned)

Return ONLY valid JSON matching this schema:
{
  "company": "string",
  "role": "string",
  "status": "Applied" | "Rejected" | "Interview" | "Offer" | "Withdrawn" | "Unknown",
  "location": "string | null",
  "salary": "string | null",
  "jobUrl": "string | null (URL to job post or application)"
}

Rules:
- If the email is a rejection (e.g., "not moving forward", "went with another candidate"), set status to "Rejected".
- If it's a new application confirmation, set status to "Applied".
- If it's an invitation for a preliminary chat, phone screen, or recruiter call, set status to "Phone Screen".
- If it's a coding challenge, technical screen, or system design round, set status to "Technical Interview".
- If it's a final round or onsite interview, set status to "Onsite Interview".
- If strict company name isn't clear, infer it from the sender email domain or context.
- Do not include explanations, only the JSON object.
`;

    constructor() {
        this.client = new Anthropic({
            apiKey: config.detailedAI.apiKey,
        });
    }

    async parseEmail(email: EmailMessage): Promise<JobApplication | null> {
        try {
            const content = `
Subject: ${email.subject}
From: ${email.from}
Body: 
${email.body.substring(0, 8000)} {/* Truncate to avoid context limit limits */}
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

            return {
                gmailMessageId: email.id,
                gmailThreadId: email.threadId,
                company: parsed.company || 'Unknown',
                role: parsed.role || 'Unknown',
                status: this.normalizeStatus(parsed.status),
                appliedDate: email.date,
                location: parsed.location || undefined,
                salary: parsed.salary || undefined,
                jobUrl: parsed.jobUrl || undefined,
            };

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
        if (s.includes('reject') || s.includes('decline')) return ApplicationStatus.REJECTED;
        if (s.includes('phone') || s.includes('screen') || s.includes('chat')) return ApplicationStatus.PHONE_SCREEN;
        if (s.includes('technical') || s.includes('coding') || s.includes('system design')) return ApplicationStatus.TECHNICAL_INTERVIEW;
        if (s.includes('onsite') || s.includes('final')) return ApplicationStatus.ONSITE_INTERVIEW;
        if (s.includes('interview')) return ApplicationStatus.TECHNICAL_INTERVIEW; // Default fallback
        if (s.includes('offer')) return ApplicationStatus.OFFER;
        if (s.includes('applied') || s.includes('received')) return ApplicationStatus.APPLIED;
        return ApplicationStatus.UNKNOWN;
    }
}

export const aiService = new AIService();
