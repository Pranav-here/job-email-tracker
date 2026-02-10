import { parse, isValid, formatISO } from 'date-fns';

export function extractDate(text: string): Date | null {
    if (!text) return null;

    const datePatterns = [
        /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/i,
        /\b\d{4}-\d{2}-\d{2}\b/,
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            const parsed = new Date(match[0]);
            if (isValid(parsed)) return parsed;
        }
    }

    return null;
}

export function normalizeSalary(text: string): string | null {
    if (!text) return null;

    const salaryPatterns = [
        /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
        /(\d{1,3}(?:,\d{3})*)\s*-\s*(\d{1,3}(?:,\d{3})*)\s*(?:USD|per year|\/year|annually)/i,
        /\$\s*(\d{1,3}(?:,\d{3})*(?:k)?)/i,
    ];

    for (const pattern of salaryPatterns) {
        const match = text.match(pattern);
        if (match) {
            if (match[2]) {
                return `$${match[1]} - $${match[2]}`;
            } else if (match[1]) {
                const amount = match[1].toLowerCase().includes('k')
                    ? match[1].replace(/k/i, '000')
                    : match[1];
                return `$${amount}`;
            }
        }
    }

    return text.substring(0, 100);
}

export function normalizeLocation(text: string): string | null {
    if (!text) return null;

    const cleanLocation = text
        .replace(/\n/g, ', ')
        .replace(/\s+/g, ' ')
        .trim();

    const patterns = [
        /([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})/,
        /(Remote|Hybrid|On-site)/i,
        /([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)/,
    ];

    for (const pattern of patterns) {
        const match = cleanLocation.match(pattern);
        if (match) return match[0];
    }

    return cleanLocation.substring(0, 100);
}

export function extractUrl(text: string): string | null {
    if (!text) return null;

    const urlPattern = /(https?:\/\/[^\s<>"]+)/gi;
    const matches = text.match(urlPattern);

    if (matches && matches.length > 0) {
        const jobBoardUrls = matches.find(url =>
            /greenhouse|lever|workday|jobvite|smartrecruiters|linkedin|indeed/i.test(url)
        );
        return jobBoardUrls || matches[0];
    }

    return null;
}

export function extractCompanyName(text: string, emailFrom: string): string {
    const domains = emailFrom.match(/@([^.]+)\./);
    if (domains && domains[1]) {
        const domain = domains[1];
        if (!['gmail', 'yahoo', 'outlook', 'hotmail', 'noreply'].includes(domain.toLowerCase())) {
            return domain.charAt(0).toUpperCase() + domain.slice(1);
        }
    }

    const companyPattern = /(?:from|at|with|@)\s+([A-Z][A-Za-z0-9\s&]+(?:Inc|LLC|Corp|Ltd)?)/;
    const match = text.match(companyPattern);
    if (match && match[1]) {
        return match[1].trim();
    }

    return 'Unknown Company';
}
