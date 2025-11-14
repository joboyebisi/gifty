if git diff-tree --no-commit-id --name-only -r $GIT_COMMIT | grep -q -E '(Dockerfile|env.local.template|railway.json|register-commands.ps1|set-telegram-webhook.ps1|tsconfig.json|README.md|db/migrations|migrations)'; then
    export GIT_AUTHOR_DATE="2025-11-14T12:00:00"
    export GIT_COMMITTER_DATE="2025-11-14T12:00:00"
fi
