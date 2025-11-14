import { Env, loadEnv } from "../config/env";

// CCTP (Cross-Chain Transfer Protocol) for USDC transfers
interface CCTPTransfer {
  id: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
  recipientAddress: string;
  status: string;
  messageHash?: string;
}

export class CCTPClient {
  private apiKey: string;
  private entityId: string;
  private baseUrl: string;

  constructor() {
    const env = loadEnv();
    if (!env.CIRCLE_API_KEY) {
      throw new Error("CIRCLE_API_KEY is required");
    }
    if (!env.CIRCLE_ENTITY_ID) {
      throw new Error("CIRCLE_ENTITY_ID is required");
    }
    this.apiKey = env.CIRCLE_API_KEY;
    this.entityId = env.CIRCLE_ENTITY_ID;
    this.baseUrl = process.env.NODE_ENV === "production" 
      ? "https://api.circle.com/v1/w3s" 
      : "https://api-sandbox.circle.com/v1/w3s";
  }

  private async request(method: string, endpoint: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CCTP API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // Initiate CCTP cross-chain transfer
  async initiateCCTPTransfer(
    walletId: string,
    sourceChain: string,
    destinationChain: string,
    recipientAddress: string,
    amount: string
  ): Promise<CCTPTransfer> {
    // Map chain names to Circle's format
    const chainMap: Record<string, string> = {
      ethereum: "ETH-SEPOLIA",
      "eth-sepolia": "ETH-SEPOLIA",
      arc: "ETH-ARC-TESTNET",
      "arc-testnet": "ETH-ARC-TESTNET",
      "eth-arc-testnet": "ETH-ARC-TESTNET",
    };

    const sourceChainId = chainMap[sourceChain.toLowerCase()] || sourceChain;
    const destChainId = chainMap[destinationChain.toLowerCase()] || destinationChain;

    const result = await this.request("POST", `/developer/transactions/transfer`, {
      idempotencyKey: crypto.randomUUID(),
      entityId: this.entityId,
      source: {
        type: "wallet",
        id: walletId,
      },
      destination: {
        type: "blockchain",
        address: recipientAddress,
        chain: destChainId,
      },
      amount: {
        amount,
        currency: "USDC",
      },
      // CCTP-specific parameters
      fee: {
        type: "cctp",
        sourceChain: sourceChainId,
        destinationChain: destChainId,
      },
    });

    return {
      id: result.data.id,
      sourceChain: sourceChainId,
      destinationChain: destChainId,
      amount,
      recipientAddress,
      status: result.data.status,
      messageHash: result.data.messageHash,
    };
  }

  // Get CCTP transfer status
  async getCCTPStatus(transferId: string): Promise<CCTPTransfer> {
    const result = await this.request("GET", `/developer/transactions/${transferId}`);
    return {
      id: result.data.id,
      sourceChain: result.data.source?.chain || "",
      destinationChain: result.data.destination?.chain || "",
      amount: result.data.amount?.amount || "",
      recipientAddress: result.data.destination?.address || "",
      status: result.data.status,
      messageHash: result.data.messageHash,
    };
  }
}

