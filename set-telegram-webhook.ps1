# PowerShell script to set Telegram webhook
# This tells Telegram where to send bot commands and messages

$BOT_TOKEN = "8483897733:AAE2ja8PpE9kqUg0gL6X9SDSBN9Wd_jT2L0"
$WEBHOOK_URL = "https://gifties-production.up.railway.app/api/telegram/webhook"

Write-Host "🔗 Setting Telegram Webhook..." -ForegroundColor Cyan
Write-Host "URL: $WEBHOOK_URL" -ForegroundColor Gray

# Set webhook (with drop_pending_updates to clear any failed updates)
$body = @{
    url = $WEBHOOK_URL
    drop_pending_updates = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body

    if ($response.ok) {
        Write-Host "✅ Webhook set successfully!" -ForegroundColor Green
        Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Failed to set webhook" -ForegroundColor Red
        Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error setting webhook: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n🔍 Verifying webhook..." -ForegroundColor Cyan

# Verify webhook
try {
    $webhookInfo = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo" `
        -Method Get

    if ($webhookInfo.ok) {
        Write-Host "✅ Webhook Info:" -ForegroundColor Green
        Write-Host "URL: $($webhookInfo.result.url)" -ForegroundColor Gray
        Write-Host "Pending updates: $($webhookInfo.result.pending_update_count)" -ForegroundColor Gray
        Write-Host "Last error: $($webhookInfo.result.last_error_message)" -ForegroundColor $(if ($webhookInfo.result.last_error_message) { "Red" } else { "Gray" })
        
        if ($webhookInfo.result.url -eq $WEBHOOK_URL) {
            Write-Host "`n✅ Webhook is correctly configured!" -ForegroundColor Green
        } else {
            Write-Host "`n⚠️ Webhook URL mismatch!" -ForegroundColor Yellow
            Write-Host "Expected: $WEBHOOK_URL" -ForegroundColor Yellow
            Write-Host "Actual: $($webhookInfo.result.url)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Failed to get webhook info" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error verifying webhook: $_" -ForegroundColor Red
}

Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Test the bot by sending /start to your bot in Telegram" -ForegroundColor White
Write-Host "2. Check Railway logs to see if webhook requests are being received" -ForegroundColor White
$miniAppUrl = "https://gifties-w3yr.vercel.app"
Write-Host "3. Verify Mini App URL is set in BotFather: $miniAppUrl" -ForegroundColor White
Write-Host ""

