import { BaseAgent } from "./BaseAgent";
import { AgentType, AgentMessage } from "./AgentBus";
import { GeminiProvider } from "../providers/gemini";
import { CircleTools } from "../../circle/tools";

interface ShoppingState {
    step: "search" | "select" | "pay" | "complete";
    query?: string;
    products?: any[];
    selectedProduct?: any;
    paymentLink?: string;
    recipientHandle?: string;
    chatId?: number;
}

export class CommerceAgent extends BaseAgent {
    private gemini: GeminiProvider;
    private circle: CircleTools;
    // In-memory state storage (would be Redis/DB in prod)
    private sessions: Map<string, ShoppingState> = new Map();

    constructor() {
        super(AgentType.COMMERCE); // We need to add COMMERCE to AgentType enum or cast
        this.gemini = new GeminiProvider();
        this.circle = new CircleTools();
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        switch (message.type) {
            case "find_gift":
                await this.handleFindGift(message);
                break;
            case "confirm_purchase":
                await this.handleConfirmPurchase(message);
                break;
            default:
                console.log(`[CommerceAgent] Unknown message type: ${message.type}`);
        }
    }

    private async handleFindGift(message: AgentMessage) {
        const { query, chatId, userToken, walletId, recipientHandle } = message.payload;
        console.log(`[CommerceAgent] Finding gift: "${query}" for ${recipientHandle}`);

        // store state
        const sessionId = `session_${chatId}_${Date.now()}`;
        this.sessions.set(sessionId, {
            step: "search",
            query,
            recipientHandle,
            chatId
        });

        try {
            // 1. Tool Call: Search Amazon (Mocked for safety/demo)
            const products = await this.searchAmazon(query);

            // 2. Reason: Select best product (Using Gemini)
            // Prompt Gemini to pick the best one or summarize options
            const prompt = `
        User wants to buy: "${query}".
        Available products: ${JSON.stringify(products)}.
        
        Select the best single option that looks high quality but reasonable price. 
        Return ONLY valid JSON: {"selectedId": "...", "reason": "..."}
      `;

            const selection = await this.gemini.generateJSON(prompt);
            const selectedProduct = products.find(p => p.id === selection.selectedId) || products[0];

            // Update state
            const state = this.sessions.get(sessionId)!;
            state.products = products;
            state.selectedProduct = selectedProduct;
            state.step = "select";
            this.sessions.set(sessionId, state);

            // 3. Tool Call: Check Balance
            // Only if we have user info
            let balanceMsg = "";
            if (userToken && walletId) {
                const balance = await this.circle.getUnifiedBalance(userToken, walletId);
                balanceMsg = `User Unified Balance: ${balance} USDC.`;
            }

            // 4. Respond to Coordinator
            this.send(message.from, "gift_suggestion", {
                sessionId,
                product: selectedProduct,
                reason: selection.reason,
                balanceMsg,
                costs: selectedProduct.price,
                chatId
            });

        } catch (error: any) {
            console.error("CommerceAgent Error:", error);
            this.send(message.from, "error", { error: error.message, chatId });
        }
    }

    private async handleConfirmPurchase(message: AgentMessage) {
        const { sessionId, userToken } = message.payload;
        const state = this.sessions.get(sessionId);

        if (!state || !state.selectedProduct) {
            this.send(message.from, "error", { error: "Session expired or invalid", chatId: message.payload.chatId });
            return;
        }

        console.log(`[CommerceAgent] Confirming purchase for ${state.selectedProduct.name}`);

        try {
            // 1. Generate Payment Link/Intent (Circle Gateway Flow)
            // In real App, we'd check if user has enough Real USDC on Arc
            const payment = await this.circle.createPaymentIntent(
                state.selectedProduct.price,
                "0xGiftySettlementAddress", // Mock Settlement Addr
                "ARC-TESTNET"
            );

            // 2. Generate Claim Link (The unique magic link for the recipient)
            const claimCode = crypto.randomUUID().split("-")[0].toUpperCase();
            const frontendUrl = process.env.FRONTEND_URL || "https://gifties.app";
            const claimLink = `${frontendUrl}/claim/${claimCode}`; // Mock link logic

            // 3. Respond
            this.send(message.from, "payment_ready", {
                sessionId,
                product: state.selectedProduct,
                paymentUrl: payment.paymentUrl,
                claimLink, // This link activates AFTER payment
                amount: payment.amount,
                chatId: state.chatId
            });

        } catch (error: any) {
            console.error("Commerce Payment Error:", error);
            this.send(message.from, "error", { error: error.message, chatId: state.chatId });
        }
    }

    // --- Mock Tools ---
    private async searchAmazon(query: string): Promise<any[]> {
        // Return mock results based on query keywords
        const isHeadphones = query.toLowerCase().includes("headphone");
        if (isHeadphones) {
            return [
                { id: "p1", name: "Sony WH-CH720N Noise Canceling", price: "89.99", image: "img_sony_url" },
                { id: "p2", name: "Anker Soundcore Life Q30", price: "59.99", image: "img_anker_url" },
            ];
        }
        // Default
        return [
            { id: "p3", name: "Generic Gift Item", price: "25.00", image: "img_gift_url" }
        ];
    }
}
