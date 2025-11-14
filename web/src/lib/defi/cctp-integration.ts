/**
 * CCTP Integration for Cross-Chain Swaps
 * 
 * This module handles the integration between DeFi swaps and Circle's CCTP
 * for cross-chain transfers that settle on Arc network.
 */

export interface CCTPTransferParams {
  amount: string;
  sourceChain: string; // "ethereum", "arc-testnet", etc.
  destinationChain: string; // "arc", "arc-testnet", etc.
  recipientAddress: string;
  senderWalletAddress?: string;
}

export interface CCTPTransferResult {
  success: boolean;
  transferId?: string;
  messageHash?: string;
  error?: string;
}

/**
 * CCTP Service for handling cross-chain transfers via Circle CCTP
 */
export class CCTPService {
  private apiUrl: string;

  constructor(apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001") {
    this.apiUrl = apiUrl;
  }

  /**
   * Initiate a CCTP transfer for cross-chain swap
   */
  async initiateTransfer(params: CCTPTransferParams): Promise<CCTPTransferResult> {
    try {
      const response = await fetch(`${this.apiUrl}/api/cctp/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: params.amount,
          sourceChain: params.sourceChain,
          destinationChain: params.destinationChain,
          recipientAddress: params.recipientAddress,
          senderWalletAddress: params.senderWalletAddress,
          currency: "USDC", // CCTP uses USDC
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "CCTP transfer failed");
      }

      const data = await response.json();

      return {
        success: true,
        transferId: data.transferId,
        messageHash: data.messageHash,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to initiate CCTP transfer",
      };
    }
  }

  /**
   * Get status of a CCTP transfer
   */
  async getTransferStatus(transferId: string): Promise<CCTPTransferResult> {
    try {
      const response = await fetch(`${this.apiUrl}/api/cctp/status/${transferId}`);

      if (!response.ok) {
        throw new Error("Failed to get CCTP transfer status");
      }

      const data = await response.json();

      return {
        success: data.status === "completed" || data.status === "pending",
        transferId: data.transferId,
        messageHash: data.messageHash,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get transfer status",
      };
    }
  }
}

