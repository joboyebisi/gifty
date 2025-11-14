import { loadEnv } from "../config/env";

export interface GoodyProduct {
  id: string;
  name: string;
  price: number;
  brand: {
    id: string;
    name: string;
    shipping_price: number;
  };
  subtitle?: string;
  variants?: Array<{
    id: string;
    name: string;
    subtitle?: string;
  }>;
}

export interface GoodyOrderBatch {
  from_name: string;
  send_method: "link_multiple_custom_list";
  recipients: Array<{
    first_name: string;
    last_name?: string;
    email?: string;
  }>;
  cart: {
    items: Array<{
      product_id: string;
      quantity: number;
    }>;
  };
  card_id?: string;
  message?: string;
}

export interface GoodyOrder {
  id: string;
  status: string;
  recipient_first_name: string;
  recipient_email?: string;
  individual_gift_link: string;
  message?: string;
}

export class GoodyClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    const env = loadEnv();
    this.apiKey = env.GOODY_API_KEY || "";
    this.baseUrl = env.GOODY_API_BASE_URL || "https://api.sandbox.ongoody.com";
    
    if (!this.apiKey) {
      throw new Error("GOODY_API_KEY is required");
    }
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Goody API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  async getProducts(page: number = 1, perPage: number = 100): Promise<{ data: GoodyProduct[]; list_meta: { total_count: number } }> {
    return this.request("GET", `/v1/products?page=${page}&per_page=${perPage}`);
  }

  async searchProducts(query: string): Promise<{ data: GoodyProduct[] }> {
    // Goody API might have a search endpoint, but we'll filter client-side for now
    const allProducts = await this.getProducts(1, 100);
    const queryLower = query.toLowerCase();
    const filtered = allProducts.data.filter(
      (p) =>
        p.name.toLowerCase().includes(queryLower) ||
        p.brand.name.toLowerCase().includes(queryLower) ||
        p.subtitle?.toLowerCase().includes(queryLower)
    );
    return { data: filtered };
  }

  async createOrderBatch(batch: GoodyOrderBatch): Promise<{
    id: string;
    send_status: string;
    orders_preview: GoodyOrder[];
    orders_count: number;
  }> {
    return this.request("POST", "/v1/order_batches", batch);
  }

  async getOrder(orderId: string): Promise<GoodyOrder> {
    return this.request("GET", `/v1/orders/${orderId}`);
  }

  async getOrderBatch(batchId: string): Promise<any> {
    return this.request("GET", `/v1/order_batches/${batchId}`);
  }
}

