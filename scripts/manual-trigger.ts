import { gmailService, DEFAULT_LOOKBACK_HOURS } from '../backend/src/services/gmail.service';
import { aiService } from '../backend/src/services/ai.service';
import { airtableService } from '../backend/src/services/airtable.service';
import { validateConfig } from '../backend/src/config';
import { logger } from '../backend/src/utils/logger';
import { ApplicationStatus, EventType } from '../backend/src/types/job.types';
import { shouldMarkGhosted } from '../backend/src/utils/ghosting';
import { config } from '../backend/src/config';

async function main() {
    try {
        validateConfig();

        const isDryRun = process.argv.includes('--dry-run');

        // --hours flag: npm run start:manual -- --hours 48
        const hoursArgIdx = process.argv.indexOf('--hours');
        const hoursArg = process.argv.find(a => a.startsWith('--hours=')) ||
            (hoursArgIdx !== -1 ? process.argv[hoursArgIdx + 1] : undefined);
        const hours = hoursArg && !hoursArg.startsWith('--') ? parseInt(hoursArg) : DEFAULT_LOOKBACK_HOURS;

        logger.info(`Starting manual job application sync (last ${hours}h)${isDryRun ? ' [DRY RUN]' : ''}...`);

        // 1. Fetch
        const emails = await gmailService.fetchRecentEmails(hours);
        logger.info(`Fetched ${emails.length} potential job emails (last ${hours} hours).`);

        if (emails.length === 0) {
            logger.info('No job-related emails found. Done.');
            return;
        }

        const stats = { processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 };

        // 2. Process
        for (const email of emails) {
            try {
                stats.processed++;
                logger.info(`Processing: ${email.subject}`);

                // Thread-level dedup: skip message IDs already recorded
                let existingRecord = await airtableService.findRecordByThreadId(email.threadId);
                if (existingRecord) {
                    const existingIds = ((existingRecord.get('Gmail Message IDs') as string) || '')
                        .split(',').map(v => v.trim());
                    if (existingIds.includes(email.id)) {
                        logger.info(`Skipping duplicate message ${email.id}`);
                        stats.skipped++;
                        continue;
                    }
                }

                const jobApp = await aiService.parseEmail(email);

                if (jobApp) {
                    logger.info(`Found Job App: ${jobApp.company} - ${jobApp.role} (${jobApp.status})`);

                    if (!existingRecord) {
                        existingRecord = await airtableService.findPotentialDuplicate(jobApp);
                    }

                    // Auto-ghost stale threads
                    if (existingRecord && shouldMarkGhosted(existingRecord, email.date, config.app.ghostingDays)) {
                        const currentStatus = (existingRecord.get('Status') as string) || '';
                        if ([ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEWING].includes(currentStatus as ApplicationStatus)) {
                            jobApp.status = ApplicationStatus.GHOSTED;
                            jobApp.lastEventType = EventType.STATUS_UPDATE;
                        }
                    }

                    if (isDryRun) {
                        logger.info(`[DRY RUN] Would sync: ${jobApp.company} - ${jobApp.role} (${jobApp.status})`);
                        stats.created++;
                        continue;
                    }

                    const result = await airtableService.createOrUpdateApplication(
                        jobApp,
                        { subject: email.subject, from: email.from, date: email.date },
                        existingRecord || undefined
                    );

                    if (result.action === 'created') stats.created++;
                    else if (result.action === 'updated') stats.updated++;
                    else stats.skipped++;

                } else {
                    logger.warn(`Skipped: ${email.subject}`);
                    stats.skipped++;
                }

            } catch (err) {
                logger.error(`Error processing email ${email.id}`, { error: err });
                stats.errors++;
            }

            // Throttle to stay under Airtable's 5 req/sec limit
            await new Promise(resolve => setTimeout(resolve, 700));
        }

        // 3. Summary
        logger.info('--- Run Summary ---');
        logger.info(`Processed:  ${stats.processed}`);
        logger.info(`Created:    ${stats.created}`);
        logger.info(`Updated:    ${stats.updated}`);
        logger.info(`Skipped:    ${stats.skipped}`);
        logger.info(`Errors:     ${stats.errors}`);
        logger.info('Done!');

    } catch (error: any) {
        // Graceful handling for expired/revoked Gmail token
        if (error?.message?.includes('invalid_grant') || error?.response?.data?.error === 'invalid_grant') {
            console.error('\nGmail token expired or revoked. Re-authorize by running:\n\n  npm run setup:gmail\n');
            process.exit(1);
        }
        console.error('Manual trigger failed:', error);
        process.exit(1);
    }
}

main();
