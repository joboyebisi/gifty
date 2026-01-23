import { CircleTools } from "../circle/tools";

// Mock database for claims
// In production, use Supabase/Postgres
const claimsDB = new Map<string, {
    claimed: boolean;
    orderId?: string;
    shipping?: any;
}>();

export class RedemptionService {
    private circle: CircleTools;

    constructor() {
        this.circle = new CircleTools();
    }

    /**
     * Redeemer submits their shipping info.
     * This triggers the fulfillment via "CommerceAgent" logic (e.g., Crossmint/Amazon).
     */
    async redeemGift(claimCode: string, shippingDetails: {
        name: string;
        address: string;
        city: string;
        zip: string;
    }): Promise<{ success: boolean; orderId?: string; message: string }> {

        // 1. Verify Claim Code (Mock check)
        // In real app, check DB for validity and if already claimed
        if (claimsDB.get(claimCode)?.claimed) {
            return { success: false, message: "Gift already claimed." };
        }

        console.log(`[Redemption] Processing claim ${claimCode} for ${shippingDetails.name}`);

        // 2. Trigger Fulfillment (Mock Crossmint/Amazon Purchase)
        // Here we would call the actual fulfillment API using the funds locked in the GiftPool
        try {
            const orderId = await this.fulfillOrder(claimCode, shippingDetails);

            // 3. Mark as claimed
            claimsDB.set(claimCode, {
                claimed: true,
                orderId,
                shipping: shippingDetails
            });

            return {
                success: true,
                orderId,
                message: "Redemption successful! Your gift is on the way."
            };
        } catch (error: any) {
            console.error("Redemption Failed:", error);
            return { success: false, message: "Fulfillment failed. Please contact support." };
        }
    }

    // Simulate Crossmint/Amazon fulfillment
    private async fulfillOrder(claimCode: string, shipping: any): Promise<string> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        const mockOrderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        console.log(`[Fulfillment] Order placed via Crossmint (Mock): ${mockOrderId}`);
        console.log(`[Fulfillment] Shipping to: ${shipping.address}`);

        return mockOrderId;
    }
}
