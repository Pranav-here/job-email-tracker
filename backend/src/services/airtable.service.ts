import Airtable from 'airtable';
import { config } from '../config';
import { JobApplication, ApplicationStatus } from '../../../common/types/job.types';
import { logger } from '../utils/logger';

export class AirtableService {
    private base: Airtable.Base;
    private table: Airtable.Table<any>;

    constructor() {
        this.base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.baseId);
        this.table = this.base(config.airtable.tableName);
    }

    async createOrUpdateApplication(app: JobApplication): Promise<void> {
        try {
            // 1. Check for duplicate using Gmail Thread ID
            const existingRecords = await this.table.select({
                filterByFormula: `{Gmail Thread ID} = '${app.gmailThreadId}'`,
                maxRecords: 1
            }).firstPage();

            if (existingRecords.length > 0) {
                // UPDATE existing record
                const record = existingRecords[0];
                const currentStatus = record.get('Status') as string;

                // Only update if status implies a progression (e.g. Applied -> Rejected)
                // or if we simply want to just log the latest activity.
                // For now, let's always update Status if it's different and not 'Unknown'
                // AND avoid overwriting a "final" state if the new state is "Applied" (which might happen if parsing same email thread again)

                // Check if we can enrich data (e.g. missing location/salary)
                const updates: any = {};
                let hasUpdates = false;

                // Status Update
                if (this.shouldUpdateStatus(currentStatus, app.status)) {
                    updates['Status'] = app.status;
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

                if (hasUpdates) {
                    updates['Last Updated'] = new Date().toISOString().split('T')[0];
                    logger.info(`Updating record for ${app.company}: ${JSON.stringify(updates)}`);
                    await this.table.update(record.id, updates);
                } else {
                    logger.info(`Skipping update for ${app.company}: No new data or status progression.`);
                }
                return;
            }

            // 2. Create NEW record
            await this.table.create([
                {
                    fields: {
                        'Company': app.company,
                        'Role': app.role,
                        'Status': app.status,
                        'Date Applied': app.appliedDate.toISOString().split('T')[0], // YYYY-MM-DD
                        'Location': app.location || '',
                        'Job URL': app.jobUrl || '',
                        'Gmail Message ID': app.gmailMessageId,
                        'Gmail Thread ID': app.gmailThreadId,
                        'Last Updated': new Date().toISOString().split('T')[0]
                    }
                }
            ]);

            logger.info(`Created new application record: ${app.company} - ${app.role}`);

        } catch (error) {
            logger.error('Airtable Error', { error });
            throw error;
        }
    }

    private shouldUpdateStatus(current: string, incoming: ApplicationStatus): boolean {
        if (!current) return true;
        if (incoming === ApplicationStatus.UNKNOWN) return false;
        if (current === incoming) return false;

        // Don't revert from Rejected/Offer back to Applied
        const finalStates = ['Rejected', 'Offer', 'Withdrawn'];
        if (finalStates.includes(current) && incoming === ApplicationStatus.APPLIED) {
            return false;
        }

        // Allow user to withdraw at any point
        if (incoming === ApplicationStatus.WITHDRAWN) return true;

        return true;
    }
}

export const airtableService = new AirtableService();
