# 🎁 Gifty

Send delightful stablecoin-powered gifts to your family and friends, home and abroad. Powered by Telegram Mini App, Dynamic wallets, Circle Smart Accounts, CCTP, Bridge Kit, and Arc network.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- API keys: Dynamic, Circle, Supabase, Telegram

### Local Development

```bash
# Install dependencies
npm install
cd web && npm install

# Start backend
npm run dev

# Start frontend (in another terminal)
cd web && npm run dev
```

Visit `http://localhost:3000`

## ✨ Features

- Send crypto gifts with personalized AI messages
- Claim gifts via Telegram or web
- Cross-chain USDC transfers using Circle CCTP
- Multi-chain support (Ethereum Sepolia & Arc Testnet)
- Telegram Bot commands: `/wallet`, `/sendgift`, `/giftlink`, `/transfer`, `/swap`
- Seamless wallet creation with Dynamic
- Birthday reminders

## 🏗️ Tech Stack

- **Frontend:** Next.js 15, React, TailwindCSS
- **Backend:** Express.js, TypeScript
- **Blockchain:** Arc Network, USDC, Circle CCTP
- **Wallets:** Dynamic SDK
- **Database:** Supabase
- **AI:** Gemini, Groq, Perplexity

## 🚀 Deployment

- **Backend**: Railway (auto-deploys on push)
- **Frontend**: Vercel (auto-deploys on push)
- **Telegram Bot**: Set webhook via `set-telegram-webhook.ps1`
- **Commands**: Register via `register-commands.ps1`

## 📄 License

MIT

