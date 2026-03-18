export interface EmailMessage {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    date: Date;
    body: string; // Plain text preferred
    snippet: string;
}

export type GmailAuthTokens = {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expiry_date: number;
};
