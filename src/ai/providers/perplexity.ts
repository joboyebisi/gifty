import { request } from "undici";
import type { MessageConstraints, MessageVariants, PersonaInput, RelationshipContext } from "../types";

// Perplexity: simple REST completion (pplx-70b-online or pplx-7b-online, etc.)
const PPLX_MODEL = "llama-3.1-70b-instruct";

function personaPrompt(input: PersonaInput): string {
  const snippets = input.snippets.slice(0, 20).join("\n---\n");
  return `Summarize persona for birthday wishes (60-100 words). Avoid sensitive traits.\nLocale: ${input.locale ?? "en"}\nSnippets:\n${snippets}\nStats:${JSON.stringify(input.stats)}`;
}

function messagesPrompt(persona: string, rel: RelationshipContext, constraints: MessageConstraints): string {
  const tone = constraints.tone ?? "heartfelt";
  const max = constraints.maxChars ?? 280;
  const locale = constraints.locale ?? "en";
  return `Write a short birthday message. Locale: ${locale}. Tone: ${tone}. Max ${max} chars. Recipient: @${rel.recipientHandle ?? "friend"}. Relationship: ${rel.relationship ?? "friend"}. Sender: ${rel.senderName ?? "Friend"}. Persona: ${persona}`;
}

export async function perplexityGenerate(
  apiKey: string,
  action: "persona" | "messages",
  payload: { personaInput?: PersonaInput; persona?: string; rel?: RelationshipContext; constraints?: MessageConstraints }
): Promise<MessageVariants> {
  const url = "https://api.perplexity.ai/chat/completions";
  if (action === "persona" && payload.personaInput) {
    const body = {
      model: PPLX_MODEL,
      messages: [
        { role: "system", content: "You write neutral persona summaries for birthday messages." },
        { role: "user", content: personaPrompt(payload.personaInput) },
      ],
      temperature: 0.3,
      max_tokens: 300,
    };
    const res = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const json = (await res.body.json()) as any;
    const text = json?.choices?.[0]?.message?.content?.trim() ?? "";
    return { personaSummary: text, messages: [] };
  }

  if (action === "messages" && payload.persona && payload.rel && payload.constraints) {
    const variants = Math.max(1, Math.min(payload.constraints.variants ?? 2, 5));
    const outputs: string[] = [];
    for (let i = 0; i < variants; i++) {
      const body = {
        model: PPLX_MODEL,
        messages: [
          { role: "system", content: "You write short, safe birthday messages." },
          { role: "user", content: messagesPrompt(payload.persona, payload.rel, payload.constraints) },
        ],
        temperature: 0.7,
        max_tokens: 300,
      };
      const res = await request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const json = (await res.body.json()) as any;
      outputs.push(json?.choices?.[0]?.message?.content?.trim() ?? "");
    }
    return { personaSummary: payload.persona, messages: outputs };
  }

  throw new Error("Invalid perplexityGenerate parameters");
}


