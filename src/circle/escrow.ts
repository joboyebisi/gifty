import { CircleWalletClient } from "./wallet";
import { CircleWalletSDKClient } from "./wallet-sdk";
import { Env, loadEnv } from "../config/env";

/**
 * Escrow management for gift funds
 * Ensures funds are locked in escrow when gift is created
 */
export class EscrowManager {
  private circleWallet: CircleWalletClient | CircleWalletSDKClient | null = null;
  private useSDK: boolean = false;

  constructor() {
    const env = loadEnv();
    
    // Prefer SDK if CIRCLE_ENTITY_SECRET is available (recommended)
    if (env.CIRCLE_ENTITY_SECRET) {
      try {
        this.circleWallet = new CircleWalletSDKClient();
        this.useSDK = true;
        console.log("✅ [ESCROW] Using Circle Wallets SDK (recommended)");
      } catch (error: any) {
        console.warn("⚠️ [ESCROW] SDK initialization failed, falling back to REST API:", error.message);
        // Fall back to REST API
        try {
          this.circleWallet = new CircleWalletClient();
          this.useSDK = false;
        } catch (restError: any) {
          console.error("❌ [ESCROW] Both SDK and REST API initialization failed");
          this.circleWallet = null;
        }
      }
    } else {
      // Use REST API if SDK not available
      try {
        this.circleWallet = new CircleWalletClient();
        this.useSDK = false;
        console.log("⚠️ [ESCROW] Using REST API (SDK recommended - set CIRCLE_ENTITY_SECRET)");
      } catch (error: any) {
        console.error("❌ [ESCROW] REST API initialization failed:", error.message);
        this.circleWallet = null;
      }
    }
  }

  /**
   * Create escrow wallet and verify it's ready to receive funds
   * Uses Circle Wallets SDK if CIRCLE_ENTITY_SECRET is configured (recommended)
   * Falls back to REST API if SDK not available
   */
  async createEscrowWallet(): Promise<{ id: string; balances: any[] }> {
    if (!this.circleWallet) {
      throw new Error(
        "Circle wallet client not initialized. " +
        "Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET (recommended) or CIRCLE_ENTITY_ID in Railway environment variables."
      );
    }

    try {
      console.log(`🔍 [ESCROW] Creating Circle developer wallet for escrow (${this.useSDK ? "SDK" : "REST API"})...`);
      const wallet = await this.circleWallet.createWallet();
      console.log(`✅ [ESCROW] Escrow wallet created: ${wallet.id}`);
      return wallet;
    } catch (error: any) {
      console.error("❌ [ESCROW] Failed to create Circle developer wallet:", error.message);
      console.error("   💡 Note: Circle developer wallets require:");
      console.error("      - CIRCLE_API_KEY (get from Circle Console → API Keys)");
      console.error("      - CIRCLE_ENTITY_SECRET (get from Circle Console → Settings → Entity Secret)");
      console.error("   💡 Alternative: Use user's Dynamic wallet address directly for escrow");
      throw new Error(
        `Escrow wallet creation failed: ${error.message}. ` +
        `Circle developer wallets may not be configured. Consider using user's Dynamic wallet instead.`
      );
    }
  }

  /**
   * Verify escrow wallet has sufficient funds
   */
  async verifyEscrowBalance(walletId: string, requiredAmount: string): Promise<boolean> {
    const balance = await this.circleWallet.getWalletBalance(walletId);
    const balanceNum = parseFloat(balance);
    const requiredNum = parseFloat(requiredAmount);
    return balanceNum >= requiredNum;
  }

  /**
   * Fund escrow from sender's wallet
   * Note: In production, this requires sender to approve transfer first
   */
  async fundEscrow(
    escrowWalletId: string,
    senderWalletAddress: string,
    amount: string,
    chain: string = "ETH-SEPOLIA"
  ): Promise<{ success: boolean; transferId?: string; error?: string }> {
    try {
      // In production, this would:
      // 1. Request approval from sender's wallet
      // 2. Transfer USDC from sender to escrow wallet
      // For now, we assume the escrow wallet is pre-funded
      
      // Verify escrow has funds
      const hasFunds = await this.verifyEscrowBalance(escrowWalletId, amount);
      if (!hasFunds) {
        return {
          success: false,
          error: `Insufficient escrow balance. Required: ${amount} USDC`,
        };
      }

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fund escrow",
      };
    }
  }

  /**
   * Release funds from escrow to recipient
   */
  async releaseFromEscrow(
    escrowWalletId: string,
    recipientAddress: string,
    amount: string,
    sourceChain: string,
    destinationChain: string
  ): Promise<{ transferId: string; status: string; messageHash?: string }> {
    const { CCTPClient } = await import("./cctp");
    const cctp = new CCTPClient();

    // Verify escrow has sufficient funds
    const hasFunds = await this.verifyEscrowBalance(escrowWalletId, amount);
    if (!hasFunds) {
      throw new Error(`Insufficient escrow balance. Required: ${amount} USDC`);
    }

    // Initiate CCTP transfer from escrow to recipient
    const transfer = await cctp.initiateCCTPTransfer(
      escrowWalletId,
      sourceChain,
      destinationChain,
      recipientAddress,
      amount
    );

    return {
      transferId: transfer.id,
      status: transfer.status,
      messageHash: transfer.messageHash,
    };
  }
}

