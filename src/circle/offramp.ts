import { Env, loadEnv } from "../config/env";

/**
 * Circle Business Account API for Offramp (Crypto to Fiat)
 * Uses Circle Mint APIs for payouts to bank accounts
 */
export class CircleOfframpClient {
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
   * Link a bank account for withdrawals (offramp)
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
   * Create a payout (withdraw USDC to bank account)
   */
  async createPayout(params: {
    sourceWalletId: string;
    bankAccountId: string;
    amount: string; // Amount in USD (e.g., "1.00")
    currency: string; // "USD" or "EUR"
  }): Promise<any> {
    const result = await this.request("POST", "/businessAccount/payouts", {
      idempotencyKey: crypto.randomUUID(),
      destination: {
        type: "wire",
        id: params.bankAccountId,
      },
      amount: {
        currency: params.currency,
        amount: params.amount,
      },
    });
    return result.data;
  }

  /**
   * Get payout status
   */
  async getPayoutStatus(payoutId: string): Promise<any> {
    const result = await this.request("GET", `/businessAccount/payouts/${payoutId}`);
    return result.data;
  }

  /**
   * List all payouts
   */
  async listPayouts(): Promise<any> {
    const result = await this.request("GET", "/businessAccount/payouts");
    return result.data;
  }
}

