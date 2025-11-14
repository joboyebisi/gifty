import { TelegramBot } from "./bot";
import { loadEnv } from "../config/env";
import { getUserByTelegramId, getUserByTelegramHandle } from "../users/users";
import { handleSendUSDCGift } from "./handlers";

interface GroupMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name: string;
  };
  chat: {
    id: number;
    type: string;
    title?: string;
  };
  text?: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    user?: {
      id: number;
      username?: string;
    };
  }>;
}

/**
 * Parse group message for @bot mentions and commands
 * Examples:
 * - "@bot send gift to @username"
 * - "@bot send gift @username"
 * - "@bot send gift to username"
 */
export function parseGroupCommand(messageText: string, botUsername: string): {
  command: string | null;
  recipient?: string;
  amount?: string;
} | null {
  if (!messageText) return null;

  // Normalize bot mention (remove @ if present)
  const normalizedBotUsername = botUsername.replace(/^@/, "");
  const botMentionPattern = new RegExp(`@${normalizedBotUsername}\\s+`, "i");
  
  if (!botMentionPattern.test(messageText)) {
    return null; // Not a mention to this bot
  }

  // Remove bot mention and normalize
  const commandText = messageText.replace(botMentionPattern, "").trim().toLowerCase();

  // Parse "send gift" commands
  const sendGiftMatch = commandText.match(/send\s+gift(?:\s+to)?\s+@?(\w+)(?:\s+(\d+(?:\.\d+)?))?/i);
  if (sendGiftMatch) {
    return {
      command: "send_gift",
      recipient: sendGiftMatch[1],
      amount: sendGiftMatch[2],
    };
  }

  // Parse "send gift" with amount first
  const sendGiftAmountMatch = commandText.match(/send\s+gift\s+(\d+(?:\.\d+)?)\s+to\s+@?(\w+)/i);
  if (sendGiftAmountMatch) {
    return {
      command: "send_gift",
      recipient: sendGiftAmountMatch[2],
      amount: sendGiftAmountMatch[1],
    };
  }

  // Parse other commands
  if (commandText.startsWith("help")) {
    return { command: "help" };
  }
  if (commandText.startsWith("wallet")) {
    return { command: "wallet" };
  }
  if (commandText.startsWith("balance")) {
    return { command: "wallet" };
  }

  return null;
}

/**
 * Extract mentioned user from message entities
 */
export function extractMentionedUser(message: GroupMessage): string | null {
  if (!message.entities) return null;

  for (const entity of message.entities) {
    if (entity.type === "mention" && entity.user?.username) {
      return entity.user.username;
    }
  }

  // Fallback: extract from text
  if (message.text) {
    const mentionMatch = message.text.match(/@(\w+)/);
    if (mentionMatch && mentionMatch[1]) {
      return mentionMatch[1];
    }
  }

  return null;
}

/**
 * Handle group message with @bot mention
 */
export async function handleGroupMention(update: { message: GroupMessage }): Promise<void> {
  const bot = new TelegramBot();
  const env = loadEnv();
  const message = update.message;
  const chatId = message.chat.id;
  const userId = message.from.id;
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";

  if (!isGroup) {
    return; // Not a group chat
  }

  // Get bot username (from env or API)
  let botUsername = env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    try {
      const botInfo = await bot.getMe();
      botUsername = botInfo.result?.username;
    } catch (error) {
      console.error("Error getting bot username:", error);
      return;
    }
  }

  if (!botUsername) {
    console.error("Could not determine bot username");
    return;
  }

  // Parse command
  const parsed = parseGroupCommand(message.text || "", botUsername);
  if (!parsed || !parsed.command) {
    // Not a recognized command, show help
    await bot.sendMessage(chatId, `👋 Hi! I'm the Gifties bot. Here's how to use me in groups:

<b>Send a gift:</b>
• @${botUsername} send gift to @username
• @${botUsername} send gift @username
• @${botUsername} send gift 10.00 to @username

<b>Other commands:</b>
• @${botUsername} help - Show this help
• @${botUsername} wallet - Check your wallet balance

<i>Note: You need to connect your wallet first. Use /wallet in a private chat with me.</i>`, {
      parse_mode: "HTML",
      reply_to_message_id: message.message_id,
    });
    return;
  }

  // Handle commands
  if (parsed.command === "help") {
    await bot.sendMessage(chatId, `👋 <b>Gifties Bot Commands</b>

<b>Send a gift:</b>
• @${botUsername} send gift to @username
• @${botUsername} send gift @username [amount]

<b>Check wallet:</b>
• @${botUsername} wallet

<i>Tip: Connect your wallet first using /wallet in a private chat with me.</i>`, {
      parse_mode: "HTML",
      reply_to_message_id: message.message_id,
    });
    return;
  }

  if (parsed.command === "wallet") {
    // Import and use wallet handler
    const { handleWalletCommand } = await import("./handlers");
    await handleWalletCommand(bot, chatId, userId);
    return;
  }

  if (parsed.command === "send_gift") {
    // Check if user has wallet connected
    const sender = await getUserByTelegramId(userId.toString());
    if (!sender || !sender.walletAddress) {
      await bot.sendMessage(chatId, `❌ You need to connect your wallet first!

1. Open a private chat with me: @${botUsername}
2. Use /wallet to connect your wallet
3. Then come back here and try again!`, {
        parse_mode: "HTML",
        reply_to_message_id: message.message_id,
      });
      return;
    }

    // Get recipient handle
    let recipientHandle = parsed.recipient;
    if (!recipientHandle) {
      // Try to extract from message entities
      recipientHandle = extractMentionedUser(message) || undefined;
    }

    if (!recipientHandle) {
      await bot.sendMessage(chatId, `❌ Please specify a recipient!

<b>Usage:</b>
• @${botUsername} send gift to @username
• @${botUsername} send gift @username`, {
        parse_mode: "HTML",
        reply_to_message_id: message.message_id,
      });
      return;
    }

    // Remove @ if present
    recipientHandle = recipientHandle.replace(/^@/, "");

    // Check if recipient exists
    const recipient = await getUserByTelegramHandle(recipientHandle);
    if (!recipient) {
      await bot.sendMessage(chatId, `⚠️ User @${recipientHandle} hasn't set up Gifties yet.

They can get started by:
1. Opening a chat with me: @${botUsername}
2. Using /start to connect their wallet

Once they're set up, you can send them a gift!`, {
        parse_mode: "HTML",
        reply_to_message_id: message.message_id,
      });
      return;
    }

    // If amount is provided, create gift directly
    if (parsed.amount) {
      const amount = parseFloat(parsed.amount);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, `❌ Invalid amount. Please provide a positive number (e.g., 10.00)`, {
          reply_to_message_id: message.message_id,
        });
        return;
      }

      // Create gift with specified amount
      await handleSendUSDCGift(bot, chatId, userId, undefined, recipientHandle, amount);
    } else {
      // Start interactive flow - prompt for amount
      await bot.sendMessage(chatId, `🎁 <b>Sending gift to @${recipientHandle}</b>

How much USDC do you want to send?

<b>Usage:</b>
• @${botUsername} send gift <amount> to @${recipientHandle}
• Example: @${botUsername} send gift 10.00 to @${recipientHandle}

<i>Note: This will create a claimable gift link that @${recipientHandle} can claim.</i>`, {
        parse_mode: "HTML",
        reply_to_message_id: message.message_id,
      });
    }
  }
}

