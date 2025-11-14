import { BridgeKit } from "@circle-fin/bridge-kit";
import { createAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { loadEnv } from "../config/env";

export type SupportedChain = 
  | "Ethereum_Sepolia"
  | "Base_Sepolia"
  | "Polygon_Amoy"
  | "Arc" // Note: Verify if Bridge Kit supports Arc
  | "Solana_Devnet";

export interface BridgeResult {
  success: boolean;
  steps: Array<{
    name: string;
    state: "pending" | "success" | "failed";
    txHash?: string;
    explorerUrl?: string;
    error?: string;
  }>;
  fromChain: string;
  toChain: string;
  amount: string;
}

/**
 * Bridge Kit integration for cross-chain USDC transfers
 * Based on: https://developers.circle.com/bridge-kit
 */
export class CircleBridge {
  private kit: BridgeKit;

  constructor() {
    this.kit = new BridgeKit();
  }

  /**
   * Bridge USDC from one chain to another
   * @param fromChain Source chain
   * @param toChain Destination chain
   * @param amount Amount in USDC (e.g., "10.00")
   * @param privateKey Private key for the wallet (for server-side)
   */
  async bridgeUSDC(
    fromChain: SupportedChain,
    toChain: SupportedChain,
    amount: string,
    privateKey: string
  ): Promise<BridgeResult> {
    try {
      // Create adapter from private key
      const adapter = createAdapterFromPrivateKey({
        privateKey,
      });

      console.log(`🌉 Bridging ${amount} USDC from ${fromChain} to ${toChain}`);

      // Execute bridge
      const result = await this.kit.bridge({
        from: { adapter, chain: fromChain },
        to: { adapter, chain: toChain },
        amount,
      });

      // Transform result to our format
      return {
        success: true,
        steps: result.steps?.map((step: any) => ({
          name: step.name,
          state: step.state === "success" ? "success" : step.state === "failed" ? "failed" : "pending",
          txHash: step.txHash,
          explorerUrl: step.data?.explorerUrl,
          error: step.error,
        })) || [],
        fromChain,
        toChain,
        amount,
      };
    } catch (error: any) {
      console.error("Bridge error:", error);
      return {
        success: false,
        steps: [{
          name: "bridge",
          state: "failed",
          error: error.message || "Bridge failed",
        }],
        fromChain,
        toChain,
        amount,
      };
    }
  }

  /**
   * Estimate bridge fees and gas
   * @param fromChain Source chain
   * @param toChain Destination chain
   * @param amount Amount in USDC
   */
  async estimateBridgeFees(
    fromChain: SupportedChain,
    toChain: SupportedChain,
    amount: string
  ): Promise<{
    estimatedGas: string;
    estimatedFee: string;
    totalCost: string;
  }> {
    // Bridge Kit may provide fee estimation
    // For now, return placeholder
    return {
      estimatedGas: "0.001",
      estimatedFee: "0.0001",
      totalCost: "0.0011",
    };
  }
}

/**
 * Get supported chains for bridging
 */
export function getSupportedChains(): SupportedChain[] {
  return [
    "Ethereum_Sepolia",
    "Base_Sepolia",
    "Polygon_Amoy",
    "Solana_Devnet",
    // Add Arc if supported
  ];
}

