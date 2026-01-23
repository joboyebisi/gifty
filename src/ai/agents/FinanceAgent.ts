import { BaseAgent } from "./BaseAgent";
import { AgentType, AgentMessage } from "./AgentBus";
import { loadEnv } from "../../config/env";

export class FinanceAgent extends BaseAgent {
    constructor() {
        super(AgentType.FINANCE);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        switch (message.type) {
            case "create_collection_pool":
                await this.createCollectionPool(message);
                break;
            case "check_pool_status":
                await this.checkPoolStatus(message);
                break;
            case "distribute_pool":
                await this.distributePool(message);
                break;
            default:
                console.log(`[FinanceAgent] Unknown message type: ${message.type}`);
        }
    }

    private async createCollectionPool(message: AgentMessage) {
        console.log("[FinanceAgent] Creating collection pool...", message.payload);
        try {
            const { recipientHandle, targetAmount, chatId } = message.payload;

            // TODO: Interact with Arc Smart Contract (GiftPool.sol)
            // For now, mock the pool creation
            const poolId = `pool_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const paymentLink = `https://gifties.app/pool/${poolId}`; // Mock link

            this.send(message.from, "collection_pool_created", {
                poolId,
                recipientHandle,
                targetAmount,
                paymentLink,
                chatId,
                originalRequestId: message.id
            });

        } catch (error: any) {
            console.error("[FinanceAgent] Error creating pool:", error);
            this.send(message.from, "error", {
                error: error.message,
                originalRequestId: message.id
            });
        }
    }

    private async checkPoolStatus(message: AgentMessage) {
        // Check status logic
    }

    private async distributePool(message: AgentMessage) {
        // Logic to call smart contract distribute function
    }
}
