import { gmailService, DEFAULT_LOOKBACK_HOURS } from '../backend/src/services/gmail.service';
import { aiService } from '../backend/src/services/ai.service';
import { airtableService } from '../backend/src/services/airtable.service';
import { validateConfig } from '../backend/src/config';
import { logger } from '../backend/src/utils/logger';

async function main() {
    try {
        validateConfig();

        const isDryRun = process.argv.includes('--dry-run');
        logger.info('Starting manual job application sync...');

        // 1. Fetch
        const emails = await gmailService.fetchRecentEmails(DEFAULT_LOOKBACK_HOURS);
        logger.info(`Fetched ${emails.length} potential job emails (last 24 hours).`);

        // 2. Process
        for (const email of emails) {
            logger.info(`Processing: ${email.subject}`);
            const jobApp = await aiService.parseEmail(email);

            if (jobApp) {
                logger.info(`Found Job App: ${jobApp.company} - ${jobApp.role} (${jobApp.status})`);

                if (isDryRun) {
                    logger.info(`[DRY RUN] Would sync: ${jobApp.company} - ${jobApp.role} (${jobApp.status})`);
                    continue;
                }

                await airtableService.createOrUpdateApplication(
                    jobApp,
                    { subject: email.subject, from: email.from, date: email.date }
                );
            } else {
                logger.warn('Skipped (Not a job application or AI parsing failed)');
            }
        }

        logger.info('Done!');

    } catch (error) {
        console.error('Manual trigger failed:', error);
    }
}

main();
