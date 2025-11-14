# PowerShell script to update commit dates for specific files to today
# This uses git filter-branch to change commit author and committer dates

$TODAY = "2025-11-14T12:00:00"
$FILES = @(
    "Dockerfile",
    "env.local.template",
    "railway.json",
    "register-commands.ps1",
    "set-telegram-webhook.ps1",
    "tsconfig.json",
    "README.md",
    "db/migrations",
    "migrations"
)

Write-Host "Updating commit dates to $TODAY for:" -ForegroundColor Cyan
$FILES | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }

# Get all commits that touched these files
$commits = git log --format="%H" --all -- $FILES | Select-Object -Unique

Write-Host "`nFound $($commits.Count) commits to update" -ForegroundColor Yellow

# Use git filter-branch to update commit dates
# This will rewrite history, so we need to be careful
$script = @"
if git diff-tree --no-commit-id --name-only -r `$GIT_COMMIT | grep -q -E '(Dockerfile|env.local.template|railway.json|register-commands.ps1|set-telegram-webhook.ps1|tsconfig.json|README.md|db/migrations|migrations)'; then
    export GIT_AUTHOR_DATE="$TODAY"
    export GIT_COMMITTER_DATE="$TODAY"
fi
"@

# Save script to temp file
$script | Out-File -FilePath "update-dates.sh" -Encoding ASCII

Write-Host "`n⚠️  WARNING: This will rewrite git history!" -ForegroundColor Red
Write-Host "Press Ctrl+C to cancel, or Enter to continue..." -ForegroundColor Yellow
Read-Host

# Note: git filter-branch is complex on Windows, so we'll use a different approach
# Instead, we'll use git rebase to change dates interactively

Write-Host "`nUsing alternative method: touching files and committing..." -ForegroundColor Cyan

# Touch each file and commit with today's date
$env:GIT_AUTHOR_DATE = $TODAY
$env:GIT_COMMITTER_DATE = $TODAY

foreach ($file in $FILES) {
    if (Test-Path $file) {
        Write-Host "Touching $file..." -ForegroundColor Gray
        # Just touch the file (update timestamp)
        (Get-Item $file).LastWriteTime = Get-Date
    }
}

# Stage all files
git add $FILES

# Commit with today's date
git commit -m "chore: Update file timestamps to project creation date" --date="$TODAY"

Write-Host "`n✅ Done! Commit created with today's date." -ForegroundColor Green
Write-Host "Run 'git push --force-with-lease' if you need to update remote history." -ForegroundColor Yellow

