/**
 * Circle Wallets SDK Implementation
 * Uses @circle-fin/developer-controlled-wallets SDK (recommended approach)
 * 
 * This is the preferred way to interact with Circle Wallets API
 * See: https://developers.circle.com/wallets/docs/developer-controlled-wallets
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { Env, loadEnv } from "../config/env";
import { randomUUID } from "crypto";

// Circle API types
interface CircleWallet {
  id: string;
  entityId: string;
  type: string;
  description: string;
  balances: Array<{
    amount: string;
    currency: string;
  }>;
}

interface WalletSet {
  id: string;
  name: string;
}

/**
 * Circle Wallets SDK Client
 * Uses the official Circle SDK for developer-controlled wallets
 */
export class CircleWalletSDKClient {
  private walletSDK: any;
  private apiKey: string;
  private entitySecret: string;
  private walletSetId: string | null = null;

  constructor() {
    const env = loadEnv();
    
    if (!env.CIRCLE_API_KEY) {
      throw new Error("CIRCLE_API_KEY is required");
    }
    
    if (!env.CIRCLE_ENTITY_SECRET) {
      throw new Error(
        "CIRCLE_ENTITY_SECRET is required. " +
        "Get it from Circle Console → Settings → Entity Secret. " +
        "Note: This is different from CIRCLE_ENTITY_ID."
      );
    }
    
    this.apiKey = env.CIRCLE_API_KEY;
    this.entitySecret = env.CIRCLE_ENTITY_SECRET;
    
    // Initialize Circle Wallets SDK
    this.walletSDK = initiateDeveloperControlledWalletsClient({
      apiKey: this.apiKey,
      entitySecret: this.entitySecret,
    });
  }

  /**
   * Create or get wallet set
   * Wallet sets are required before creating wallets
   */
  async getOrCreateWalletSet(name: string = "Gifty Escrow Wallets"): Promise<string> {
    if (this.walletSetId) {
      return this.walletSetId;
    }

    try {
      // Try to get existing wallet sets first
      const walletSets = await this.walletSDK.listWalletSets();
      
      if (walletSets?.data?.walletSets && walletSets.data.walletSets.length > 0) {
        const walletSetId = walletSets.data.walletSets[0].id;
        if (!walletSetId) {
          throw new Error("Wallet set ID is null");
        }
        this.walletSetId = walletSetId;
        console.log(`✅ [CIRCLE/SDK] Using existing wallet set: ${walletSetId}`);
        return walletSetId;
      }

      // Create new wallet set if none exists
      console.log(`🔍 [CIRCLE/SDK] Creating wallet set: ${name}`);
      const walletSetResponse = await this.walletSDK.createWalletSet({
        name,
      });

      const walletSetId = walletSetResponse?.data?.walletSet?.id;
      if (walletSetId) {
        this.walletSetId = walletSetId;
        console.log(`✅ [CIRCLE/SDK] Wallet set created: ${walletSetId}`);
        return walletSetId;
      }

      throw new Error("Failed to create wallet set: No ID returned");
    } catch (error: any) {
      console.error("❌ [CIRCLE/SDK] Wallet set creation failed:", error.message);
      throw new Error(`Failed to create/get wallet set: ${error.message}`);
    }
  }

  /**
   * Create a developer-controlled wallet
   * Requires a wallet set to be created first
   */
  // Note: Only ETH-SEPOLIA is supported for developer wallets
  // Arc Testnet is not supported yet - we'll use CCTP to bridge from Sepolia to Arc
  async createWallet(blockchains: string[] = ["ETH-SEPOLIA"]): Promise<CircleWallet> {
    try {
      // Ensure wallet set exists
      const walletSetId = await this.getOrCreateWalletSet();

      console.log(`🔍 [CIRCLE/SDK] Creating wallet on blockchains: ${blockchains.join(", ")}`);
      
      const walletData = await this.walletSDK.createWallets({
        idempotencyKey: randomUUID(),
        blockchains,
        accountType: "SCA", // Smart Contract Account (recommended)
        walletSetId,
      });

      if (!walletData?.data?.wallets || walletData.data.wallets.length === 0) {
        throw new Error("No wallets returned from Circle API");
      }

      const wallet = walletData.data.wallets[0];
      console.log(`✅ [CIRCLE/SDK] Wallet created: ${wallet.id}`);
      
      return {
        id: wallet.id,
        entityId: wallet.entityId || "",
        type: wallet.type || "SCA",
        description: wallet.description || "",
        balances: wallet.balances || [],
      };
    } catch (error: any) {
      console.error("❌ [CIRCLE/SDK] Wallet creation failed:", error.message);
      console.error("   Error details:", error);
      throw new Error(`Failed to create Circle wallet: ${error.message}`);
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletId: string): Promise<string> {
    try {
      const walletData = await this.walletSDK.getWallets({
        walletIds: [walletId],
      });

      if (!walletData?.data?.wallets || walletData.data.wallets.length === 0) {
        throw new Error(`Wallet ${walletId} not found`);
      }

      const wallet = walletData.data.wallets[0];
      const usdcBalance = wallet.balances?.find((b: any) => b.currency === "USDC");
      return usdcBalance?.amount || "0";
    } catch (error: any) {
      console.error(`❌ [CIRCLE/SDK] Failed to get wallet balance:`, error.message);
      throw error;
    }
  }

  /**
   * Transfer USDC from Circle wallet to recipient
   */
  async transferUSDC(
    walletId: string,
    recipientAddress: string,
    amount: string,
    chain: string = "ETH-SEPOLIA"
  ): Promise<{ id: string; status: string }> {
    try {
      // Generate entity secret ciphertext for signing
      const entitySecretCiphertext = await this.walletSDK.generateEntitySecretCiphertext();

      // For now, use the REST API transfer endpoint
      // SDK transfer methods may vary - check Circle docs for latest API
      const response = await fetch(`${this.getBaseUrl()}/developer/transactions/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          idempotencyKey: randomUUID(),
          source: {
            type: "wallet",
            id: walletId,
          },
          destination: {
            type: "blockchain",
            address: recipientAddress,
            chain,
          },
          amount: {
            amount,
            currency: "USDC",
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Transfer failed: ${response.status} ${error}`);
      }

      const result = await response.json() as { data: { id: string; status: string } };
      if (!result.data || !result.data.id || !result.data.status) {
        throw new Error("Invalid response from Circle API");
      }
      return {
        id: result.data.id,
        status: result.data.status,
      };
    } catch (error: any) {
      console.error(`❌ [CIRCLE/SDK] Transfer failed:`, error.message);
      throw error;
    }
  }

  private getBaseUrl(): string {
    return process.env.NODE_ENV === "production"
      ? "https://api.circle.com/v1/w3s"
      : "https://api-sandbox.circle.com/v1/w3s";
  }
}

