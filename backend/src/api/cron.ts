import { VercelRequest, VercelResponse } from '@vercel/node';
import { gmailService, DEFAULT_LOOKBACK_HOURS } from '../services/gmail.service';
import { aiService } from '../services/ai.service';
import { airtableService } from '../services/airtable.service';
import { logger } from '../utils/logger';
import { config, validateConfig } from '../config';
import { metrics } from '../utils/metrics';
import { ApplicationStatus, EventType } from '../types/job.types';
import { shouldMarkGhosted } from '../utils/ghosting';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    validateConfig();

    const runId = `cron-${Date.now()}`;
    const authHeader = req.headers.authorization;
    if (config.app.cronSecret && authHeader !== `Bearer ${config.app.cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('Starting Cron Job: Job Application Sync', { runId });
    metrics.reset();

    try {
        const hours = req.query.hours ? parseInt(req.query.hours as string) : DEFAULT_LOOKBACK_HOURS;

        // 1. Fetch Emails (Pre-filtered by Gmail query + RegEx heuristics in gmail.service)
        const emails = await gmailService.fetchRecentEmails(hours);
        metrics.incrementEmailsFetched(emails.length);

        if (emails.length === 0) {
            logger.info('No job-related emails found.');
        }

        const stats = {
            processed: 0,
            synced: 0,
            errors: 0,
            duplicates: 0,
            ghosted: 0,
        };

        // 2. Process each email
        for (const email of emails) {
            try {
                stats.processed++;
                metrics.incrementEmailsProcessed();

                let existingRecord = await airtableService.findRecordByThreadId(email.threadId);
                if (existingRecord) {
                    const existingIds = ((existingRecord.get('Gmail Message IDs') as string) || '').split(',').map((v) => v.trim());
                    if (existingIds.includes(email.id)) {
                        stats.duplicates++;
                        metrics.incrementDuplicatesSkipped();
                        logger.info(`Skipping duplicate message ${email.id} for thread ${email.threadId}`);
                        continue;
                    }
                }

                // 3. AI Parsing
                const jobApp = await aiService.parseEmail(email);

                if (jobApp) {
                    // If no record found by thread, try heuristic duplicate matching (job URL / company+role)
                    if (!existingRecord) {
                        existingRecord = await airtableService.findPotentialDuplicate(jobApp);
                    }

                    // 3a. Ghosting rule: if thread is stale (>45 days) and status not final, mark ghosted
                    if (existingRecord && shouldMarkGhosted(existingRecord, email.date, config.app.ghostingDays)) {
                        const currentStatus = (existingRecord.get('Status') as string) || '';
                        if ([ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEWING].includes(currentStatus as ApplicationStatus)) {
                            jobApp.status = ApplicationStatus.GHOSTED;
                            jobApp.lastEventType = EventType.STATUS_UPDATE;
                        }
                    }

                    metrics.incrementJobsFound();
                    // 4. Update/Create in Airtable (Handles Deduplication)
                    const result = await airtableService.createOrUpdateApplication(jobApp, {
                        subject: email.subject,
                        from: email.from,
                        date: email.date,
                    }, existingRecord || undefined);

                    if (result.action === 'created') {
                        metrics.incrementAirtableSynced();
                        metrics.incrementAirtableCreated();
                        stats.synced++;
                    } else if (result.action === 'updated') {
                        metrics.incrementAirtableSynced();
                        metrics.incrementAirtableUpdated();
                        stats.synced++;
                    }
                } else {
                    logger.warn(`AI failed to extract job data from email: ${email.subject}`);
                }
            } catch (err) {
                logger.error(`Error processing email ${email.id}`, { error: err });
                stats.errors++;
                metrics.recordError('email_processing', err instanceof Error ? err.message : 'Unknown error');
            }

            // Throttle to stay well under Airtable's 5 req/sec limit (~3 calls per email)
            await new Promise(resolve => setTimeout(resolve, 700));
        }

        // 5. Ghost sweep: mark all stale Applied/Interviewing records as Ghosted
        logger.info('Running ghost sweep on all active records...');
        try {
            const activeRecords = await airtableService.getActiveRecords();
            for (const record of activeRecords) {
                if (shouldMarkGhosted(record, undefined, config.app.ghostingDays)) {
                    const company = (record.get('Company') as string) || 'Unknown';
                    const role = (record.get('Role') as string) || 'Unknown';
                    logger.info(`Ghost sweep: marking ${company} - ${role} as Ghosted`);
                    await airtableService.markAsGhosted(record);
                    stats.ghosted++;
                    metrics.incrementAirtableSynced();
                    metrics.incrementAirtableUpdated();
                    await new Promise(resolve => setTimeout(resolve, 700));
                }
            }
            logger.info(`Ghost sweep complete: ${stats.ghosted} records ghosted`);
        } catch (err) {
            logger.error('Ghost sweep failed', { error: err });
            metrics.recordError('ghost_sweep', err instanceof Error ? err.message : 'Unknown error');
        }

        // 6. Finalize
        metrics.finalize();
        const report = metrics.getReport();

        logger.info('Cron Job Completed', { runId, stats, metrics: report.summary });

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
