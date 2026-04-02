# How Does This App Work?

Plain-English explanation of the job-application email tracker: what it does, how data flows, and which moving parts matter.

## What the app does

- Watches your Gmail inbox for job-application activity.
- Filters out noise (job alert digests, newsletters, ATS spam) before spending any AI tokens.
- Sends relevant emails to Claude AI for structured parsing.
- Syncs and de-duplicates records in Airtable so every application thread has a single source of truth.
- Runs automatically once a day via GitHub Actions (free), with a manual trigger and dry-run mode for safety.

## End-to-end flow

1. **GitHub Actions** fires a `POST /api/cron` request to the Vercel endpoint at 9am EST daily.
2. **Gmail fetch** — pull messages from the last 24 hours using a targeted search query with pagination (up to 500 messages).
3. **Relevance filter** — `email-classifier.ts` drops anything that isn't a direct application email: newsletters, job alert digests ("New jobs posted from…"), and non-job senders.
4. **Duplicate pre-check** — for each email, ask Airtable if this Gmail Thread ID already exists. If the specific message ID is already in the thread's history, skip it entirely.
5. **AI parsing** — Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) extracts company, role, status, location, salary, job URL. Returns `null` for digest/alert emails or anything with no meaningful company or role.
6. **Airtable sync** — three-layer dedup check (Thread ID → Job URL → Company+Role), then update the existing record or create a new one. All Airtable calls use retry with exponential backoff to survive 429 rate limits.
7. **Metrics** — count fetched/processed/created/updated/duplicates and emit a concise summary to logs.

## Email classification (what gets through)

The classifier runs before AI parsing to save API costs. It blocks:
- Negative keywords: newsletter, digest, subscribe, webinar, promo, reset password, etc.
- Job alert patterns: "new jobs posted", "new job opportunities", "jobs that match your profile", "job alert", etc.

It passes through:
- Emails with strong subject keywords (application, interview, offer, candidate, etc.) from known ATS senders
- "Thank you for applying" type subjects
- Status/update emails referencing an application
- Interview invitation emails

## AI parsing rules

Claude is given a strict system prompt:
- Return only a single JSON object, no commentary.
- Write "N/A" for absent fields — never invent data.
- Never use ATS platform names (Greenhouse, Lever, Workday, Ashby, etc.) as the company name.
- Return `status: "Unknown"` with all N/A fields if the email is a digest or job board alert.

After Claude responds, the app validates: if company or role is N/A, the record is dropped and not written to Airtable.

## Duplicate prevention (three layers)

1. **Gmail Thread ID** — all emails in the same application thread share one ID. Most reliable.
2. **Job URL** — exact URL match if the email contains a posting link.
3. **Company + Role** — fallback for emails without a URL (recruiter outreach, plain-text confirmations).

If any layer matches, the existing record is updated rather than duplicated. If the incoming message ID is already recorded in `Gmail Message IDs`, the email is skipped with no writes.

## Status progression

Forward-only — status rank can only increase:

```
Applied (rank 1) → Interviewing (rank 2) → Offer / Rejected / Ghosted (rank 3, final)
```

Two rank-3 states cannot overwrite each other (e.g. Rejected won't flip to Offer). Auto-ghosting fires after `GHOSTING_DAYS` (default 45) of silence while in Applied or Interviewing state — it still progresses normally if new email activity arrives.

## Data model (Airtable)

Key fields used by the app:
- **Identifiers**: `Gmail Thread ID`, `Gmail Message ID`, `Gmail Message IDs` (comma-separated history)
- **Core data**: `Company`, `Role`, `Status`, `Date Applied`, `Location`, `Salary Range`, `Job URL`
- **Email context**: `Email Subject`, `Email Date`, `Last Email Subject`, `Last Email Date`, `Last Email From`
- **Timeline**: `Last Status Change Date`, `Status History`, `Timeline Text`, `Last Event Type`
- **Optional ATS metadata**: `ATS Application ID`, `Requisition ID`, `Source ATS`

## Scheduling

- **Automated**: GitHub Actions workflow (`.github/workflows/daily-sync.yml`) runs at `0 14 * * *` UTC (9am EST), calls `POST /api/cron` with `Authorization: Bearer $CRON_SECRET`.
- **Manual run**: `npm run start:manual` — fetches last 24 hours and writes to Airtable. Flags: `--dry-run` to preview without writing, `--hours N` to override the lookback window (e.g. `--hours 48`). Prints a created/updated/skipped/errors summary at the end.
- **API trigger**: `POST /api/cron?hours=24` with the Authorization header — useful to backfill a longer window.

## Reliability features

- Config validation at startup — fails fast with a clear error if required env vars are missing.
- All Airtable API calls (find, create, update) wrapped in `withRetry` (3 retries, 2s → 4s → 8s backoff) to handle 429 rate limits.
- 700ms inter-email throttle in the processing loop to stay under Airtable's 5 req/sec limit.
- Paginated Gmail fetch with a 500-message cap per run.
- Concurrent message detail fetching (batch size 8) with HTML-to-text conversion.
- Metrics for created vs updated vs duplicates vs errors on every run.

## Security

- Secrets are never hard-coded; use `.env` locally and Vercel env vars in production.
- `token.json` is gitignored — never commit it.
- `CRON_SECRET` protects `/api/cron` from unauthorized triggers; the same value must be in both Vercel env vars and GitHub Actions secrets.
- Regenerate Gmail refresh tokens, Airtable PATs, and Anthropic keys if they were ever accidentally committed.

## Quick troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `invalid_grant` | Gmail refresh token expired or revoked | App now prints a clean message — just run `npm run setup:gmail` |
| 429 errors | Airtable rate limit hit | Retry handles it; check logs for persistent failures |
| No rows created | Token expired, or no job emails in window | Re-auth Gmail; try `?hours=48` |
| Duplicate rows | `Gmail Thread ID` column missing or misnamed | Recreate column with exact name |
| GitHub Action 4xx | `CRON_SECRET` mismatch between GitHub and Vercel | Make sure both are the same value |
