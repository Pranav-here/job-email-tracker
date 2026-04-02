export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: string;
}

export interface CronResult {
    processed: number;
    synced: number;
    duplicates: number;
    errors: number;
    details: string[];
}
