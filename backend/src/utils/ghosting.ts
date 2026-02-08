/**
 * Decide whether a thread should be marked as ghosted.
 * Looks at the most recent date we have on the record and compares it to a threshold.
 */
export function shouldMarkGhosted(
    record: { get: (field: string) => any },
    fallbackEmailDate: Date,
    thresholdDays: number = 45
): boolean {
    const dates: Date[] = [];
    const pushDate = (val: any) => {
        if (!val) return;
        const d = new Date(val);
        if (!isNaN(d.getTime())) dates.push(d);
    };

    pushDate(record.get('Last Status Change Date'));
    pushDate(record.get('Last Email Date'));
    pushDate(record.get('Email Date'));
    pushDate(fallbackEmailDate);

    if (dates.length === 0) return false;
    const latest = dates.reduce((a, b) => (a > b ? a : b));
    const daysSince = (Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= thresholdDays;
}
