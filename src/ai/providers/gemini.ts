import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadEnv } from "../../config/env";
import type { MessageConstraints, MessageVariants, PersonaInput, RelationshipContext } from "../types";

// ... existing code ...
function buildPersonaPrompt(input: PersonaInput): string {
  const snippets = input.snippets.slice(0, 20).join("\n---\n");
  return `You are an assistant deriving a concise persona summary for a birthday message.\nLocale: ${input.locale ?? "en"}\nGiven chat snippets and lightweight stats, produce a brief, neutral summary (~60-100 words) focusing on tone, interests, and style.\nAvoid protected attributes or sensitive inferences.\n\nSnippets:\n${snippets}\n\nStats:${JSON.stringify(input.stats)}`;
}

function buildMessagePrompt(persona: string, rel: RelationshipContext, constraints: MessageConstraints): string {
  const tone = constraints.tone ?? "heartfelt";
  const max = constraints.maxChars ?? 280;
  const locale = constraints.locale ?? "en";
  return `Write a short birthday message in ${locale}. Tone: ${tone}. Max ${max} characters.\nAudience: @${rel.recipientHandle ?? "friend"}. Relationship: ${rel.relationship ?? "friend"}. Sender: ${rel.senderName ?? "A friend"}.\nIncorporate persona style subtly without stating it. Avoid protected traits, medical or sensitive topics.\nPersona summary: ${persona}`;
}

export async function geminiGenerate(
  apiKey: string,
  action: "persona" | "messages",
  payload: { personaInput?: PersonaInput; persona?: string; rel?: RelationshipContext; constraints?: MessageConstraints }
): Promise<MessageVariants> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  if (action === "persona" && payload.personaInput) {
    const prompt = buildPersonaPrompt(payload.personaInput);
    const res = await model.generateContent(prompt);
    const persona = (res.response.text() || "").trim();
    return { personaSummary: persona, messages: [] };
  }

  if (action === "messages" && payload.persona && payload.rel && payload.constraints) {
    const variants = Math.max(1, Math.min(payload.constraints.variants ?? 2, 5));
    const messages: string[] = [];
    for (let i = 0; i < variants; i++) {
      const prompt = buildMessagePrompt(payload.persona, payload.rel, payload.constraints);
      const res = await model.generateContent(prompt);
      messages.push((res.response.text() || "").trim());
    }
    return { personaSummary: payload.persona, messages };
  }

  throw new Error("Invalid geminiGenerate parameters");
}

// NEW: Gemini Provider for Agents
interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

export class GeminiProvider {
  private apiKey: string;
  private modelName: string;

  constructor(config?: { apiKey?: string; model?: string }) {
    const env = loadEnv();
    this.apiKey = config?.apiKey || env.GEMINI_API_KEY || "";
    this.modelName = config?.model || "gemini-1.5-pro-latest"; // Better for reasoning

    if (!this.apiKey) {
      console.warn("Gemini API Key not found. Please set GEMINI_API_KEY.");
    }
  }

  public async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API Key missing");
    }

    try {
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens
        }
      });

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini completion failed:", error);
      throw error;
    }
  }

  public async generateJSON(prompt: string, schema?: any): Promise<any> {
    const jsonPrompt = `${prompt}\n\nPlease respond with valid JSON only. Do not include markdown formatting like \`\`\`json.`;
    const result = await this.complete(jsonPrompt, { temperature: 0.1 });

    try {
      // Basic cleanup for markdown code blocks matches if Gemini adds them despite instruction
      const jsonStr = result.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse JSON from Gemini response:", result);
      throw new Error("Failed to parse JSON response");
    }
  }
}
