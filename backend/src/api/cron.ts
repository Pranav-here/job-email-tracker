import { VercelRequest, VercelResponse } from '@vercel/node';
import { gmailService } from '../services/gmail.service';
import { aiService } from '../services/ai.service';
import { airtableService } from '../services/airtable.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { metrics } from '../utils/metrics';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const authHeader = req.headers.authorization;
    if (config.app.cronSecret && authHeader !== `Bearer ${config.app.cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('Starting Cron Job: Job Application Sync');
    metrics.reset();

    try {
        const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;

        // 1. Fetch Emails (Pre-filtered by Gmail query + RegEx heuristics in gmail.service)
        const emails = await gmailService.fetchRecentEmails(hours);
        metrics.incrementEmailsFetched(emails.length);

        if (emails.length === 0) {
            logger.info('No job-related emails found.');
            return res.status(200).json({
                success: true,
                message: 'No relevant emails found',
                processed: 0
            });
        }

        const stats = {
            processed: 0,
            synced: 0,
            errors: 0
        };

        // 2. Process each email
        for (const email of emails) {
            try {
                stats.processed++;
                metrics.incrementEmailsProcessed();

                // 3. AI Parsing
                const jobApp = await aiService.parseEmail(email);

                if (jobApp) {
                    // 4. Update/Create in Airtable (Handles Deduplication)
                    await airtableService.createOrUpdateApplication(jobApp);

                    stats.synced++;
                    metrics.incrementAirtableSynced();
                } else {
                    logger.warn(`AI failed to extract job data from email: ${email.subject}`);
                }
            } catch (err) {
                logger.error(`Error processing email ${email.id}`, { error: err });
                stats.errors++;
                metrics.recordError('email_processing', err instanceof Error ? err.message : 'Unknown error');
            }
        }

        // 5. Finalize
        metrics.finalize();
        const report = metrics.getReport();

        logger.info('Cron Job Completed', { stats, metrics: report.summary });

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            stats,
            metrics: report.summary
        });

    } catch (error) {
        logger.error('Critical Cron Failure', { error });
        metrics.recordError('cron_critical', error instanceof Error ? error.message : 'Unknown');

        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
