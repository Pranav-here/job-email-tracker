import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { EmailMessage } from '../../../common/types/email.types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isJobRelated } from '../utils/email-classifier';
import { withRetry } from '../utils/retry';
import { htmlToText } from 'html-to-text';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
export const DEFAULT_LOOKBACK_HOURS = 24; // 24 hours

export class GmailService {
    private auth: OAuth2Client;
    private gmail: any;
    private maxMessages = 500; // cap per run to prevent runaway API calls
    private detailConcurrency = 8;

    constructor() {
        this.auth = new google.auth.OAuth2(
            config.gmail.clientId,
            config.gmail.clientSecret,
            config.gmail.redirectUri
        );
    }

    async initialize() {
        await this.loadCredentials();
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
    }

    private async loadCredentials() {
        // 1. Try local file (Development) - PREFERRED if exists
        if (fs.existsSync(TOKEN_PATH)) {
            try {
                const content = fs.readFileSync(TOKEN_PATH, 'utf-8');
                const tokens = JSON.parse(content);
                this.auth.setCredentials(tokens);
                logger.info('Using Gmail credentials from local token.json');
                return;
            } catch (err) {
                logger.warn('Failed to read local token.json, falling back to env vars');
            }
        }

        // 2. Try environment variable (Production/Vercel)
        if (process.env.GMAIL_REFRESH_TOKEN) {
            this.auth.setCredentials({
                refresh_token: process.env.GMAIL_REFRESH_TOKEN,
            });
            return;
        }

        throw new Error('No Gmail credentials found. Run setup script or set GMAIL_REFRESH_TOKEN.');
    }

    async fetchRecentEmails(hours: number = DEFAULT_LOOKBACK_HOURS): Promise<EmailMessage[]> {
        if (!this.gmail) await this.initialize();

        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);
        const seconds = Math.floor(cutoff.getTime() / 1000);

        const query = this.buildAdvancedQuery(seconds);

        try {
            const messages = await this.listMessages(query);
            const emails: EmailMessage[] = [];

            for (let i = 0; i < messages.length; i += this.detailConcurrency) {
                const batch = messages.slice(i, i + this.detailConcurrency);
                const details = await Promise.all(
                    batch.map((msg) => (msg.id ? this.getMessageDetails(msg.id) : Promise.resolve(null)))
                );

                for (const detail of details) {
                    if (detail && isJobRelated(detail)) {
                        emails.push(detail);
                    }
                }
            }

            logger.info(`Fetched ${emails.length} relevant emails from last ${hours} hours`);
            return emails;

        } catch (error) {
            logger.error('Error fetching emails', { error });
            throw error;
        }
    }

    private async listMessages(query: string) {
        const messages: any[] = [];
        let pageToken: string | undefined = undefined;

        do {
            const res = await withRetry(
                () =>
                    this.gmail.users.messages.list({
                        userId: 'me',
                        q: query,
                        maxResults: 100,
                        pageToken,
                    }),
                { retries: 2, backoff: 500, factor: 2 },
                'gmail.listMessages'
            );

            if (res.data.messages) {
                messages.push(...res.data.messages);
            }

            pageToken = res.data.nextPageToken;
        } while (pageToken && messages.length < this.maxMessages);

        return messages.slice(0, this.maxMessages);
    }

    private buildAdvancedQuery(afterTimestamp: number): string {
        const terms = [
            `after:${afterTimestamp}`,
            '(',
            'subject:(application OR applied OR interview OR offer OR reject OR screening OR candidate)',
            'OR from:(careers OR jobs OR talent OR recruiting OR noreply OR greenhouse OR lever OR workday)',
            'OR (application AND (received OR confirmed OR submitted))',
            ')',
            '-subject:(newsletter OR unsubscribe OR digest OR promo OR webinar)',
        ];

        return terms.join(' ');
    }


    private async getMessageDetails(id: string): Promise<EmailMessage | null> {
        try {
            const res = await withRetry(
                () =>
                    this.gmail.users.messages.get({
                        userId: 'me',
                        id: id,
                        format: 'full',
                    }),
                { retries: 2, backoff: 500, factor: 2 },
                'gmail.getMessage'
            );

            const payload = res.data.payload;
            const headers = payload?.headers;

            const subject = headers?.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
            const from = headers?.find((h: any) => h.name === 'From')?.value || 'Unknown';
            const to = headers?.find((h: any) => h.name === 'To')?.value || 'Unknown';
            const dateStr = headers?.find((h: any) => h.name === 'Date')?.value;
            const date = dateStr ? new Date(dateStr) : new Date();

            let body = '';
            if (payload?.body?.data) {
                body = this.toPlainText(this.decodeBody(payload.body.data), payload.mimeType);
            } else if (payload?.parts) {
                body = this.extractBodyFromParts(payload.parts);
            }

            return {
                id: res.data.id!,
                threadId: res.data.threadId!,
                subject,
                from,
                to,
                date,
                body,
                snippet: res.data.snippet || '',
            };

        } catch (error) {
            logger.warn(`Failed to fetch email details for ${id}`, { error });
            return null;
        }
    }

    private extractBodyFromParts(parts: any[]): string {
        for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return this.decodeBody(part.body.data);
            }

            if (part.parts) {
                const nestedBody = this.extractBodyFromParts(part.parts);
                if (nestedBody) return nestedBody;
            }
        }

        for (const part of parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                return this.toPlainText(this.decodeBody(part.body.data), 'text/html');
            }
        }

        if (parts[0]?.body?.data) {
            return this.toPlainText(this.decodeBody(parts[0].body.data), parts[0].mimeType);
        }

        return '';
    }

    private decodeBody(data: string): string {
        const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
        const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
        return Buffer.from(normalized + '='.repeat(padding), 'base64').toString('utf-8');
    }

    private toPlainText(content: string, mimeType?: string): string {
        if (mimeType && mimeType.includes('html')) {
            return htmlToText(content, {
                wordwrap: false,
                selectors: [
                    { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
                ],
            }).trim();
        }
        return content;
    }
}

export const gmailService = new GmailService();
