import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
console.log(`Checking ${envPath}...`);

if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found.');
    process.exit(1);
}

dotenv.config();

const REQUIRED = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'ANTHROPIC_API_KEY',
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID'
];

let missing = false;

console.log('\n--- Environment Variables Check ---');
for (const key of REQUIRED) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
        console.error(`MISSING: ${key}`);
        missing = true;
    } else {
        // Mask value
        const masked = val.length > 8 ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}` : '********';
        console.log(`OK ${key} is set (${masked})`);

        if (val.includes('your_') || val.includes('REPLACE_ME')) {
            console.warn(`WARN ${key} looks like a placeholder. Replace it with a real value.`);
        }
    }
}

if (missing) {
    console.log('\nPlease fix errors in .env file.');
    process.exit(1);
}

// Check for GMAIL_REFRESH_TOKEN (Optional for start, but needed for cron)
console.log('\n--- Runtime Tokens ---');
if (process.env.GMAIL_REFRESH_TOKEN) {
    console.log('OK GMAIL_REFRESH_TOKEN is present (Ready for Vercel/Cron)');
} else {
    console.log('WARN GMAIL_REFRESH_TOKEN is missing (Run `npm run setup:gmail` to generate it)');
}

console.log('\nConfiguration check complete.');
