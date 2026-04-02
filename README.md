# Job Application Email Tracker

Automated job application tracking system that monitors Gmail for job-related emails, extracts application details using Claude AI, and maintains a structured database in Airtable.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

This system intelligently monitors your Gmail inbox for job-related emails and automatically syncs application data to Airtable. It uses Claude AI to extract structured information from emails, including company names, job titles, application status, location, salary ranges, and more.

### Live Airtable View
See a real, continuously updated base (read-only): https://airtable.com/app9bkUoWiUAFiBnZ/tbloR1Rn2ztej795W/viwBIZzOTuBQNFr4d

### Key Features

- **AI-Powered Parsing** - Claude Haiku 4.5 analyzes emails to extract structured application data
- **Smart Detection** - Multi-layer filtering identifies real application emails, blocks job alert digests and newsletters
- **Automatic Status Updates** - Tracks application progression (Applied -> Interviewing -> Offer -> Rejected)
- **Smart Stateful Tracking** - Applications are remembered in Airtable; new emails enrich existing rows instead of creating duplicates
- **No Hallucinated Fields** - If data is missing (e.g., salary, location), the app records "N/A" instead of guessing
- **Duplicate Prevention** - Uses Gmail Thread ID first, then exact Job URL, then Company + Role match before creating any new record
- **Airtable Rate Limit Handling** - All Airtable calls use retry with exponential backoff (2s, 4s, 8s) to survive 429s
- **Airtable Integration** - Centralized database with custom views, filters, and organization
- **Serverless Deployment** - Runs on Vercel (free Hobby plan compatible)
- **Automated Scheduling** - GitHub Actions triggers the sync daily at 9am EST (free, no Vercel Pro needed)
- **Full Observability** - Detailed metrics, success rates, and error tracking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCHEDULING                               │
│                                                                 │
│   GitHub Actions (daily 9am EST)                                │
│         │                                                       │
│         │  POST /api/cron                                       │
│         │  Authorization: Bearer $CRON_SECRET                   │
│         ▼                                                       │
│   Vercel Serverless Function                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │      cron.ts handler        │
          │   - validateConfig()        │
          │   - auth check              │
          │   - metrics.reset()         │
          └──────┬──────────────────────┘
                 │
    ┌────────────▼────────────┐
    │      GmailService       │
    │  - OAuth2 (token.json   │
    │    or GMAIL_REFRESH_    │
    │    TOKEN env var)       │
    │  - Advanced query with  │
    │    date/keyword filters │
    │  - Paginated fetch      │
    │    (up to 500 msgs)     │
    │  - isJobRelated() pre-  │
    │    filter (blocks       │
    │    digests, alerts)     │
    └────────────┬────────────┘
                 │  EmailMessage[]
    ┌────────────▼────────────┐
    │  Per-email processing   │
    │  loop (700ms throttle)  │
    └──┬──────────────────────┘
       │
       ├──► AirtableService.findRecordByThreadId()
       │         │ existing record?
       │         ▼
       │    skip if message ID
       │    already in history
       │
       ├──► AIService.parseEmail()
       │    - Claude Haiku 4.5
       │    - Extracts: company, role,
       │      status, location, salary,
       │      jobUrl
       │    - Rejects: ATS names as
       │      company, N/A role/company
       │    - Returns null for digests
       │
       └──► AirtableService.createOrUpdateApplication()
                 │
                 ├── findRecordByThreadId()   ← Thread ID match
                 ├── findPotentialDuplicate() ← Job URL match
                 │                            ← Company+Role match
                 │
                 ├── UPDATE if record exists
                 │     - forward-only status progression
                 │     - append to Status History / Timeline
                 │     - enrich empty fields (location, url, salary)
                 │
                 └── CREATE if new application
```

### Data Flow Summary

```
Gmail Inbox
    │
    ▼ Gmail API (OAuth2, advanced search query)
Raw Emails (up to 500/run)
    │
    ▼ email-classifier.ts (keyword + alert-pattern filter)
Job-Related Emails Only
    │
    ▼ ai.service.ts (Claude Haiku 4.5)
Structured JobApplication objects
    │
    ▼ airtable.service.ts (Thread ID → URL → Company+Role dedup)
Airtable Records (created or updated)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ / TypeScript 5.3 |
| AI Parsing | Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Email Source | Gmail API with OAuth 2.0 |
| Database | Airtable |
| Hosting | Vercel Serverless Functions (free Hobby plan) |
| Scheduling | GitHub Actions (free, runs daily at 9am EST) |

---

## Quick Start (5 minutes)

**1. Clone and install**
```bash
git clone https://github.com/Pranav-here/job-email-tracker.git
cd job-email-tracker
npm install
```

**2. Copy env template**
```bash
cp .env.example .env
```
Fill in:
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` (Google Cloud OAuth)
- `ANTHROPIC_API_KEY`
- `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME` (usually `Applications`)

**3. Get Gmail refresh token**
```bash
npm run setup:gmail
```
This opens a browser for OAuth consent and writes `token.json` locally.

**4. Validate everything**
```bash
npm run validate
npm run test:connection
```

**5. Dry run (no Airtable writes)**
```bash
npm run start:manual -- --dry-run
```

**6. Run for real**
```bash
npm run start:manual
```
You should see new/updated rows in your Airtable base.

---

## Environment Variables

```bash
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=http://localhost:3000/oauth2callback
GMAIL_REFRESH_TOKEN=                  # from token.json after setup:gmail, required in production
ANTHROPIC_API_KEY=
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_NAME=Applications
CRON_SECRET=                          # protects /api/cron endpoint — set the same value in GitHub secrets
GHOSTING_DAYS=45                      # auto-mark ghosted after N days of silence
LOG_LEVEL=info
```

---

## Setup Guides

### Google Cloud (Gmail API)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project
2. Enable the **Gmail API**
3. Configure OAuth consent screen (External, add yourself as test user)
4. Create **OAuth 2.0 credentials** (Web Application type)
5. Add authorized redirect URI: `http://localhost:3000/oauth2callback`
6. Copy Client ID and Client Secret to `.env`
7. Run `npm run setup:gmail` to get `token.json`

### Anthropic API

1. Sign up at [Anthropic Console](https://console.anthropic.com/)
2. Generate an API key → add as `ANTHROPIC_API_KEY`

### Airtable

Create a base with a table named **"Applications"** and these fields:

| Column Name | Type | Notes |
|---|---|---|
| Email ID | Single line text | Primary Gmail message ID |
| Date Applied | Date | YYYY-MM-DD |
| Company | Single line text | |
| Role | Single line text | |
| Status | Single select | Applied, Interviewing, Offer, Rejected, Ghosted |
| Email Subject | Long text | |
| Email Date | Date | |
| Location | Single line text | |
| Salary Range | Single line text | |
| Job URL | Single line text | |
| Notes | Long text | Optional |
| Last Updated | Date | Auto-set by app |
| Gmail Thread ID | Single line text | **Required** for deduplication |
| Gmail Message IDs | Long text | Comma-separated history |
| Last Email Date | Date | Latest message in thread |
| Last Email Subject | Single line text | |
| Last Email From | Single line text | |
| Last Status Change Date | Date | |
| Status History | Long text | Appended log |
| Timeline Text | Long text | Human-readable log |
| Last Event Type | Single select | application_confirmation, status_update, interview, offer, rejection, other |
| Gmail Message ID | Single line text | Duplicate of Email ID for convenience |
| ATS Application ID | Single line text | Optional |
| Requisition ID | Single line text | Optional |
| Source ATS | Single select | lever, greenhouse, workday, icims, taleo, smartrecruiters, ashby, jobvite, other |

Generate a Personal Access Token at https://airtable.com/create/tokens with scopes `data.records:read` and `data.records:write`.

---

## Deployment

### Vercel (hosting the API endpoint)

```bash
npm install -g vercel
vercel login
vercel --prod
```

Add all environment variables in Vercel dashboard → **Settings → Environment Variables**. Make sure `GMAIL_REFRESH_TOKEN` is set (copy the value from your local `token.json`).

### GitHub Actions (automated scheduling — free)

The cron is handled by GitHub Actions, not Vercel, so this works on the free Hobby plan.

**1. Add two secrets to your GitHub repo** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VERCEL_CRON_URL` | `https://your-vercel-app.vercel.app/api/cron` |
| `CRON_SECRET` | same random string as your Vercel `CRON_SECRET` env var |

**2. Push to GitHub** — the workflow at `.github/workflows/daily-sync.yml` will run automatically every day at 9am EST.

**3. Manual trigger** — go to your repo → **Actions → Daily Job Email Sync → Run workflow**.

To manually trigger via curl:
```bash
curl -X POST "https://your-vercel-app.vercel.app/api/cron" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Project Structure

```
job-email-tracker/
├── .github/
│   └── workflows/
│       └── daily-sync.yml           # GitHub Actions cron (9am EST daily)
├── api/
│   └── cron.ts                      # Vercel serverless entry point
├── backend/
│   └── src/
│       ├── api/
│       │   └── cron.ts              # Core cron handler logic
│       ├── services/
│       │   ├── gmail.service.ts     # Gmail API + OAuth2
│       │   ├── ai.service.ts        # Claude AI parsing
│       │   └── airtable.service.ts  # Airtable sync + dedup
│       ├── utils/
│       │   ├── email-classifier.ts  # Job email filter (blocks alerts/digests)
│       │   ├── retry.ts             # Exponential backoff retry
│       │   ├── logger.ts            # Structured JSON logging
│       │   ├── metrics.ts           # Run statistics
│       │   ├── ghosting.ts          # Auto-ghost stale applications
│       │   └── parser-helpers.ts    # URL/location/salary extractors
│       └── config/
│           └── index.ts             # Env var loading + validation
├── common/
│   └── types/                       # Shared TypeScript interfaces
│       ├── email.types.ts
│       ├── job.types.ts
│       └── api.types.ts
├── scripts/
│   ├── setup-gmail.ts               # OAuth setup wizard
│   ├── manual-trigger.ts            # Local test runner (last 24h)
│   ├── test-connection.ts           # Tests Gmail/Airtable/AI connectivity
│   └── validate-env.ts              # Checks all required env vars
├── .env                             # Local secrets (gitignored)
├── token.json                       # Local Gmail token (gitignored)
├── package.json
├── tsconfig.json
└── vercel.json                      # Vercel function config
```

---

## How Duplicate Prevention Works

Three layers, in order:

1. **Gmail Thread ID** — most reliable; all emails in the same application thread share one ID
2. **Job URL** — exact match on the posting URL if present
3. **Company + Role** — fallback for emails without a URL (e.g. recruiter outreach)

If a match is found, the existing record is updated (status, history, metadata) rather than duplicated. If the incoming message ID is already in `Gmail Message IDs`, the email is skipped entirely.

---

## Status Progression

Forward-only — status can only move to equal or higher rank:

```
Applied (1) → Interviewing (2) → Offer / Rejected / Ghosted (3, final)
```

Two final states (e.g. Offer and Rejected) cannot overwrite each other. Auto-ghosting fires after `GHOSTING_DAYS` (default 45) of silence while in Applied or Interviewing.

---

## Usage

```bash
npm run start:manual                    # sync last 24 hours
npm run start:manual -- --dry-run       # preview only, no Airtable writes
npm run start:manual -- --hours 48      # sync last 48 hours
npm run start:manual -- --hours 720     # backfill last 30 days
npm run validate                        # check env vars
npm run test:connection       # test Gmail + Airtable + AI connectivity
npm run setup:gmail           # re-authorize Gmail (run when token expires)
```

---

## Monitoring

Each run logs a summary:

```
Emails Fetched:      12
Emails Processed:    8
Jobs Found:          5
Synced to Airtable:  5  (3 created, 2 updated)
Duplicates Skipped:  3
Errors:              0
Success Rate:        62.5%
Duration:            14.2s
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `invalid_grant` from Gmail | Token expired — run `npm run setup:gmail` |
| 429 from Airtable | Built-in retry handles this; if persistent, increase `backoff` in `airtable.service.ts` |
| Empty runs | Check Gmail lookback window; verify job emails exist in the period |
| Duplicate rows in Airtable | Ensure `Gmail Thread ID` and `Gmail Message IDs` columns exist with exact names |
| GitHub Action failing | Check `VERCEL_CRON_URL` and `CRON_SECRET` secrets match Vercel env vars |
| Endpoint returns 401 | `CRON_SECRET` in GitHub secret doesn't match Vercel env var |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgments

- [Anthropic](https://anthropic.com/) for Claude AI
- [Airtable](https://airtable.com/) for the database platform
- [Vercel](https://vercel.com/) for serverless hosting
- [Google](https://developers.google.com/gmail/api) for Gmail API
