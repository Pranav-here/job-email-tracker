import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Also load from .env.local if available (for local dev)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const config = {
    gmail: {
        clientId: process.env.GMAIL_CLIENT_ID || '',
        clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
        redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
    },
    detailedAI: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-haiku-20240307',
    },
    airtable: {
        apiKey: process.env.AIRTABLE_API_KEY || '',
        baseId: process.env.AIRTABLE_BASE_ID || '',
        tableName: process.env.AIRTABLE_TABLE_NAME || 'Applications',
    },
    app: {
        cronSecret: process.env.CRON_SECRET || '',
        logLevel: process.env.LOG_LEVEL || 'info',
    },
};

const requiredKeys = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'ANTHROPIC_API_KEY',
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID',
];

export function validateConfig() {
    const missing = requiredKeys.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
