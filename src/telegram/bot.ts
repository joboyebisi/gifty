import { Env, loadEnv } from "../config/env";

// Telegram Bot API types
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
    };
    message: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data?: string;
  };
}

export class TelegramBot {
  private token: string;
  private apiUrl: string;
  private webhookUrl?: string;

  constructor() {
    const env = loadEnv();
    if (!env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    this.token = env.TELEGRAM_BOT_TOKEN;
    this.apiUrl = `https://api.telegram.org/bot${this.token}`;
    this.webhookUrl = env.TELEGRAM_WEBHOOK_URL;
  }

  private async request(method: string, params?: Record<string, any>): Promise<any> {
    const url = `${this.apiUrl}/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // Send message to user
  async sendMessage(chatId: number, text: string, options?: { reply_markup?: any; parse_mode?: string; reply_to_message_id?: number }): Promise<any> {
    return this.request("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || "HTML",
      ...options,
    });
  }

  // Set webhook
  async setWebhook(url: string): Promise<any> {
    return this.request("setWebhook", { url });
  }

  // Get webhook info
  async getWebhookInfo(): Promise<any> {
    return this.request("getWebhookInfo");
  }

  // Set bot commands
  async setCommands(commands: Array<{ command: string; description: string }>): Promise<any> {
    return this.request("setMyCommands", { commands });
  }

  // Set Mini App button
  async setMenuButton(chatId: number, text: string, webAppUrl: string): Promise<any> {
    return this.request("setChatMenuButton", {
      chat_id: chatId,
      menu_button: {
        type: "web_app",
        text,
        web_app: { url: webAppUrl },
      },
    });
  }

  // Answer callback query
  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean): Promise<any> {
    return this.request("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  // Get bot info (username, etc.)
  async getMe(): Promise<any> {
    return this.request("getMe");
  }
}

// Bot command handlers
// Handle /start command with deeplink parameters
export async function handleStartCommand(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) return;

  const bot = new TelegramBot();
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text || "";
  const env = loadEnv();
  const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";

  // Check if /start has parameters (deeplink)
  const startParam = text.split(" ")[1]; // /start claim_ABC123
  
  if (startParam?.startsWith("claim_")) {
    // Parse claim code from deeplink
    const { parseTelegramStartParam } = await import("../utils/telegram-deeplink");
    const claimParams = parseTelegramStartParam(startParam);
    
    if (claimParams?.claimCode) {
      // Redirect to claim page in Mini App
      const claimUrl = claimParams.secret
        ? `${frontendUrl}/gifts/claim/${claimParams.claimCode}?secret=${claimParams.secret}`
        : `${frontendUrl}/gifts/claim/${claimParams.claimCode}`;
      
      await bot.sendMessage(
        chatId,
        `🎁 <b>You have a gift to claim!</b>\n\nClick the button below to open the claim page in the Mini App.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎁 Claim Gift in Mini App",
                  web_app: { url: claimUrl },
                },
              ],
            ],
          },
        }
      );
      return;
    }
  }

  // Regular /start command (no deeplink) - send welcome message
  const welcomeMessage = `🎁 <b>Welcome to Gifty!</b>\n\n` +
    `I help you send delightful stablecoin-powered gifts to your family and friends, home and abroad.\n\n` +
    `📋 <b>Quick Start:</b>\n` +
    `• Use /wallet to connect your wallet\n` +
    `• Use /compose to create a personalized gift\n` +
    `• Use /help to see all commands\n\n` +
    `🌐 <b>Open Mini App:</b>\n` +
    `Click the button below to open the full Gifty experience!`;
  
  await bot.sendMessage(
    chatId,
    welcomeMessage,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚀 Open Gifty Mini App",
              web_app: { url: `${frontendUrl}` },
            },
          ],
          [
            {
              text: "💼 Connect Wallet",
              web_app: { url: `${frontendUrl}/wallet` },
            },
            {
              text: "🎁 Send Gift",
              web_app: { url: `${frontendUrl}/gifts` },
            },
          ],
          [
            {
              text: "📋 View Birthdays",
              web_app: { url: `${frontendUrl}/birthdays` },
            },
          ],
        ],
      },
    }
  );
}

export async function handleBotCommand(update: TelegramUpdate): Promise<void> {
  try {
  const bot = new TelegramBot();
  const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";

    if (!update.message) {
      console.log("⚠️ No message in update");
      return;
    }

    const command = update.message.text;
    if (!command) {
      console.log("⚠️ No command text in message");
      return;
    }
    
    const chatId = update.message.chat.id;
    const userName = update.message.from.first_name || "User";

    if (command === "/start" || command.startsWith("/start ")) {
      // Use the new handleStartCommand which supports deeplinks
      await handleStartCommand(update);
    } else if (command === "/help") {
      try {
        const helpMessage = `🤖 <b>Gifty Bot - Complete Command Guide</b>\n\n` +
          `📋 <b>Basic Commands</b>\n` +
          `/start - Start the bot and see welcome message\n` +
          `/help - Show this help message with all commands\n` +
          `/open - Open Gifty Mini App\n\n` +
          `🎁 <b>Gift Commands</b>\n` +
          `/compose - Open Mini App to compose a personalized gift\n` +
          `/compose @username - Generate AI-powered gift suggestion for user\n` +
          `/sendgift @username - Send gift to a user by handle\n` +
          `/birthdays - View upcoming birthdays\n` +
          `/giftlink - View your pending gifts and claim links\n\n` +
          `💼 <b>Wallet Commands</b>\n` +
          `/wallet - View your wallet address and balance\n\n` +
          `🌐 <b>Transfer & Swap Commands</b>\n` +
          `/transfer - Cross-chain USDC transfer using CCTP\n` +
          `/swap - Swap tokens (ETH ↔ USDC)\n\n` +
          `🎯 <b>How It Works</b>\n` +
          `1. Connect your wallet in the Mini App\n` +
          `2. Use /sendgift @username to send gifts\n` +
          `3. Bot generates personalized message\n` +
          `4. Share gift link with recipient\n\n` +
          `💡 <b>Tips</b>\n` +
          `• Use buttons in messages for quick actions\n` +
          `• Connect your wallet first\n` +
          `• Fund your wallet to send gifts\n\n` +
          `🔗 <b>Need Help?</b>\n` +
          `• Use /wallet to get funding instructions\n` +
          `• All commands work in groups too!`;
        
        await bot.sendMessage(chatId, helpMessage, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🎁 Open Mini App", web_app: { url: frontendUrl } },
              ],
              [
                { text: "💼 Check Wallet", callback_data: "check_wallet" },
                { text: "🎂 View Birthdays", callback_data: "birthdays" },
              ],
            ],
          },
        });
      } catch (error: any) {
        console.error("Error sending help message:", error);
        // Fallback to plain text if HTML fails
        await bot.sendMessage(chatId, `🤖 Gifty Bot Commands:\n\n/start - Start bot\n/wallet - View wallet\n/compose - Compose gift\n/sendgift @username - Send gift\n/birthdays - View birthdays\n/help - Show this help`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎁 Open Mini App", web_app: { url: frontendUrl } }],
            ],
          },
        });
      }
    } else if (command === "/open") {
      await bot.sendMessage(chatId, `🎁 Opening Gifties...`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎁 Open Gifties",
              web_app: { url: frontendUrl },
            },
          ],
          ],
        },
      });
    } else if (command === "/wallet") {
      const { handleWalletCommand } = await import("./handlers");
      await handleWalletCommand(bot, chatId, update.message.from.id);
    } else if (command.startsWith("/sendgift") || command.startsWith("/sendgifts")) {
      const { handleSendGiftCommand } = await import("./handlers");
      const handle = command.split(" ")[1]?.replace("@", "");
      await handleSendGiftCommand(bot, chatId, update.message.from.id, handle);
    } else if (command === "/giftlink" || command === "/giftlinks") {
      const { handleGiftLinkCommand } = await import("./handlers");
      await handleGiftLinkCommand(bot, chatId, update.message.from.id);
    } else if (command === "/birthdays" || command === "/birthday") {
      const { handleBirthdaysCommand } = await import("./handlers");
      await handleBirthdaysCommand(bot, chatId, update.message.from.id);
    } else if (command.startsWith("/compose")) {
      const handle = command.split(" ")[1]?.replace("@", "");
      if (handle) {
        const { handleGiftForHandle } = await import("./handlers");
        await handleGiftForHandle(bot, chatId, update.message.from.id, handle);
      } else {
        await bot.sendMessage(chatId, `✍️ <b>Compose Gift</b>\n\nOpening Mini App to compose your gift...`, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎁 Open Gifties",
                  web_app: { url: `${frontendUrl}/compose` },
                },
          ],
        ],
      },
    });
      }
    } else if (command.startsWith("/transfer")) {
      const { handleTransferCommand } = await import("./handlers");
      const args = command.split(" ").slice(1); // Remove /transfer and get args
      await handleTransferCommand(bot, chatId, update.message.from.id, args);
    } else if (command.startsWith("/swap")) {
      const { handleSwapCommand } = await import("./handlers");
      const args = command.split(" ").slice(1); // Remove /swap and get args
      await handleSwapCommand(bot, chatId, update.message.from.id, args);
    } else {
      console.log(`⚠️ Unknown command: ${command}`);
      await bot.sendMessage(chatId, `❓ Unknown command. Use /help to see available commands.`);
    }
  } catch (error: any) {
    console.error("❌ Error in handleBotCommand:", error);
    console.error("Stack:", error.stack);
    throw error; // Re-throw so caller can handle it
  }
}

