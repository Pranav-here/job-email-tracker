export enum ApplicationStatus {
    APPLIED = 'Applied',
    INTERVIEWING = 'Interviewing',
    OFFER = 'Offer',
    REJECTED = 'Rejected',
    GHOSTED = 'Ghosted',
    WITHDRAWN = 'Withdrawn',
    UNKNOWN = 'Unknown'
}

export enum EventType {
    APPLICATION_CONFIRMATION = 'application_confirmation',
    STATUS_UPDATE = 'status_update',
    INTERVIEW = 'interview',
    OFFER = 'offer',
    REJECTION = 'rejection',
    OTHER = 'other'
}

export interface JobApplication {
    gmailMessageId: string;
    gmailThreadId: string;
    company: string;
    role: string;
    status: ApplicationStatus;
    appliedDate: Date;
    location?: string;
    salary?: string;
    jobUrl?: string;
    source?: string;
    lastEventType?: EventType;
}
