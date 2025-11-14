export type Provider = "gemini" | "groq" | "perplexity" | "grok" | "llama";

export interface PersonaInput {
  snippets: string[];
  stats: Record<string, number | string>;
  locale?: string;
}

export interface MessageConstraints {
  maxChars?: number;
  tone?: "heartfelt" | "playful" | "formal" | "casual";
  variants?: number; // number of variants to produce
  locale?: string;
}

export interface RelationshipContext {
  senderName?: string;
  recipientHandle?: string;
  relationship?: "friend" | "coworker" | "family" | "partner" | "acquaintance";
  culturalHints?: string[];
}

export interface MessageVariants {
  personaSummary: string;
  messages: string[];
}

export interface GenerationOptions {
  provider?: Provider;
  stream?: boolean;
}


