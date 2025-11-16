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
    
    // CIRCLE_ENTITY_ID is deprecated but still supported for backward compatibility
    // CIRCLE_ENTITY_SECRET is preferred (used by SDK)
    if (!env.CIRCLE_ENTITY_ID && !env.CIRCLE_ENTITY_SECRET) {
      throw new Error(
        "CIRCLE_ENTITY_ID or CIRCLE_ENTITY_SECRET is required. " +
        "Note: CIRCLE_ENTITY_SECRET is preferred (used by Circle Wallets SDK). " +
        "Find it in Circle Console → Settings → Entity Secret. " +
        "CIRCLE_ENTITY_ID is deprecated but still works with REST API."
      );
    }
    
    this.apiKey = env.CIRCLE_API_KEY;
    this.entityId = env.CIRCLE_ENTITY_ID || ""; // May be empty if using SDK
    // Use Circle's sandbox for testing, production uses different URL
    this.baseUrl = process.env.NODE_ENV === "production" 
      ? "https://api.circle.com/v1/w3s" 
      : "https://api-sandbox.circle.com/v1/w3s";
  }

  private async request(method: string, endpoint: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`📡 [CIRCLE/WALLET] ${method} ${endpoint}`);
    if (body) {
      console.log(`   Request body:`, JSON.stringify(body, null, 2));
    }
    
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { message: errorText };
      }
      
      console.error(`❌ [CIRCLE/WALLET] API error ${response.status}:`, errorJson);
      throw new Error(`Circle API error: ${response.status} ${JSON.stringify(errorJson)}`);
    }

    const result = await response.json();
    console.log(`✅ [CIRCLE/WALLET] Success`);
    return result;
  }

  // Create a developer-controlled wallet
  async createWallet(): Promise<CircleWallet> {
    try {
      // Circle API requires blockchains array for wallet creation
      const result = await this.request("POST", "/developer/wallets", {
        idempotencyKey: crypto.randomUUID(),
        entityId: this.entityId,
        blockchains: ["ETH-SEPOLIA"], // Only ETH-SEPOLIA is supported for developer wallets. Arc transfers use CCTP.
      });
      return result.data;
    } catch (error: any) {
      // Log detailed error for debugging
      console.error("❌ [CIRCLE/WALLET] Failed to create developer wallet:");
      console.error("   Error:", error.message);
      console.error("   Entity ID:", this.entityId);
      console.error("   Base URL:", this.baseUrl);
      
      // Check if it's a 400 error (bad request) - likely missing required fields or wrong API key type
      if (error.message?.includes("400")) {
        throw new Error(
          "Circle API 400 error: Check CIRCLE_API_KEY and CIRCLE_ENTITY_ID. " +
          "Note: CIRCLE_CLIENT_KEY (for Smart Accounts) is different from CIRCLE_API_KEY (for developer wallets). " +
          "Developer wallets may not be needed for escrow - consider using user's Dynamic wallet instead."
        );
      }
      throw error;
    }
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

