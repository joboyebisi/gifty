$BOT_TOKEN = "8483897733:AAE2ja8PpE9kqUg0gL6X9SDSBN9Wd_jT2L0"

$commands = @(
    @{ command = "start"; description = "Start the bot and see welcome message" },
    @{ command = "help"; description = "Show help message" },
    @{ command = "open"; description = "Open Gifties Mini App" },
    @{ command = "compose"; description = "Compose a personalized gift with AI" },
    @{ command = "sendgift"; description = "Send gift to a user (@username) - creates USDC gift with claimable link" },
    @{ command = "giftlink"; description = "View your pending gifts and claim links" },
    @{ command = "birthdays"; description = "View upcoming birthdays" },
    @{ command = "wallet"; description = "View wallet address and funding info" },
    @{ command = "transfer"; description = "Cross-chain USDC transfer using CCTP" },
    @{ command = "swap"; description = "Swap tokens (ETH ↔ USDC)" }
)

$body = @{ commands = $commands } | ConvertTo-Json

$response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/setMyCommands" `
    -Method Post -ContentType "application/json" -Body $body

Write-Host "Commands registered: $($response.ok)"

