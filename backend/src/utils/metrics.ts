class MetricsCollector {
    private metrics: {
        emailsFetched: number;
        emailsProcessed: number;
        jobsFound: number;
        airtableSynced: number;
        airtableCreated: number;
        airtableUpdated: number;
        errors: number;
        duplicatesSkipped: number;
        startTime: number;
        endTime?: number;
        errorDetails: Array<{ type: string; message: string; timestamp: Date }>;
    };

    constructor() {
        this.metrics = {
            emailsFetched: 0,
            emailsProcessed: 0,
            jobsFound: 0,
            airtableSynced: 0,
            airtableCreated: 0,
            airtableUpdated: 0,
            errors: 0,
            duplicatesSkipped: 0,
            startTime: Date.now(),
            errorDetails: [],
        };
    }

    incrementEmailsFetched(count: number = 1): void {
        this.metrics.emailsFetched += count;
    }

    incrementEmailsProcessed(): void {
        this.metrics.emailsProcessed++;
    }

    incrementJobsFound(): void {
        this.metrics.jobsFound++;
    }

    incrementAirtableSynced(): void {
        this.metrics.airtableSynced++;
    }

    incrementAirtableCreated(): void {
        this.metrics.airtableCreated++;
    }

    incrementAirtableUpdated(): void {
        this.metrics.airtableUpdated++;
    }

    incrementDuplicatesSkipped(): void {
        this.metrics.duplicatesSkipped++;
    }

    recordError(type: string, message: string): void {
        this.metrics.errors++;
        this.metrics.errorDetails.push({
            type,
            message,
            timestamp: new Date(),
        });
    }

    finalize() {
        this.metrics.endTime = Date.now();
    }

    getReport() {
        const duration = (this.metrics.endTime || Date.now()) - this.metrics.startTime;
        const successRate = this.metrics.emailsProcessed > 0
            ? ((this.metrics.jobsFound / this.metrics.emailsProcessed) * 100).toFixed(1)
            : '0';

        return {
            summary: {
                emailsFetched: this.metrics.emailsFetched,
                emailsProcessed: this.metrics.emailsProcessed,
                jobsFound: this.metrics.jobsFound,
                airtableSynced: this.metrics.airtableSynced,
                airtableCreated: this.metrics.airtableCreated,
                airtableUpdated: this.metrics.airtableUpdated,
                duplicatesSkipped: this.metrics.duplicatesSkipped,
                errors: this.metrics.errors,
                successRate: `${successRate}%`,
                duration: `${(duration / 1000).toFixed(2)}s`,
                avgTimePerEmail: this.metrics.emailsProcessed > 0 ? `${(duration / this.metrics.emailsProcessed).toFixed(0)}ms` : '0ms',
            },
            errors: this.metrics.errorDetails,
        };
    }

    reset(): void {
        this.metrics = {
            emailsFetched: 0,
            emailsProcessed: 0,
            jobsFound: 0,
            airtableSynced: 0,
            airtableCreated: 0,
            airtableUpdated: 0,
            errors: 0,
            duplicatesSkipped: 0,
            startTime: Date.now(),
            errorDetails: [],
        };
    }
}

export const metrics = new MetricsCollector();
