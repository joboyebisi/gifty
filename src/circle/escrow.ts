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
    
    console.log("🔍 [ESCROW] Initializing Circle wallet client...");
    console.log(`   CIRCLE_API_KEY: ${env.CIRCLE_API_KEY ? "✅ Set" : "❌ Missing"}`);
    console.log(`   CIRCLE_ENTITY_SECRET: ${env.CIRCLE_ENTITY_SECRET ? "✅ Set" : "❌ Missing"}`);
    console.log(`   CIRCLE_ENTITY_ID: ${env.CIRCLE_ENTITY_ID ? "✅ Set (deprecated)" : "❌ Missing"}`);
    
    // Prefer SDK if CIRCLE_ENTITY_SECRET is available (recommended)
    if (env.CIRCLE_ENTITY_SECRET) {
      try {
        console.log("🔍 [ESCROW] Attempting to initialize Circle Wallets SDK...");
        this.circleWallet = new CircleWalletSDKClient();
        this.useSDK = true;
        console.log("✅ [ESCROW] Using Circle Wallets SDK (recommended)");
      } catch (error: any) {
        console.warn("⚠️ [ESCROW] SDK initialization failed, falling back to REST API:");
        console.warn(`   Error: ${error.message}`);
        console.warn(`   Stack: ${error.stack?.slice(0, 200)}`);
        // Fall back to REST API
        try {
          console.log("🔍 [ESCROW] Attempting to initialize REST API client...");
          this.circleWallet = new CircleWalletClient();
          this.useSDK = false;
          console.log("⚠️ [ESCROW] Using REST API (fallback)");
        } catch (restError: any) {
          console.error("❌ [ESCROW] Both SDK and REST API initialization failed:");
          console.error(`   SDK Error: ${error.message}`);
          console.error(`   REST Error: ${restError.message}`);
          this.circleWallet = null;
        }
      }
    } else {
      // Use REST API if SDK not available
      try {
        console.log("⚠️ [ESCROW] CIRCLE_ENTITY_SECRET not set, using REST API");
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
  async createEscrowWallet(): Promise<{ id: string; address?: string; balances: any[] }> {
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
      
      // Try to get wallet address if available
      let address: string | undefined;
      try {
        if (this.circleWallet && typeof (this.circleWallet as any).getWalletDetails === 'function') {
          const details = await (this.circleWallet as any).getWalletDetails(wallet.id);
          address = details.address;
          if (address) {
            console.log(`✅ [ESCROW] Escrow wallet address: ${address}`);
          }
        }
      } catch (err: any) {
        console.warn(`⚠️ [ESCROW] Could not get wallet address: ${err.message}`);
      }
      
      return {
        ...wallet,
        address,
      };
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
    if (!this.circleWallet) {
      throw new Error("Circle wallet client not initialized");
    }
    const balance = await this.circleWallet.getWalletBalance(walletId);
    const balanceNum = parseFloat(balance);
    const requiredNum = parseFloat(requiredAmount);
    return balanceNum >= requiredNum;
  }

  /**
   * Fund escrow from sender's wallet using CCTP
   * Transfers USDC from sender's Arc wallet to escrow wallet (on Sepolia) using CCTP
   * This ensures all gifts settle on Arc for recipients
   */
  async fundEscrow(
    escrowWalletId: string,
    senderWalletAddress: string,
    amount: string,
    senderChain: string = "arc-testnet", // Sender wallet is on Arc
    escrowChain: string = "eth-sepolia" // Escrow wallet is on Sepolia (Circle requirement)
  ): Promise<{ success: boolean; transferId?: string; error?: string }> {
    if (!this.circleWallet) {
      return {
        success: false,
        error: "Circle wallet client not initialized",
      };
    }

    try {
      // Get escrow wallet address
      let escrowAddress: string | undefined;
      try {
        if (typeof (this.circleWallet as any).getWalletDetails === 'function') {
          const details = await (this.circleWallet as any).getWalletDetails(escrowWalletId);
          escrowAddress = details.address;
        }
      } catch (err: any) {
        console.warn(`⚠️ [ESCROW] Could not get escrow address: ${err.message}`);
      }

      // Use CCTP to transfer from sender's Arc wallet to escrow Sepolia wallet
      // This ensures cross-chain transfer with proper settlement
      const { CCTPClient } = await import("./cctp");
      const cctp = new CCTPClient();
      
      console.log(`💸 [ESCROW] Initiating CCTP transfer: ${amount} USDC from ${senderWalletAddress} (${senderChain}) to escrow ${escrowWalletId} (${escrowChain})...`);
      
      // CCTP transfer: sender (Arc) → escrow (Sepolia)
      // Note: CCTP requires the escrow wallet address, not ID
      // If we don't have the address, we'll use Circle API transfer instead
      if (escrowAddress) {
        // Use CCTP for cross-chain transfer
        const transfer = await cctp.initiateCCTPTransfer(
          senderWalletAddress, // Source: sender's wallet address (on Arc)
          senderChain,
          escrowChain,
          escrowAddress, // Destination: escrow wallet address (on Sepolia)
          amount
        );
        
        console.log(`✅ [ESCROW] CCTP transfer initiated: ${transfer.id}`);
        return {
          success: true,
          transferId: transfer.id,
        };
      } else {
        // Fallback: Use Circle API transfer (if sender is on Sepolia)
        if (senderChain === "eth-sepolia" || senderChain === "ethereum") {
          if (typeof (this.circleWallet as any).transferFromBlockchain === 'function') {
            console.log(`💸 [ESCROW] Using Circle API transfer (same chain)...`);
            const transfer = await (this.circleWallet as any).transferFromBlockchain(
              senderWalletAddress,
              escrowWalletId,
              amount,
              "ETH-SEPOLIA"
            );
            
            console.log(`✅ [ESCROW] Transfer initiated: ${transfer.id}`);
            return {
              success: true,
              transferId: transfer.id,
            };
          }
        }
        
        // Final fallback: Just verify escrow has funds (for manual funding)
        console.log(`⚠️ [ESCROW] CCTP/API transfer not available, verifying escrow balance...`);
        const hasFunds = await this.verifyEscrowBalance(escrowWalletId, amount);
        if (!hasFunds) {
          return {
            success: false,
            error: `Insufficient escrow balance. Required: ${amount} USDC. Please fund the escrow wallet manually.`,
          };
        }

        return {
          success: true,
        };
      }
    } catch (error: any) {
      console.error(`❌ [ESCROW] Funding failed:`, error.message);
      // If transfer fails, fall back to verification
      try {
        const hasFunds = await this.verifyEscrowBalance(escrowWalletId, amount);
        if (hasFunds) {
          return {
            success: true,
            error: `Transfer failed but escrow already has funds: ${error.message}`,
          };
        }
      } catch (verifyError) {
        // Ignore verification errors
      }
      
      return {
        success: false,
        error: error.message || "Failed to fund escrow",
      };
    }
  }

  /**
   * Release funds from escrow to recipient using CCTP
   * Transfers from escrow wallet (on Sepolia) to recipient wallet (on Arc) using CCTP
   * This ensures all gifts settle on Arc for recipients
   */
  async releaseFromEscrow(
    escrowWalletId: string,
    recipientAddress: string,
    amount: string,
    sourceChain: string = "eth-sepolia", // Escrow is always on Sepolia
    destinationChain: string = "arc-testnet" // Recipients receive on Arc
  ): Promise<{ transferId: string; status: string; messageHash?: string }> {
    if (!this.circleWallet) {
      throw new Error("Circle wallet client not initialized");
    }
    
    const { CCTPClient } = await import("./cctp");
    const cctp = new CCTPClient();

    // Verify escrow has sufficient funds
    const hasFunds = await this.verifyEscrowBalance(escrowWalletId, amount);
    if (!hasFunds) {
      throw new Error(`Insufficient escrow balance. Required: ${amount} USDC`);
    }

    // Get escrow wallet address for CCTP transfer
    let escrowAddress: string | undefined;
    try {
      if (typeof (this.circleWallet as any).getWalletDetails === 'function') {
        const details = await (this.circleWallet as any).getWalletDetails(escrowWalletId);
        escrowAddress = details.address;
      }
    } catch (err: any) {
      console.warn(`⚠️ [ESCROW] Could not get escrow address: ${err.message}`);
    }

    // Initiate CCTP transfer from escrow (Sepolia) to recipient (Arc)
    // This ensures cross-chain transfer with proper settlement on Arc
    console.log(`🎁 [ESCROW] Releasing ${amount} USDC from escrow ${escrowWalletId} to ${recipientAddress} via CCTP (${sourceChain} → ${destinationChain})...`);
    
    if (escrowAddress) {
      // Use CCTP with escrow wallet address
      const transfer = await cctp.initiateCCTPTransfer(
        escrowAddress, // Source: escrow wallet address (on Sepolia)
        sourceChain,
        destinationChain,
        recipientAddress, // Destination: recipient wallet (on Arc)
        amount
      );

      console.log(`✅ [ESCROW] CCTP transfer initiated: ${transfer.id}`);
      return {
        transferId: transfer.id,
        status: transfer.status,
        messageHash: transfer.messageHash,
      };
    } else {
      // Fallback: Use Circle API transfer (if recipient is on Sepolia)
      if (destinationChain === "eth-sepolia" || destinationChain === "ethereum") {
        const transfer = await (this.circleWallet as any).transferUSDC(
          escrowWalletId,
          recipientAddress,
          amount,
          "ETH-SEPOLIA"
        );
        
        return {
          transferId: transfer.id,
          status: transfer.status,
        };
      }
      
      throw new Error("Escrow wallet address not available and recipient is not on Sepolia. Cannot complete transfer.");
    }
  }
}

