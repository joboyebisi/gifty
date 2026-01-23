import { loadEnv } from "../../config/env";

interface DeepSeekConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
}

interface CompletionOptions {
    temperature?: number;
    maxTokens?: number;
}

export class DeepSeekProvider {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(config?: DeepSeekConfig) {
        const env = loadEnv();
        this.apiKey = config?.apiKey || env.DEEPSEEK_API_KEY || "";
        this.baseUrl = config?.baseUrl || "https://api.deepseek.com/v1";
        this.model = config?.model || "deepseek-chat";

        if (!this.apiKey) {
            console.warn("DeepSeek API Key not found. Please set DEEPSEEK_API_KEY.");
        }
    }

    public async complete(prompt: string, options?: CompletionOptions): Promise<string> {
        if (!this.apiKey) {
            throw new Error("DeepSeek API Key missing");
        }

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    temperature: options?.temperature || 0.7,
                    max_tokens: options?.maxTokens || 1000,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
        } catch (error) {
            console.error("DeepSeek completion failed:", error);
            throw error;
        }
    }

    public async generateJSON(prompt: string, schema?: any): Promise<any> {
        const jsonPrompt = `${prompt}\n\nPlease respond with valid JSON only. ${schema ? `Schema: ${JSON.stringify(schema)}` : ""}`;
        const result = await this.complete(jsonPrompt, { temperature: 0.1 });

        try {
            // Basic cleanup for markdown code blocks matches
            const jsonStr = result.replace(/```json\n?|\n?```/g, "").trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from DeepSeek response:", result);
            throw new Error("Failed to parse JSON response");
        }
    }
}
