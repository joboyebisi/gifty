import { Env, loadEnv } from "../config/env";

/**
 * Circle Business Account API for Onramp (Fiat to Crypto)
 * Uses Circle Mint APIs for wire transfers and deposits
 */
export class CircleOnrampClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    const env = loadEnv();
    if (!env.CIRCLE_API_KEY) {
      throw new Error("CIRCLE_API_KEY is required");
    }
    this.apiKey = env.CIRCLE_API_KEY;
    // Circle Mint API (business account)
    this.baseUrl = process.env.NODE_ENV === "production" 
      ? "https://api.circle.com/v1" 
      : "https://api-sandbox.circle.com/v1";
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

  /**
   * Link a bank account for deposits (onramp)
   * Returns wire instructions for funding
   */
  async linkBankAccount(bankDetails: {
    accountNumber: string;
    routingNumber: string;
    billingDetails: {
      name: string;
      city: string;
      country: string;
      line1: string;
      district?: string;
      postalCode: string;
    };
    bankAddress: {
      bankName: string;
      city: string;
      country: string;
      line1: string;
      district?: string;
    };
  }): Promise<any> {
    const result = await this.request("POST", "/businessAccount/banks/wires", {
      idempotencyKey: crypto.randomUUID(),
      ...bankDetails,
    });
    return result.data;
  }

  /**
   * Get wire instructions for depositing funds
   */
  async getWireInstructions(bankId: string, currency: string = "USD"): Promise<any> {
    const result = await this.request(
      "GET",
      `/businessAccount/banks/wires/${bankId}/instructions?currency=${currency}`
    );
    return result.data;
  }

  /**
   * Create a deposit (initiate fiat deposit that will be converted to USDC)
   * Note: This is typically done via bank transfer using wire instructions
   */
  async createDeposit(amount: string, currency: string = "USD"): Promise<any> {
    // In practice, deposits are done via bank wire using instructions
    // This endpoint would be used to track/initiate the deposit process
    // Actual deposit happens via bank transfer to Circle's account
    throw new Error(
      "Deposits are done via bank wire transfer. Use getWireInstructions() to get deposit details."
    );
  }
}

