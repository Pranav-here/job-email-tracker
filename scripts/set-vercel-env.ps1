$ErrorActionPreference = "Stop"

Write-Host "Setting environment variables in Vercel..." -ForegroundColor Cyan

$envVars = @{
    "GMAIL_CLIENT_SECRET" = "REPLACE_ME"
    "GMAIL_REDIRECT_URI"  = "http://localhost:3000/oauth2callback"
    "GMAIL_REFRESH_TOKEN" = "REPLACE_ME"
    "ANTHROPIC_API_KEY"   = "REPLACE_ME"
    "AIRTABLE_API_KEY"    = "REPLACE_ME"
    "AIRTABLE_BASE_ID"    = "REPLACE_ME"
    "AIRTABLE_TABLE_NAME" = "Applications"
    "CRON_SECRET"         = "REPLACE_ME"
    "LOG_LEVEL"           = "info"
}

foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    Write-Host "Setting $key..." -ForegroundColor Yellow
    $value | vercel env add $key production
}

Write-Host "All done! Run 'vercel --prod' to deploy." -ForegroundColor Green
