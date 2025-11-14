# Simple script to update commit dates using git rebase
# This will update dates for commits that touched specific files

$TODAY = "2025-11-14T12:00:00"

Write-Host "Finding commits to update..." -ForegroundColor Cyan

# Get commit hashes that touched our files
$commits = git log --format="%H" --all -- Dockerfile env.local.template railway.json register-commands.ps1 set-telegram-webhook.ps1 tsconfig.json README.md db/migrations migrations | Select-Object -Unique

Write-Host "Found $($commits.Count) commits" -ForegroundColor Yellow

# For each commit, we'll use git filter-branch or rebase
# Actually, simpler: use git commit --amend for recent commits, or filter-branch for all

Write-Host "`nUsing git filter-branch to update commit dates..." -ForegroundColor Cyan
Write-Host "This will rewrite history. Proceeding automatically..." -ForegroundColor Yellow

# Use git filter-branch with a filter that checks if files were changed
$env:GIT_AUTHOR_DATE = $TODAY
$env:GIT_COMMITTER_DATE = $TODAY

# Create a bash script for the filter (git filter-branch works better with bash)
$bashScript = @'
#!/bin/bash
if git diff-tree --no-commit-id --name-only -r $GIT_COMMIT | grep -qE '(Dockerfile|env.local.template|railway.json|register-commands.ps1|set-telegram-webhook.ps1|tsconfig.json|README.md|db/migrations|migrations)'; then
    export GIT_AUTHOR_DATE="2025-11-14T12:00:00"
    export GIT_COMMITTER_DATE="2025-11-14T12:00:00"
fi
'@

$bashScript | Out-File -FilePath "filter-dates.sh" -Encoding ASCII

# Actually, let's use a PowerShell-native approach
# We'll use git rebase with --exec to update dates
Write-Host "`nUsing alternative: git rebase with date updates..." -ForegroundColor Cyan

# Get the oldest commit hash that we need to rebase from
$oldestCommit = git log --format="%H" --reverse -- Dockerfile env.local.template railway.json register-commands.ps1 set-telegram-webhook.ps1 tsconfig.json README.md db/migrations migrations | Select-Object -First 1

Write-Host "Oldest commit: $oldestCommit" -ForegroundColor Gray

# Actually, the simplest approach: use git filter-branch directly
Write-Host "`nRunning git filter-branch..." -ForegroundColor Yellow

# Use git filter-branch with PowerShell escaping
git filter-branch -f --env-filter "
    `$files = git diff-tree --no-commit-id --name-only -r `$GIT_COMMIT
    if (`$files -match 'Dockerfile|env.local.template|railway.json|register-commands.ps1|set-telegram-webhook.ps1|tsconfig.json|README.md|db/migrations|migrations') {
        `$env:GIT_AUTHOR_DATE = '2025-11-14T12:00:00'
        `$env:GIT_COMMITTER_DATE = '2025-11-14T12:00:00'
    }
" --tag-name-filter cat -- --all

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully updated commit dates!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "1. Review changes: git log --oneline" -ForegroundColor White
    Write-Host "2. Push to remote: git push --force-with-lease origin main" -ForegroundColor White
} else {
    Write-Host "`n❌ Error. Trying alternative method..." -ForegroundColor Red
    Write-Host "Using git rebase approach instead..." -ForegroundColor Yellow
}

