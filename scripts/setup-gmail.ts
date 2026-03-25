import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { config } from '../backend/src/config';

// If config isn't loaded (process.env might be empty if not running via proper runner), 
// we might need to load dotenv manually here if 'tsx' doesn't auto-load .env
// But config/index.ts does process dotenv.

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

async function setup() {
    console.log('--- Gmail OAuth Setup ---');

    const clientId = config.gmail.clientId;
    const clientSecret = config.gmail.clientSecret;
    const redirectUri = config.gmail.redirectUri;

    if (!clientId || !clientSecret) {
        console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
        process.exit(1);
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial for refresh_token
        scope: SCOPES,
        prompt: 'consent' // Force consent to ensure we get a refresh_token
    });

    console.log('\nAuthorize this app by visiting this url:\n');
    console.log(authUrl);
    console.log('\n');

    // Create a local server to catch the callback
    const { createServer } = await import('http');
    const { URL } = await import('url');

    return new Promise<void>((resolve) => {
        const server = createServer(async (req, res) => {
            try {
                if (!req.url) return;
                const url = new URL(req.url, 'http://localhost:3000');
                const code = url.searchParams.get('code');

                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<h1>Success!</h1><p>Token received. You can close this tab and check your terminal.</p>');
                    server.close();

                    console.log('\nProcessing code...');
                    const { tokens } = await oAuth2Client.getToken(code);

                    // Save to file
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                    console.log(`\n✅ Token stored to ${TOKEN_PATH}`);

                    console.log('\n--- IMPORTANT FOR VERCEL ---');
                    console.log('If deploying to Vercel, add this GMAIL_REFRESH_TOKEN to your environment variables:');
                    console.log('\n' + tokens.refresh_token + '\n');
                    console.log('--- END ---');
                    resolve();
                }
            } catch (err) {
                console.error('Error retrieving token', err);
                res.end('Error retrieving token during callback');
            }
        });

        server.listen(3000, () => {
            console.log('Listening for callback on port 3000...');
        });
    });
}

setup();
