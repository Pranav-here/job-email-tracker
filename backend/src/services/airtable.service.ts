import Airtable from 'airtable';
import { config } from '../config';
import { JobApplication, ApplicationStatus, EventType } from '../../../common/types/job.types';
import { logger } from '../utils/logger';

export class AirtableService {
    private base: Airtable.Base;
    private table: Airtable.Table<any>;

    constructor() {
        this.base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.baseId);
        this.table = this.base(config.airtable.tableName);
    }

    private escapeFormulaValue(value: string): string {
        return value.replace(/"/g, '\\"');
    }

    async findPotentialDuplicate(app: JobApplication): Promise<Airtable.Record<any> | null> {
        // Conservative heuristic: only match on exact Job URL when threadId is absent.
        if (!app.jobUrl || app.jobUrl.toLowerCase() === 'n/a') return null;

        const result = await this.table
            .select({
                filterByFormula: `{Job URL} = "${this.escapeFormulaValue(app.jobUrl)}"`,
                maxRecords: 1,
            })
            .firstPage();
        return result[0] || null;
    }

    async createOrUpdateApplication(
        app: JobApplication,
        emailMeta?: { subject: string; from: string; date: Date },
        existingRecord?: Airtable.Record<any>
    ): Promise<{ action: 'created' | 'updated' | 'skipped'; reason?: string }> {
        try {
            // 1. Check for duplicate using provided record, thread ID, or other heuristics (Job URL, Company+Role)
            let record =
                existingRecord ||
                (await this.findRecordByThreadId(app.gmailThreadId)) ||
                (await this.findPotentialDuplicate(app));

            const status = this.mapStatus(app.status);
            const eventType = this.mapEventType(app.lastEventType);
            const today = this.formatDate(new Date());
            const emailDate = this.formatDate(emailMeta?.date || app.appliedDate);
            const subject = emailMeta?.subject || '';
            const from = emailMeta?.from || '';

            if (record) {
                // UPDATE existing record
                const currentStatus = record.get('Status') as string | undefined;

                const updates: any = {};
                let hasUpdates = false;

                // Status Update
                if (status && this.shouldUpdateStatus(currentStatus, status)) {
                    updates['Status'] = status;
                    updates['Last Status Change Date'] = emailDate;
                    updates['Last Event Type'] = eventType;
                    hasUpdates = true;
                }

                // Data Enrichment (only if currently empty but new data exists)
                if (!record.get('Location') && app.location) {
                    updates['Location'] = app.location;
                    hasUpdates = true;
                }
                if (!record.get('Job URL') && app.jobUrl) {
                    updates['Job URL'] = app.jobUrl;
                    hasUpdates = true;
                }
                if (!record.get('Salary Range') && app.salary) {
                    updates['Salary Range'] = app.salary;
                    hasUpdates = true;
                }

                // Always update latest email metadata
                updates['Last Email Date'] = emailDate;
                updates['Last Email Subject'] = subject;
                updates['Last Email From'] = from;
                updates['Last Updated'] = today;

                // Track message ids history
                const existingIdsRaw = (record.get('Gmail Message IDs') as string) || '';
                const idSet = new Set(
                    existingIdsRaw
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean)
                );
                idSet.add(app.gmailMessageId);
                updates['Gmail Message IDs'] = Array.from(idSet).join(', ');

                // Timeline text / status history
                const historyEntry = `${emailDate} - ${status || 'Applied'}${subject ? ` | ${subject}` : ''}`.trim();
                const priorHistory = (record.get('Status History') as string) || '';
                const historyLines = priorHistory ? priorHistory.split('\n') : [];
                if (!historyLines.includes(historyEntry)) {
                    updates['Status History'] = priorHistory ? `${priorHistory}\n${historyEntry}` : historyEntry;
                    updates['Timeline Text'] = updates['Status History'];
                }

                logger.info(`Updating record for ${app.company}: ${JSON.stringify(updates)}`);
                await this.table.update(record.id, updates);
                return { action: 'updated' };
            }

            // 2. Create NEW record
            await this.table.create([
                {
                    fields: {
                        'Email ID': app.gmailMessageId,
                        'Email Subject': subject,
                        'Email Date': emailDate,
                        'Company': app.company,
                        'Role': app.role,
                        'Status': status || ApplicationStatus.APPLIED,
                        'Date Applied': this.formatDate(app.appliedDate), // YYYY-MM-DD
                        'Location': app.location || '',
                        'Salary Range': app.salary || '',
                        'Job URL': app.jobUrl || '',
                        'Gmail Message ID': app.gmailMessageId,
                        'Gmail Thread ID': app.gmailThreadId,
                        'Gmail Message IDs': app.gmailMessageId,
                        'Last Email Date': emailDate,
                        'Last Email Subject': subject,
                        'Last Email From': from,
                        'Last Status Change Date': emailDate,
                        'Last Updated': today,
                        'Last Event Type': eventType,
                        'Status History': `${emailDate} - ${status || ApplicationStatus.APPLIED}${subject ? ` | ${subject}` : ''}`,
                        'Timeline Text': `${emailDate} - ${status || ApplicationStatus.APPLIED}${subject ? ` | ${subject}` : ''}`
                    }
                }
            ]);

            logger.info(`Created new application record: ${app.company} - ${app.role}`);
            return { action: 'created' };

        } catch (error) {
            logger.error('Airtable Error', { error });
            throw error;
        }
    }

    async findRecordByThreadId(threadId: string): Promise<Airtable.Record<any> | null> {
        const result = await this.table
            .select({
                filterByFormula: `{Gmail Thread ID} = '${threadId}'`,
                maxRecords: 1,
            })
            .firstPage();
        return result[0] || null;
    }

    private shouldUpdateStatus(current: string | undefined, incoming: ApplicationStatus): boolean {
        if (!incoming || incoming === ApplicationStatus.UNKNOWN) return false;
        if (!current) return true;
        if (current === incoming) return false;

        const rank: Record<string, number> = {
            [ApplicationStatus.APPLIED]: 1,
            [ApplicationStatus.INTERVIEWING]: 2,
            [ApplicationStatus.GHOSTED]: 2,
            [ApplicationStatus.OFFER]: 3,
            [ApplicationStatus.REJECTED]: 3,
            [ApplicationStatus.WITHDRAWN]: 3,
        };

        const currentRank = rank[current] ?? 0;
        const incomingRank = rank[incoming] ?? 0;

        // Block swapping between final states
        if (currentRank === incomingRank && currentRank === 3 && current !== incoming) {
            return false;
        }

        return incomingRank >= currentRank;
    }

    private mapStatus(status: ApplicationStatus): ApplicationStatus {
        switch (status) {
            case ApplicationStatus.INTERVIEWING:
            case ApplicationStatus.OFFER:
            case ApplicationStatus.REJECTED:
            case ApplicationStatus.GHOSTED:
            case ApplicationStatus.APPLIED:
                return status;
            case ApplicationStatus.WITHDRAWN:
                return ApplicationStatus.REJECTED; // fallback since table lacks Withdrawn
            default:
                return ApplicationStatus.APPLIED;
        }
    }

    private mapEventType(event?: EventType): string {
        switch (event) {
            case EventType.OFFER:
                return 'offer';
            case EventType.REJECTION:
                return 'rejection';
            case EventType.INTERVIEW:
                return 'interview';
            case EventType.STATUS_UPDATE:
                return 'status_update';
            default:
                return 'application_confirmation';
        }
    }

    private formatDate(date: Date | undefined): string {
        if (!date) return '';
        return date.toISOString().split('T')[0];
    }
}

export const airtableService = new AirtableService();
