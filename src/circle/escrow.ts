import { CircleWalletClient } from "./wallet";
import { Env, loadEnv } from "../config/env";

/**
 * Escrow management for gift funds
 * Ensures funds are locked in escrow when gift is created
 */
export class EscrowManager {
  private circleWallet: CircleWalletClient;

  constructor() {
    this.circleWallet = new CircleWalletClient();
  }

  /**
   * Create escrow wallet and verify it's ready to receive funds
   */
  async createEscrowWallet(): Promise<{ id: string; balances: any[] }> {
    const wallet = await this.circleWallet.createWallet();
    return wallet;
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

