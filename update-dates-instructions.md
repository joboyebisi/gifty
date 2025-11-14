# Instructions to Update Commit Dates

To update commit dates for files showing "last week" to today (2025-11-14), you have two options:

## Option 1: Use Git Bash (Recommended)

1. Open **Git Bash** (not PowerShell) in the project directory
2. Run:
```bash
export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch -f --env-filter "source ./filter-dates.sh" --tag-name-filter cat -- --all
```
3. After completion, force push:
```bash
git push --force-with-lease origin main
```

## Option 2: Manual Git Rebase (Alternative)

This requires interactive rebase to change commit dates one by one.

## Files to Update

The following files will have their commit dates updated to 2025-11-14:
- Dockerfile
- env.local.template
- railway.json
- register-commands.ps1
- set-telegram-webhook.ps1
- tsconfig.json
- db/migrations/ (all files)

