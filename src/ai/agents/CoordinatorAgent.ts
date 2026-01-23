import { BaseAgent } from "./BaseAgent";
import { AgentType, AgentMessage } from "./AgentBus";
import { Context } from "grammy";

// Type definition for Telegram Context passed in payload
interface TelegramPayload {
    ctx?: Context; // Optional because we might not pass full context deeply
    text: string;
    chatId: number;
    userId: number;
    username?: string;
}

export class CoordinatorAgent extends BaseAgent {
    private activeContexts: Map<string, Context> = new Map();

    constructor() {
        super(AgentType.COORDINATOR);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        switch (message.type) {
            case "user_message":
                await this.processUserMessage(message);
                break;
            case "upcoming_birthdays_result":
                await this.handleBirthdaysResult(message);
                break;
            case "collection_pool_created":
                await this.handlePoolCreated(message);
                break;
            case "gift_suggestion":
                await this.handleGiftSuggestion(message);
                break;
            case "payment_ready":
                await this.handlePaymentReady(message);
                break;
            case "error":
                await this.handleError(message);
                break;
            default:
                console.log(`[CoordinatorAgent] Unknown message type: ${message.type}`);
        }
    }

    // Entry point from Telegram Handler
    public async handleTelegramMessage(ctx: Context) {
        if (!ctx.message || !ctx.message.text) return;

        // Store context for reply later if needed (simple in-memory for now)
        // A better way is to pass chatId and use bot.api directly in responses
        const chatId = ctx.from?.id;
        if (chatId) {
            this.activeContexts.set(chatId.toString(), ctx);
        }

        await this.processUserMessage({
            id: crypto.randomUUID(),
            from: AgentType.COORDINATOR, // Self-sourced for now
            to: AgentType.COORDINATOR,
            type: "user_message",
            timestamp: Date.now(),
            payload: {
                text: ctx.message.text,
                chatId: ctx.chat?.id,
                userId: ctx.from?.id,
                username: ctx.from?.username,
                // Don't pass full ctx in internal message to avoid circular refs/complexity
            }
        });
    }

    private async processUserMessage(message: AgentMessage) {
        const { text, chatId, username } = message.payload as TelegramPayload;
        console.log(`[Coordinator] Processing: "${text}" from ${username}`);

        // Simple strict parsing for now, can be upgraded to LLM-based intent classification
        const lowerText = text.toLowerCase();

        if (lowerText.includes("whose birthday")) {
            console.log("[Coordinator] Detected birthday intent");
            this.send(AgentType.BIRTHDAY, "check_upcoming_birthdays", {
                days: 14, // Check next 2 weeks
                chatId
            });
        } else if (lowerText.includes("start collection") || lowerText.includes("collect for")) {
            console.log("[Coordinator] Detected collection intent");
            // Extract target (very naive extraction)
            const targetMatch = text.match(/for @?(\w+)/);
            const targetHandle = targetMatch ? targetMatch[1] : "unknown";

            this.send(AgentType.FINANCE, "create_collection_pool", {
                recipientHandle: targetHandle,
                targetAmount: 50, // Default target 50 USDC
                chatId
            });
        } else if (lowerText.includes("find gift") || lowerText.includes("buy for")) {
            console.log("[Coordinator] Detected shopping intent");
            // Naive extraction
            const query = text.replace(/find gift|buy for/i, "").trim();
            const recipientHandle = username || "user"; // Fallback

            this.send(AgentType.COMMERCE, "find_gift", {
                query,
                chatId,
                recipientHandle,
                // In real app, we'd look up userToken/walletId from DB
                userToken: "mock_user_token",
                walletId: "mock_wallet_id"
            });
        } else if (lowerText.includes("confirm purchase") || lowerText.includes("yes buy it")) {
            console.log("[Coordinator] Detected purchase confirmation");
            // Need session ID context for real app
            // For demo, we might pick the last active session
            const lastSessionId = `session_${chatId}_last`; // Simplified

            this.send(AgentType.COMMERCE, "confirm_purchase", {
                sessionId: lastSessionId,
                chatId,
                userToken: "mock_user_token"
            });
        } else {
            // Default / Fallback: ask LLM (DeepSeek) or ignore
        }
    }

    private async handleBirthdaysResult(message: AgentMessage) {
        const { birthdays, chatId } = message.payload;
        if (!chatId) return;

        // Use grammy context to reply if available/stored, or use bot API
        // For this prototype, we'll assume we have a way to reply.
        // In a real app, Coordinator would emit an event that the Telegram layer listens to,
        // or call a "TelegramService" to send the message.

        // Emulating reply via console for now
        console.log(`[Coordinator] RESULT: user_reply -> Chat ${chatId}: Found ${birthdays.length} birthdays.`);

        // Check if there are birthdays to act on
        if (birthdays.length > 0) {
            // Proactively ask if they want to start a collection
            const nextBirthday = birthdays[0];
            // Logic to suggest action
        }
    }

    private async handlePoolCreated(message: AgentMessage) {
        const { poolId, paymentLink, chatId, recipientHandle } = message.payload;
        console.log(`[Coordinator] RESULT: user_reply -> Chat ${chatId}: Pool created for ${recipientHandle}! Link: ${paymentLink}`);
    }

    private async handleGiftSuggestion(message: AgentMessage) {
        const { product, reason, balanceMsg, costs, chatId } = message.payload;
        console.log(`[Coordinator] RESULT: user_reply -> Chat ${chatId}: Found: ${product.name} (${costs} USDC). Reason: ${reason}. ${balanceMsg}`);
    }

    private async handlePaymentReady(message: AgentMessage) {
        const { product, paymentUrl, claimLink, amount, chatId } = message.payload;
        console.log(`[Coordinator] RESULT: user_reply -> Chat ${chatId}: Buying ${product.name}! Pay here: ${paymentUrl}. \nOnce paid, give this link to recipient: ${claimLink}`);
    }

    private async handleError(message: AgentMessage) {
        console.error(`[Coordinator] Received error from ${message.from}:`, message.payload.error);
    }
}
