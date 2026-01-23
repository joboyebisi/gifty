import { CircleWalletClient } from "./wallet";
import { CircleWalletSDKClient } from "./wallet-sdk";
import { loadEnv } from "../config/env";

export class CircleTools {
    private walletClient: CircleWalletClient;
    private sdkClient: CircleWalletSDKClient;

    constructor() {
        this.walletClient = new CircleWalletClient();
        this.sdkClient = new CircleWalletSDKClient();
    }

    /**
     * Get unified USDC balance across supported chains.
     * For User-Controlled Wallets (Social Login), we need the userToken and walletId.
     * This is a "logical" unified balance (sum of all).
     */
    async getUnifiedBalance(userToken: string, walletId: string): Promise<string> {
        const env = loadEnv();
        const apiKey = env.CIRCLE_API_KEY;

        // Check Arc Testnet (and potentially others)
        // Using the proxy endpoint approach or direct API if we have the userToken
        try {
            const response = await fetch("https://api.circle.com/v1/w3s/wallets/" + walletId + "/balances", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "X-User-Token": userToken,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch balance: ${response.statusText}`);
            }

            const data = await response.json() as any;
            const balances = data.data?.tokenBalances || [];

            // Sum up USDC balances
            let totalUSDC = 0;
            for (const balance of balances) {
                if (balance.token.symbol === "USDC" || balance.token.name.includes("USDC")) {
                    totalUSDC += parseFloat(balance.amount);
                }
            }

            return totalUSDC.toString();
        } catch (error) {
            console.error("Error checking unified balance:", error);
            return "0"; // Fail safe
        }
    }

    /**
     * Generates a payment intent/link for the user to approve.
     * In a real app, this might return a deeplink or a transaction payload.
     */
    async createPaymentIntent(amount: string, destinationAddress: string, chain: string = "ARC-TESTNET"): Promise<{
        paymentUrl: string;
        amount: string;
        destination: string;
        chain: string;
    }> {
        // For now, generate a rigorous-looking "link" that the bot can present
        // The frontend/bot would handle the actual signing when the user clicks this.
        // Format: gifty://pay?amount=10&to=0x123&chain=ARC

        const params = new URLSearchParams({
            amount,
            to: destinationAddress,
            chain,
            token: "USDC"
        });

        const frontendUrl = process.env.FRONTEND_URL || "https://gifties.app";
        const paymentUrl = `${frontendUrl}/pay?${params.toString()}`;

        return {
            paymentUrl,
            amount,
            destination: destinationAddress,
            chain
        };
    }

    /**
     * Check if a specific transfer has completed (settlement verification).
     */
    async verifySettlement(transferId: string): Promise<boolean> {
        try {
            // Logic to check transfer status via Circle API
            // Since UCW transfers are verified differently, we might need a specific endpoint
            // mimicking developer wallet check for now
            const status = await this.walletClient.getTransferStatus(transferId);
            return status.status === "complete";
        } catch (error) {
            return false;
        }
    }
}
