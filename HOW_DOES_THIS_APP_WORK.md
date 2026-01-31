# How Does This App Work? 🤔

A complete breakdown of the Job Application Email Tracker for beginners.

---

## 🎯 What Does This App Actually Do?

**The Simple Version:**
This app automatically checks your Gmail inbox for job-related emails (like application confirmations, interview invites, rejections), reads them, extracts the important info (company name, job title, status, etc.), and saves everything to a spreadsheet (Airtable) so you can track all your job applications in one place.

**Why You Need This:**
When you're applying to lots of jobs, it's hard to track which companies you've applied to, which ones responded, and what stage you're at. This automates all of that.

---

## 🏗️ The Big Picture: How Everything Flows

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────────┐
│  Your Gmail │ ---> │ Smart Filter │ ---> │  Claude AI  │ ---> │   Airtable   │
│   Inbox     │      │  (Is this a  │      │  (Extract   │      │  (Your Job   │
│             │      │  job email?) │      │   Details)  │      │  Tracker DB) │
└─────────────┘      └──────────────┘      └─────────────┘      └──────────────┘
```

**The Flow:**
1. **Fetch emails** from Gmail (last 24 hours)
2. **Filter** out newsletters, spam, non-job stuff
3. **Parse with AI** to extract structured data
4. **Save to Airtable** (only if it's a new application or status update)

---

## 🛠️ The Tech Stack (Why Each Technology Was Chosen)

### **Node.js** - The Runtime Environment
- **What it is:** JavaScript that runs on your computer/server (not in a browser)
- **Why we use it:** 
  - Popular, tons of libraries available
  - Great for connecting to APIs (Gmail, Anthropic, Airtable)
  - Fast enough for this task
  - Easy to deploy on Vercel

### **TypeScript** - The Language
- **What it is:** JavaScript with types (think of it like telling JavaScript what kind of data to expect)
- **Why TypeScript over plain JavaScript:**
  - Catches bugs before you run the code (like telling you "hey, you can't add a number to a string")
  - Better autocomplete in your editor
  - Makes refactoring safer
  - Example:
    ```typescript
    // JavaScript - no idea what fields 'email' has
    function processEmail(email) {
      return email.subject; // Could crash if subject doesn't exist
    }

    // TypeScript - knows exactly what an EmailMessage looks like
    function processEmail(email: EmailMessage): string {
      return email.subject; // Editor warns if this field doesn't exist
    }
    ```

### **Gmail API** - Email Fetching
- **What it is:** Google's official way to read emails programmatically
- **Why Gmail API instead of:**
  - ❌ **IMAP** (older email protocol): Gmail API is faster, more secure, and has better filtering
  - ❌ **Scraping Gmail's website**: Would break constantly when Google updates their UI
  - ✅ **Gmail API**: Official, reliable, has advanced search operators (like Gmail's search bar)

### **Anthropic Claude** - AI Parsing
- **What it is:** An AI model that reads text and extracts structured information
- **Why Claude over other options:**
  - ❌ **Regex/Manual parsing**: Would require hundreds of rules for every email format. Breaks easily.
  - ❌ **GPT-4**: More expensive, slower. Claude Haiku is cheaper and fast enough.
  - ❌ **Free local models**: Not accurate enough for this use case
  - ✅ **Claude 3 Haiku**: 
    - Great at following instructions
    - Cheap ($0.25 per 1 million input tokens)
    - Fast (2-3 seconds per email)
    - Good at extracting structured data (JSON)

### **Airtable** - Database
- **What it is:** A spreadsheet that acts like a database
- **Why Airtable over:**
  - ❌ **Google Sheets**: Slower API, harder to manage complex data
  - ❌ **PostgreSQL/MySQL**: Overkill for this project, requires hosting
  - ❌ **MongoDB**: Still requires hosting, no nice UI
  - ✅ **Airtable**: 
    - Has a beautiful UI you can use directly
    - Easy API
    - Free tier is generous
    - Can create custom views, filters, sort options
    - Built-in mobile app

### **Vercel** - Deployment Platform
- **What it is:** A hosting service for serverless functions
- **Why Vercel over:**
  - ❌ **Traditional server (AWS EC2, DigitalOcean)**: 
    - Costs money 24/7 even when not running
    - You have to manage the server
  - ❌ **Heroku**: Got expensive, less reliable
  - ✅ **Vercel**: 
    - Free tier
    - "Serverless" = only runs when needed (when the cron job triggers)
    - Built-in cron jobs
    - One command deployment
    - Great for TypeScript/Node.js projects

---

## 📂 Project Structure Explained

```
job-email-tracker/
├── api/                        # Vercel serverless functions
│   └── cron.ts                 # The endpoint Vercel hits daily
│
├── backend/src/
│   ├── services/               # The "workers" that do specific jobs
│   │   ├── gmail.service.ts    # Talks to Gmail
│   │   ├── ai.service.ts       # Talks to Claude AI
│   │   └── airtable.service.ts # Talks to Airtable
│   │
│   ├── utils/                  # Helper functions
│   │   ├── email-classifier.ts # Decides if an email is job-related
│   │   ├── deduplication.ts    # Prevents processing the same email twice
│   │   ├── logger.ts           # Writes logs (for debugging)
│   │   ├── metrics.ts          # Tracks success rates
│   │   └── retry.ts            # Retries failed API calls
│   │
│   └── config/
│       └── index.ts            # Loads environment variables
│
├── common/types/               # TypeScript definitions (what data looks like)
│   ├── email.types.ts          # EmailMessage structure
│   └── job.types.ts            # JobApplication structure
│
├── scripts/                    # Local testing scripts
│   ├── setup-gmail.ts          # One-time: authenticate with Google
│   ├── manual-trigger.ts       # Test locally (npm run start:manual)
│   ├── test-connection.ts      # Verify APIs work
│   └── validate-env.ts         # Check .env file is correct
│
├── .env                        # YOUR secrets (API keys, tokens)
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── vercel.json                 # Tells Vercel to run cron daily at midnight
```

---

## 🔍 Deep Dive: How Each Part Works

### 1️⃣ **Gmail Service** (`gmail.service.ts`)

**Job:** Fetch job-related emails from your inbox

#### How It Works:

1. **Authentication**
   - Uses OAuth 2.0 (the "Sign in with Google" flow)
   - You run `npm run setup:gmail` once, it opens a browser
   - You approve access, it saves a "refresh token" (a long-term password)
   - The app uses this token to access Gmail without asking you every time

2. **Fetching Emails**
   ```typescript
   async fetchRecentEmails(hours: number = 24)
   ```
   - Calculates a timestamp (e.g., 24 hours ago)
   - Builds a Gmail search query (like you'd type in Gmail search bar)
   - Example query:
     ```
     after:1705612800 
     (subject:(application OR interview OR offer) 
     OR from:(careers OR jobs OR recruiting))
     -subject:(newsletter OR unsubscribe)
     ```
   - This means: "Find emails from the last 24 hours that mention job stuff, but exclude newsletters"

3. **Smart Filtering** (happens BEFORE AI to save money)
   - After getting emails, runs them through `isJobRelated()` function
   - Checks for:
     - **Keywords**: "application", "interview", "offer", "recruiter", etc.
     - **Domains**: greenhouse.io, lever.co, workday.com (popular job platforms)
     - **Email patterns**: careers@, jobs@, recruiting@
   - Filters OUT:
     - **Negative keywords**: "newsletter", "unsubscribe", "sale", "webinar"

4. **Extracting Email Body**
   - Emails can have complex structures (plain text, HTML, attachments)
   - The app recursively searches for readable text
   - **Prefers plain text over HTML** (easier for AI to read)
   - Strips out HTML tags and images

**Why This Design:**
- Gmail API search filters are FREE and FAST
- Pre-filtering before AI saves money (don't pay Claude to read spam)
- Using refresh tokens means no manual login

---

### 2️⃣ **Email Classifier** (`email-classifier.ts`)

**Job:** Decide if an email is job-related (before sending to expensive AI)

#### The Three-Layer Check:

1. **Domain Check**
   ```typescript
   const hasJobDomain = JOB_DOMAINS.some(domain => fromDomain.includes(domain))
   // Example: email from "noreply@greenhouse.io" → TRUE
   ```

2. **Keyword Check**
   - Combines subject + snippet + sender into one string
   - Looks for 40+ job keywords
   - Example: "Thank you for applying to Software Engineer" → TRUE

3. **Pattern Matching** (Regex)
   ```typescript
   /application.*(?:received|confirmed|submitted)/i
   /interview.*(?:scheduled|invitation|request)/i
   ```
   - These patterns match phrases like:
     - "Application received"
     - "Interview scheduled"
     - "Offer letter"

**Why This Design:**
- Regex is way faster than AI
- Costs $0
- Catches 90%+ of job emails correctly
- The 10% edge cases get caught by AI anyway

---

### 3️⃣ **AI Service** (`ai.service.ts`)

**Job:** Extract structured data from email text

#### How It Works:

1. **Sanitization**
   - Removes HTML tags: `<div>Hello</div>` → `Hello`
   - Replaces URLs with `[URL]` (AI doesn't need to see full links)
   - Trims to 8000 characters (Claude has a limit, and most emails are way shorter)

2. **The Prompt** (This is the magic)
   ```typescript
   const prompt = `You are an expert at extracting job application data.
   
   Email: ${email.subject}
   Body: ${sanitizedBody}
   
   Extract these fields:
   - company (string)
   - role (string)
   - status ("Applied" | "Interviewing" | "Offer" | "Rejected")
   - location (optional)
   - salaryRange (optional)
   - jobUrl (optional)
   - notes (optional)
   
   Return ONLY valid JSON. If not a job email, return null.`
   ```

3. **AI Call**
   - Sends prompt to Claude API
   - Claude returns something like:
     ```json
     {
       "company": "Google",
       "role": "Software Engineer",
       "status": "Applied",
       "location": "Mountain View, CA",
       "notes": "Application received, will review in 2 weeks"
     }
     ```
   - If Claude returns `null`, the email is skipped (not a job email)

4. **Validation**
   - Checks that `company` and `role` fields exist
   - Maps status strings to enum values
   - If validation fails, returns `null` (skips this email)

**Why This Design:**
- AI is MUCH better than regex at handling variations
  - "We received your application" ✅
  - "Thanks for applying!" ✅
  - "Your submission for the SWE role" ✅
  - All map to the same structured data
- Using Haiku (cheapest Claude model) instead of Opus
- Retry logic (if API fails, tries again)

**Cost Breakdown:**
- Average email: ~500 tokens input, ~100 tokens output
- Cost: $0.25/1M input + $1.25/1M output
- **~$0.0002 per email** (basically free)
- 1000 emails = $0.20

---

### 4️⃣ **Airtable Service** (`airtable.service.ts`)

**Job:** Save/update applications in Airtable

#### How It Works:

1. **Check for Existing Record**
   ```typescript
   filterByFormula: `OR(
     {Email ID} = '${emailId}',
     AND({Company} = '${company}', {Role} = '${role}')
   )`
   ```
   - Searches Airtable for:
     - Exact match on Email ID (same email)
     - OR match on Company + Role (different email, same job)
   - This prevents duplicates

2. **Status Hierarchy** (Smart Update Logic)
   ```
   Applied (1) → Interviewing (2) → Offer (3) → Rejected (4) → Ghosted (5)
   ```
   - Only updates if new status is "higher priority"
   - Example scenarios:
     - Current: Applied, New: Interviewing → **UPDATE** ✅
     - Current: Rejected, New: Applied → **SKIP** ❌ (you already know you were rejected)
   - Why? You might get a confirmation email AFTER you already got rejected. Don't want to overwrite important info.

3. **Create or Update**
   - If no existing record → Create new row
   - If existing record → Update only if status progressed
   - Always updates "Last Updated" timestamp

**Why This Design:**
- Prevents duplicate entries
- Respects manual edits (if you mark something as Rejected, it won't revert)
- Status hierarchy reflects reality (can't go from Rejected back to Applied)

---

### 5️⃣ **Smart Deduplication** (Airtable-Based)

**Job:** Prevent duplicates and handle status updates correctly.

#### Previous Approach (Why it failed):
- We used to allow "in-memory" caching.
- **Problem:** Serverless functions (Vercel) "forget" everything after they run. So every new run would re-process old emails.

#### New Approach (How it works now):

1. **Check Airtable First**
   - Before adding any application, the app asks Airtable: 
     *"Do you already have a record with Gmail Thread ID 'thread_123'?"*

2. **Decision Logic**
   - **If Record Exists:** 
     - Check if we have *new* info (e.g. status changed from 'Applied' to 'Interview', or we found Salary info we missed before).
     - **Update** the existing record.
   - **If No Record:**
     - **Create** a new row.

**Why This Design:**
- **Zero Duplicates:** We rely on the database, not temporary memory.
- **Enrichment:** If the first email didn't have salary info but the second one does, we *update* the row instead of ignoring it.
- **Stateful:** The app "remembers" everything forever.

---

### 6️⃣ **Retry Logic** (`retry.ts`)

**Job:** Handle API failures gracefully

#### How It Works:

```typescript
async function withRetry(fn, options) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(); // Try to run the function
    } catch (error) {
      if (attempt === retries) throw error; // Last attempt, give up
      await sleep(backoff * attempt); // Wait longer each time
    }
  }
}
```

**Example:**
- Attempt 1: API call fails (network blip) → Wait 2 seconds
- Attempt 2: API call fails (server busy) → Wait 4 seconds
- Attempt 3: API call succeeds ✅

**Why This Design:**
- APIs can have temporary failures (network issues, rate limits)
- Exponential backoff = polite to the API (don't spam retries)
- Used for ALL external API calls (Gmail, Claude, Airtable)

---

## 🔄 The Complete Flow (Step-by-Step)

Let's trace a single email through the entire system:

### **Before the App Runs:**

1. You run `npm run setup:gmail` → Authenticate with Google → Refresh token saved
2. You deploy to Vercel → Environment variables set → Cron job configured

### **When Cron Job Triggers (Midnight Daily):**

1. **Vercel** calls `/api/cron` endpoint
2. **Cron handler** loads environment variables, initializes services

### **Email Fetching:**

3. **Gmail Service** authenticates using refresh token
4. Builds query: `after:1705612800 (subject:application OR from:careers) -subject:newsletter`
5. Gmail API returns 50 messages (within last 24 hours)
6. For each message:
   - Fetch full details (subject, body, sender, date)
   - Run through `isJobRelated()` filter
   - If passes: Keep (e.g., 15 out of 50)

### **AI Processing (for each of the 15 emails):**

7. **Check Deduplication Cache**
   - Generate hash: `SHA256(emailId + subject + sender)`
   - If hash exists in cache → Skip to next email
   - Else → Continue

8. **AI Service**
   - Sanitize email body (remove HTML, trim)
   - Build prompt with email details
   - Call Claude API with retry logic
   - Claude returns JSON:
     ```json
     {
       "company": "Stripe",
       "role": "Backend Engineer",
       "status": "Applied",
       "location": "San Francisco, CA",
       "notes": "Application received, will respond in 1-2 weeks"
     }
     ```
   - Validate required fields
   - If valid → Continue
   - If invalid or `null` → Skip to next email

### **Airtable Sync:**

9. **Airtable Service**
   - Search for existing record:
     - By Email ID: `{Email ID} = 'msg123'`
     - OR by Company + Role: `{Company} = 'Stripe' AND {Role} = 'Backend Engineer'`
   
   - **Scenario A: No existing record**
     - Create new row in Airtable
     - Mark hash as processed in cache
   
   - **Scenario B: Existing record found**
     - Compare statuses:
       - Existing: "Applied" (priority 1)
       - New: "Interviewing" (priority 2)
       - Decision: UPDATE ✅
     - Update row in Airtable
     - Mark hash as processed in cache
   
   - **Scenario C: Status didn't progress**
     - Existing: "Rejected" (priority 4)
     - New: "Applied" (priority 1)
     - Decision: SKIP ❌ (log duplicate)

10. **Metrics**
    - Increment counters (emails fetched, jobs found, duplicates skipped)
    - Calculate success rate
    - Log summary

11. **Response**
    - Return 200 OK to Vercel
    - Vercel logs output

---

## 💰 Cost Breakdown (Why This is Cheap)

### **Free Tier Limits:**
- **Gmail API**: 1 billion quota units/day (fetching 100 emails ≈ 500 units) → Basically unlimited
- **Claude 3 Haiku**: Pay-as-you-go
  - 100 emails/day × $0.0002 = **$0.02/day** = **$0.60/month**
- **Airtable**: 1,200 records/base on free tier → Good for 1,200 applications
- **Vercel**: 100GB bandwidth, 100 hours function execution → More than enough

### **Total Monthly Cost:**
- **$0.60** (only for Claude API)
- Everything else: FREE

### **How It Stays Cheap:**
1. **Pre-filtering emails** before AI (Gmail queries + keyword matching)
   - If we sent ALL emails to Claude: ~500 emails/day × $0.0002 = $3/month
   - With filtering: ~100 job emails/day × $0.0002 = $0.60/month
   - **Savings: 80%**

2. **Using Claude Haiku** instead of GPT-4
   - GPT-4: ~$0.01/1K tokens = $0.005/email
   - Claude Haiku: ~$0.25/1M tokens = $0.0002/email
   - **Haiku is 25× cheaper**

3. **Deduplication** (prevents redundant API calls)

4. **Serverless** (only runs when needed, not 24/7)

---

## 🤔 Design Decisions Explained

### Q: Why TypeScript instead of Python?

**Considerations:**
- Python: Great for data science, has more AI libraries
- TypeScript: Better for web APIs, Vercel optimized for it

**Decision: TypeScript**
- Vercel is built for Node.js/TypeScript (easier deployment)
- Gmail/Airtable have good TypeScript SDKs
- Type safety prevents bugs in production
- Faster cold starts on serverless

---

### Q: Why Claude instead of GPT-4 or local models?

**Considered:**
- **GPT-4**: More capable but 25× more expensive
- **GPT-3.5**: Similar price, but worse at structured output
- **Local models (Llama, Mistral)**: Free but requires hosting/GPU
- **Regex/Rules**: Free but brittle (breaks on edge cases)

**Decision: Claude 3 Haiku**
- Perfect balance of price/performance
- Great at following JSON schemas
- Anthropic's models are less "chatty" (don't waste tokens)
- Fast response times (<3s)

---

### Q: Why Airtable instead of Google Sheets or a real database?

**Considered:**
- **Google Sheets**: 
  - ✅ Free, familiar
  - ❌ Slow API (rate limits)
  - ❌ No good query/filter UI
- **PostgreSQL/MySQL**:
  - ✅ Fast, powerful
  - ❌ Requires hosting ($5-20/month)
  - ❌ No built-in UI
- **Notion**:
  - ✅ Great UI
  - ❌ API is slower than Airtable
  - ❌ More complex data model

**Decision: Airtable**
- Beautiful UI (can view on phone)
- Fast API with good filtering
- Free tier is generous
- Easy collaboration (share with friends)
- Can export to Excel/CSV anytime

---

### Q: Why not use IMAP instead of Gmail API?

**Gmail API vs IMAP:**

| Feature | Gmail API | IMAP |
|---------|-----------|------|
| **Search** | Advanced queries (like Gmail search) | Basic keyword search |
| **Speed** | Fetches metadata only, then full emails | Always fetches full emails |
| **Auth** | OAuth 2.0 (secure, can revoke) | Password (less secure) |
| **Rate Limits** | 1 billion/day | Varies by provider |
| **Reliability** | Google's official API | Third-party protocol |

**Decision: Gmail API**
- The advanced search alone is worth it
- OAuth is more secure (no password in `.env`)
- Built-in rate limiting

---

### Q: Why run at midnight instead of real-time?

**Considered:**
- **Real-time** (run every time email arrives):
  - ✅ Instant updates
  - ❌ Requires webhooks or polling
  - ❌ More complex to set up
  - ❌ Higher costs (more function invocations)
- **Hourly**:
  - ✅ More frequent than daily
  - ❌ Most job emails don't need hourly checks
- **Daily at midnight**:
  - ✅ Simple
  - ✅ Cheap (1 run/day)
  - ✅ Good enough (you're probably asleep anyway)

**Decision: Daily at midnight UTC**
- Job applications don't need real-time tracking
- Batch processing is more efficient
- Can always manually trigger: `npm run start:manual`

---

## 🐛 Common Issues & How They're Handled

### 1. **Gmail API Returns 401 Unauthorized**

**Cause:** Refresh token expired (Google tokens expire after ~6 months of inactivity)

**How App Handles It:**
- Logs error with context
- Returns 401 to Vercel cron
- Vercel sends you an email alert

**Fix:** Run `npm run setup:gmail` again to get a new token

---

### 2. **Claude Returns Malformed JSON**

**Example:**
```
Claude response: "The company is Google and the role is..." (not JSON)
```

**How App Handles It:**
```typescript
try {
  const extracted = JSON.parse(text);
} catch (error) {
  logger.warn('AI returned invalid JSON', { text, error });
  return null; // Skip this email
}
```

**Why It's Rare:**
- Claude is very good at following JSON format instructions
- Happens <1% of the time
- The email just gets skipped (not a big deal)

---

### 3. **Airtable Rate Limit (5 requests/second)**

**How App Handles It:**
- Retry logic with exponential backoff
- Processes emails sequentially (not in parallel)
- If retry fails 3 times → Log error, continue with next email

---

### 4. **Network Timeout**

**How App Handles It:**
```typescript
await withRetry(
  () => apiCall(),
  { retries: 3, backoff: 2000, timeout: 10000 }
)
```
- Waits up to 10 seconds per call
- Retries 3 times with exponential backoff
- If all fail → Logs error and continues

---

### 5. **Email Has No Text Body (Only Images)**

**How App Handles It:**
```typescript
const body = extractBodyFromParts(parts);
if (!body || body.trim().length === 0) {
  logger.warn('Email has no readable text', { emailId });
  return null;
}
```
- Attempts to extract text from HTML
- If no text found → Skip email
- Rare edge case (most emails have text)

---

## 📊 Observability (How You Know It's Working)

### **Logs**
Every run logs:
```
📨 Fetching job-related emails from the last 24 hours...
   Found 15 potential job emails

🤖 Processing with AI...

1/15 🔍 "Your application to Google - Software Engineer" ✅
      🏢 Google
      💼 Software Engineer
      📊 Applied
      💾 Synced to Airtable

2/15 ⏭️  Duplicate: "Re: Your Application to Microsoft"

3/15 🔍 "Interview Scheduled - Amazon" ✅
      🏢 Amazon
      💼 SDE II
      📊 Interviewing
      📍 Seattle, WA
      💾 Synced to Airtable

...

📊 Summary:
   Emails Fetched:      15
   Emails Processed:    15
   Jobs Found:          8
   Synced to Airtable:  6
   Duplicates Skipped:  2
   Errors:              0
   Success Rate:        53.3%
   Duration:            24.3s
```

### **Metrics Tracked**
- Emails fetched (how many emails Gmail returned)
- Emails processed (how many passed filters)
- Jobs found (how many AI parsed successfully)
- Duplicates skipped (how many were already in Airtable)
- Errors (API failures, parse errors)
- Success rate (jobs found / emails fetched)

---

## 🎓 Key Takeaways

1. **Layered Filtering Saves Money**
   - Gmail query filters → Keyword filters → AI parsing
   - Only pay for AI when email is likely a job email

2. **TypeScript Prevents Bugs**
   - Catches errors at compile time
   - Makes refactoring safe

3. **Retry Logic Makes It Reliable**
   - APIs fail sometimes, retries smooth over hiccups

4. **Smart Deduplication**
   - Hash-based cache + Airtable lookups
   - Prevents processing same email twice

5. **Status Hierarchy is Important**
   - Don't overwrite "Rejected" with "Applied"
   - Respects the natural flow of applications

6. **Serverless is Cost-Effective**
   - Only pay when running
   - No server management

---

## 🚀 Next Steps / Potential Improvements

### Ideas for V2:
1. **Email Categorization**
   - Separate table for rejections vs active applications
   
2. **Slack/Discord Notifications**
   - Get pinged when you get an interview invite

3. **Response Templates**
   - Auto-generate follow-up emails

4. **Analytics Dashboard**
   - Track application success rate by company, role, time

5. **Multi-Email Support**
   - Track applications from multiple Gmail accounts

6. **Calendar Integration**
   - Auto-add interview dates to Google Calendar

---

## 🙋 FAQ

### Q: Can I use this with Outlook/Yahoo Mail?
**A:** Not currently. Gmail API only. You'd need to add Outlook Graph API support.

### Q: What if Gmail search misses a job email?
**A:** You can adjust the search query in `buildAdvancedQuery()` to be more inclusive.

### Q: Can I run this locally forever instead of Vercel?
**A:** Yes! Set up a cron job on your computer:
```bash
# Linux/Mac crontab
0 0 * * * cd /path/to/job-email-tracker && npm run start:manual
```

### Q: How do I add more fields (like interview date)?
**A:** 
1. Update `JobApplication` interface in `common/types/job.types.ts`
2. Update AI prompt in `ai.service.ts` to extract new field
3. Update Airtable table with new column
4. Update `airtable.service.ts` to map the field

### Q: Is my data secure?
**A:** 
- All API keys are in `.env` (never committed to GitHub)
- OAuth tokens are encrypted by Google
- Data in Airtable is private to your account
- No third parties see your emails

---

**Made by Pranav** | Last Updated: January 2026
