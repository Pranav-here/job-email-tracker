import Airtable from 'airtable';
import { config } from '../config';
import { JobApplication, ApplicationStatus, EventType } from '../types/job.types';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

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
        const isNa = (v?: string) => !v || v.toLowerCase() === 'n/a';

        // 1. Match on exact Job URL (most reliable)
        if (!isNa(app.jobUrl)) {
            const result = await withRetry(
                () => this.table
                    .select({
                        filterByFormula: `{Job URL} = "${this.escapeFormulaValue(app.jobUrl!)}"`,
                        maxRecords: 1,
                    })
                    .firstPage(),
                { retries: 3, backoff: 2000, factor: 2 },
                'airtable.findPotentialDuplicate.url'
            );
            if (result[0]) return result[0];
        }

        // 2. Fall back to Company + Role exact match
        if (!isNa(app.company) && !isNa(app.role)) {
            const result = await withRetry(
                () => this.table
                    .select({
                        filterByFormula: `AND({Company} = "${this.escapeFormulaValue(app.company)}", {Role} = "${this.escapeFormulaValue(app.role)}")`,
                        maxRecords: 1,
                    })
                    .firstPage(),
                { retries: 3, backoff: 2000, factor: 2 },
                'airtable.findPotentialDuplicate.companyRole'
            );
            if (result[0]) return result[0];
        }

        // 3. Company + base role prefix match
        // Handles cases where the AI extracts a longer role name from a follow-up email
        // e.g. "Software Engineer 1" vs "Software Engineer 1 - Uptime Partnership"
        if (!isNa(app.company) && !isNa(app.role)) {
            const baseRole = app.role.split(' - ')[0].trim();
            if (baseRole !== app.role) {
                const result = await withRetry(
                    () => this.table
                        .select({
                            // FIND returns 1-based index; = 1 means the Role field starts with baseRole
                            filterByFormula: `AND({Company} = "${this.escapeFormulaValue(app.company)}", FIND("${this.escapeFormulaValue(baseRole)}", {Role}) = 1)`,
                            maxRecords: 1,
                        })
                        .firstPage(),
                    { retries: 3, backoff: 2000, factor: 2 },
                    'airtable.findPotentialDuplicate.baseRole'
                );
                if (result[0]) return result[0];
            }
        }

        return null;
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
                await withRetry(
                    () => this.table.update(record!.id, updates),
                    { retries: 3, backoff: 2000, factor: 2 },
                    'airtable.update'
                );
                return { action: 'updated' };
            }

            // 2. Create NEW record
            await withRetry(
                () => this.table.create([
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
                ]),
                { retries: 3, backoff: 2000, factor: 2 },
                'airtable.create'
            );

            logger.info(`Created new application record: ${app.company} - ${app.role}`);
            return { action: 'created' };

        } catch (error) {
            logger.error('Airtable Error', { error });
            throw error;
        }
    }

    async getActiveRecords(): Promise<Airtable.Record<any>[]> {
        return new Promise((resolve, reject) => {
            const records: Airtable.Record<any>[] = [];
            this.table
                .select({
                    filterByFormula: `OR({Status} = "${ApplicationStatus.APPLIED}", {Status} = "${ApplicationStatus.INTERVIEWING}")`,
                })
                .eachPage(
                    (page, fetchNextPage) => {
                        records.push(...page);
                        fetchNextPage();
                    },
                    (err) => {
                        if (err) reject(err);
                        else resolve(records);
                    }
                );
        });
    }

    async markAsGhosted(record: Airtable.Record<any>): Promise<void> {
        const today = this.formatDate(new Date());
        const historyEntry = `${today} - ${ApplicationStatus.GHOSTED} | Auto-ghosted (no activity)`;
        const priorHistory = (record.get('Status History') as string) || '';
        const updates: any = {
            'Status': ApplicationStatus.GHOSTED,
            'Last Status Change Date': today,
            'Last Event Type': 'status_update',
            'Last Updated': today,
            'Status History': priorHistory ? `${priorHistory}\n${historyEntry}` : historyEntry,
        };
        updates['Timeline Text'] = updates['Status History'];
        await withRetry(
            () => this.table.update(record.id, updates),
            { retries: 3, backoff: 2000, factor: 2 },
            'airtable.markAsGhosted'
        );
    }

    async markMultipleAsGhosted(records: Airtable.Record<any>[]): Promise<void> {
        if (records.length === 0) return;
        const today = this.formatDate(new Date());
        const BATCH_SIZE = 10;

        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            const updates = batch.map(record => {
                const historyEntry = `${today} - ${ApplicationStatus.GHOSTED} | Auto-ghosted (no activity)`;
                const priorHistory = (record.get('Status History') as string) || '';
                const statusHistory = priorHistory ? `${priorHistory}\n${historyEntry}` : historyEntry;
                return {
                    id: record.id,
                    fields: {
                        'Status': ApplicationStatus.GHOSTED,
                        'Last Status Change Date': today,
                        'Last Event Type': 'status_update',
                        'Last Updated': today,
                        'Status History': statusHistory,
                        'Timeline Text': statusHistory,
                    } as any,
                };
            });

            await withRetry(
                () => this.table.update(updates),
                { retries: 3, backoff: 2000, factor: 2 },
                'airtable.markMultipleAsGhosted'
            );

            // ~4 batches/sec, well under Airtable's 5 req/sec limit
            if (i + BATCH_SIZE < records.length) {
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
    }

    async findRecordByThreadId(threadId: string): Promise<Airtable.Record<any> | null> {
        const result = await withRetry(
            () => this.table
                .select({
                    filterByFormula: `{Gmail Thread ID} = '${threadId}'`,
                    maxRecords: 1,
                })
                .firstPage(),
            { retries: 3, backoff: 2000, factor: 2 },
            'airtable.findRecordByThreadId'
        );
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
