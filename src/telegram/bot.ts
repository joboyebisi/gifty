import { Bot, Context, session, SessionFlavor } from "grammy";
import { loadEnv } from "../config/env";
import { CoordinatorAgent } from "../ai/agents/CoordinatorAgent";
import { run } from "@grammyjs/runner";

// Define session structure
interface SessionData {
  step?: string;
  giftData?: any;
}

// Define context flavor
type MyContext = Context & SessionFlavor<SessionData>;

export class TelegramBot {
  private bot: Bot<MyContext>;
  private coordinator: CoordinatorAgent;
  private isRunning: boolean = false;

  constructor() {
    const env = loadEnv();
    if (!env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }

    this.bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);
    this.coordinator = new CoordinatorAgent();

    // Use session middleware
    this.bot.use(session({ initial: () => ({}) }));

    // Setup handlers
    this.setupHandlers();
  }

  private setupHandlers() {
    // Commands
    this.bot.command("start", this.handleStart.bind(this));
    this.bot.command("help", this.handleHelp.bind(this));

    // Group message handler (Agentic entry point)
    this.bot.on("message:text", async (ctx) => {
      const chatType = ctx.chat.type;
      const isGroup = chatType === "group" || chatType === "supergroup";

      if (isGroup) {
        // Forward to Coordinator Agent
        // Pass context to agent (or critical parts of it)
        await this.coordinator.handleTelegramMessage(ctx);
      } else {
        // Private chat handling
        // For now, simpler echo or manual flow
        // await ctx.reply("I only support group agentic features for now!");
        // Forward private messages too?
        await this.coordinator.handleTelegramMessage(ctx);
      }
    });

    // Error handling
    this.bot.catch((err) => {
      console.error(`Error while handling update ${err.ctx.update.update_id}:`);
      console.error(err.error);
    });
  }

  private async handleStart(ctx: MyContext) {
    const startParam = ctx.match; // Deep linking param
    const frontendUrl = loadEnv().FRONTEND_URL || "https://gifties.app";

    if (startParam && typeof startParam === 'string' && startParam.startsWith("claim_")) {
      // Handle claim deep link logic here or redirect to mini app
      await ctx.reply(`🎁 <b>You have a gift to claim!</b>\n\nClick the button below to open the claim page.`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎁 Claim Gift", web_app: { url: `${frontendUrl}/gifts/claim/${startParam.replace("claim_", "")}` } }]
          ]
        }
      });
      return;
    }

    await ctx.reply("Welcome to Gifty! I am an Agentic Bot. Add me to a group to get started.");
  }

  private async handleHelp(ctx: MyContext) {
    await ctx.reply("Commands:\n/start - Start\n/help - Help\n\nJust talk to me in a group!");
  }

  public async start() {
    if (this.isRunning) return;

    console.log("Starting Telegram Bot (Grammy)...");

    // For development (long polling)
    if (process.env.NODE_ENV === "development" || !process.env.TELEGRAM_WEBHOOK_URL) {
      this.isRunning = true;
      run(this.bot);
      console.log("Bot started in long-polling mode.");
    } else {
      // Webhook mode logic would go here (usually set via API)
      // For now, we assume long polling for the agentic demo
      this.isRunning = true;
      run(this.bot);
      console.log("Bot started.");
    }
  }

  public async stop() {
    if (this.isRunning) {
      await this.bot.stop();
      this.isRunning = false;
    }
  }

  // Expose bot instance if needed for external calls
  public getBotInstance() {
    return this.bot;
  }
}
