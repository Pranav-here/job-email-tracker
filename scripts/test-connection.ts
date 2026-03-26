import { gmailService } from '../backend/src/services/gmail.service';
import { aiService } from '../backend/src/services/ai.service';
import { airtableService } from '../backend/src/services/airtable.service';
import { logger } from '../backend/src/utils/logger';
import { validateConfig } from '../backend/src/config';

async function testConnections() {
    validateConfig();
    console.log('--- Testing Connections ---');

    // 1. Gmail
    try {
        console.log('Testing Gmail...');
        await gmailService.fetchRecentEmails(1); // Fetch 1 hour
        console.log('OK Gmail: Connected');
    } catch (err: any) {
        console.error('FAIL Gmail:', err.message);
    }

    // 2. AI
    try {
        console.log('Testing Claude AI...');
        // We can't easily test without a real email, but we can verify the client init
        // Or we could mock a parse call with a dummy email if we wanted to spend tokens.
        // Ideally we just check if config is present.
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('No API Key');
        console.log('OK Claude AI: key present (Runtime check skipped to save tokens)');
    } catch (err: any) {
        console.error('FAIL Claude AI:', err.message);
    }

    // 3. Airtable
    try {
        console.log('Testing Airtable...');
        // Try to init service, it throws if config missing.
        // To verify connectivity we'd need to make a call.
        if (!process.env.AIRTABLE_API_KEY) throw new Error('No API Key');
        console.log('OK Airtable: Configured');
    } catch (err: any) {
        console.error('FAIL Airtable:', err.message);
    }
}

testConnections();
