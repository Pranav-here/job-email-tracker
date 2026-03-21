# How Does This App Work?

This document explains the job-application email tracker in plain English: what it does, how data flows, and which moving parts matter.

## What the app does
- Watches your Gmail inbox for job-application activity.
- Filters out noise, then sends relevant messages to Claude for structured parsing.
- Syncs and de-duplicates records in an Airtable base so every thread has a single source of truth.
- Runs automatically on Vercel via a daily cron, with a manual trigger and a dry-run mode for safety.

## End-to-end flow
1) Gmail fetch: pull messages from the last N hours (default 24) using a targeted search query and pagination.  
2) Relevance filter: quick heuristics keep only job-related threads.  
3) AI parsing: Claude extracts company, role, status, location, salary, URLs. Parser helpers backfill missing bits.  
4) Airtable sync: find-by-thread, prevent duplicates, progress status forward-only, append message history, update timelines.  
5) Metrics: count fetched/processed/created/updated/duplicates and emit a concise summary.

## Data model (Airtable)
Key fields used by the app:  
- Identifiers: `Gmail Thread ID`, `Gmail Message ID`, `Gmail Message IDs` (history).  
- Core data: `Company`, `Role`, `Status` (Applied | Interviewing | Offer | Rejected | Ghosted), `Date Applied`, `Location`, `Salary Range`, `Job URL`.  
- Email context: `Email Subject`, `Email Date`, `Last Email Subject`, `Last Email Date`, `Last Email From`.  
- Timeline: `Last Status Change Date`, `Status History`, `Timeline Text`, `Last Event Type`.  
- Optional ATS metadata: `ATS Application ID`, `Requisition ID`, `Source ATS`.

## Status logic
- Forward-only progression: Applied -> Interviewing -> Offer/Rejected/Ghosted (final).  
- Withdrawn/Unknown are mapped safely to allowed Airtable values.  
- Each change updates `Last Status Change Date`, `Status History`, and `Last Event Type`.

## Scheduling and triggers
- Vercel cron runs `/api/cron` at 00:00 UTC daily (configurable in `vercel.json`).  
- Manual run: `npm run start:manual -- --dry-run` to preview, or without `--dry-run` to write.  
- API trigger: `POST /api/cron?hours=24` with `Authorization: Bearer $CRON_SECRET`.

## Reliability features
- Config validation at startup.  
- URL-safe base64 decoding for Gmail bodies.  
- Pagination plus concurrency-capped fetch of message details.  
- Retry-ready utilities for network calls (can be wrapped as needed).  
- Metrics for created vs updated vs duplicates.

## Security notes
- Secrets are not hard-coded; use `.env` locally and Vercel env vars in production.  
- Regenerate Gmail refresh tokens if they were ever committed; keep `token.json` out of version control.  
- `CRON_SECRET` protects the scheduled endpoint.

## Quick troubleshooting
- No rows created: verify Gmail search window (`hours`), relevance filter, and that `GMAIL_REFRESH_TOKEN` is valid.  
- Status not updating: ensure Airtable `Status` options match the set above; check logs for “skipping duplicate message”.  
- Automation not running: confirm Vercel cron timezone (UTC) and that `CRON_SECRET` matches the header on manual triggers.
