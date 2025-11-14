import { Env, loadEnv } from "../config/env";

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

interface CircleTransfer {
  id: string;
  source: {
    type: string;
    id: string;
  };
  destination: {
    type: string;
    address: string;
    chain: string;
  };
  amount: {
    amount: string;
    currency: string;
  };
  status: string;
}

// Circle API client using REST API
export class CircleWalletClient {
  private apiKey: string;
  private entityId: string;
  private baseUrl: string;

  constructor() {
    const env = loadEnv();
    if (!env.CIRCLE_API_KEY) {
      throw new Error("CIRCLE_API_KEY is required");
    }
    if (!env.CIRCLE_ENTITY_ID) {
      throw new Error(
        "CIRCLE_ENTITY_ID is required. " +
        "Find it in Circle Console → Settings or API Keys page. " +
        "See FIND_ENTITY_ID_FINAL.md for detailed instructions."
      );
    }
    this.apiKey = env.CIRCLE_API_KEY;
    this.entityId = env.CIRCLE_ENTITY_ID;
    // Use Circle's sandbox for testing, production uses different URL
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
      throw new Error(`Circle API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // Create a developer-controlled wallet
  async createWallet(): Promise<CircleWallet> {
    const result = await this.request("POST", "/developer/wallets", {
      idempotencyKey: crypto.randomUUID(),
      entityId: this.entityId,
    });
    return result.data;
  }

  // Get wallet balance
  async getWalletBalance(walletId: string): Promise<string> {
    const result = await this.request("GET", `/developer/wallets/${walletId}`);
    const usdcBalance = result.data.balances?.find((b: any) => b.currency === "USDC");
    return usdcBalance?.amount || "0";
  }

  // Transfer USDC from Circle wallet to recipient
  async transferUSDC(
    walletId: string,
    recipientAddress: string,
    amount: string,
    chain: string = "ETH-SEPOLIA" // Arc Testnet: "ETH-ARC-TESTNET"
  ): Promise<CircleTransfer> {
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
        chain,
      },
      amount: {
        amount,
        currency: "USDC",
      },
    });
    return result.data;
  }

  // Get transfer status
  async getTransferStatus(transferId: string): Promise<CircleTransfer> {
    const result = await this.request("GET", `/developer/transactions/${transferId}`);
    return result.data;
  }
}

