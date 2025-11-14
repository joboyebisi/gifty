import Groq from "groq-sdk";
import type { MessageConstraints, MessageVariants, PersonaInput, RelationshipContext } from "../types";

function buildSystemPersona() {
  return "You summarize persona neutrally for birthday messages. Avoid sensitive inferences.";
}

function buildPersonaUser(input: PersonaInput): string {
  const snippets = input.snippets.slice(0, 20).join("\n---\n");
  return `Locale: ${input.locale ?? "en"}\nSnippets:\n${snippets}\nStats:${JSON.stringify(input.stats)}\nTask: 60-100 word neutral persona summary (tone, interests, style).`;
}

function buildSystemMessages() {
  return "You write short birthday messages with specified tone and max length. Avoid sensitive topics.";
}

function buildUserMessage(persona: string, rel: RelationshipContext, constraints: MessageConstraints) {
  const tone = constraints.tone ?? "heartfelt";
  const max = constraints.maxChars ?? 280;
  const locale = constraints.locale ?? "en";
  return `Locale: ${locale}. Tone: ${tone}. Max ${max} chars. Recipient: @${rel.recipientHandle ?? "friend"}. Relationship: ${rel.relationship ?? "friend"}. Sender: ${rel.senderName ?? "Friend"}. Persona: ${persona}`;
}

export async function groqGenerate(
  apiKey: string,
  model: string,
  action: "persona" | "messages",
  payload: { personaInput?: PersonaInput; persona?: string; rel?: RelationshipContext; constraints?: MessageConstraints }
): Promise<MessageVariants> {
  const client = new Groq({ apiKey });

  if (action === "persona" && payload.personaInput) {
    const chat = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildSystemPersona() },
        { role: "user", content: buildPersonaUser(payload.personaInput) },
      ],
      temperature: 0.4,
      max_tokens: 300,
    });
    const text = chat.choices?.[0]?.message?.content?.trim() ?? "";
    return { personaSummary: text, messages: [] };
  }

  if (action === "messages" && payload.persona && payload.rel && payload.constraints) {
    const variants = Math.max(1, Math.min(payload.constraints.variants ?? 2, 5));
    const outputs: string[] = [];
    for (let i = 0; i < variants; i++) {
      const chat = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: buildSystemMessages() },
          { role: "user", content: buildUserMessage(payload.persona, payload.rel, payload.constraints) },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });
      outputs.push(chat.choices?.[0]?.message?.content?.trim() ?? "");
    }
    return { personaSummary: payload.persona, messages: outputs };
  }

  throw new Error("Invalid groqGenerate parameters");
}


