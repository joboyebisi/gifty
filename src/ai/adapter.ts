import { loadEnv } from "../config/env";
import type {
  GenerationOptions,
  MessageConstraints,
  MessageVariants,
  PersonaInput,
  Provider,
  RelationshipContext,
} from "./types";
import { geminiGenerate } from "./providers/gemini";
import { groqGenerate } from "./providers/groq";
import { perplexityGenerate } from "./providers/perplexity";

const env = loadEnv();

function resolveProvider(p?: Provider): Provider {
  return (p ?? (env.DEFAULT_LLM_PROVIDER as Provider) ?? "gemini");
}

export async function generatePersona(
  input: PersonaInput,
  options?: GenerationOptions
): Promise<string> {
  const provider = resolveProvider(options?.provider);
  console.log(`🤖 Generating persona with provider: ${provider}`);
  
  try {
    if (provider === "gemini") {
      const key = env.GEMINI_API_KEY;
      if (!key) {
        console.error("❌ GEMINI_API_KEY is missing");
        throw new Error("GEMINI_API_KEY is missing. Please set it in environment variables.");
      }
      const out = await geminiGenerate(key, "persona", { personaInput: input });
      if (!out.personaSummary || !out.personaSummary.trim()) {
        throw new Error("Gemini returned empty persona summary");
      }
      return out.personaSummary;
    }
    if (provider === "groq") {
      const key = env.GROQ_API_KEY;
      if (!key) {
        console.error("❌ GROQ_API_KEY is missing");
        throw new Error("GROQ_API_KEY is missing. Please set it in environment variables.");
      }
      const out = await groqGenerate(key, "llama-3.1-8b-instant", "persona", { personaInput: input });
      if (!out.personaSummary || !out.personaSummary.trim()) {
        throw new Error("Groq returned empty persona summary");
      }
      return out.personaSummary;
    }
    if (provider === "perplexity") {
      const key = env.PPLX_API_KEY;
      if (!key) {
        console.error("❌ PPLX_API_KEY is missing");
        throw new Error("PPLX_API_KEY is missing. Please set it in environment variables.");
      }
      const out = await perplexityGenerate(key, "persona", { personaInput: input });
      if (!out.personaSummary || !out.personaSummary.trim()) {
        throw new Error("Perplexity returned empty persona summary");
      }
      return out.personaSummary;
    }
    throw new Error(`Provider not yet implemented: ${provider}`);
  } catch (err: any) {
    console.error(`❌ Error in generatePersona (provider: ${provider}):`, err);
    throw err;
  }
}

export async function generateBirthdayMessages(
  persona: string,
  rel: RelationshipContext,
  constraints: MessageConstraints,
  options?: GenerationOptions
): Promise<MessageVariants> {
  const provider = resolveProvider(options?.provider);
  console.log(`🤖 Generating messages with provider: ${provider}`);
  
  try {
    if (provider === "gemini") {
      const key = env.GEMINI_API_KEY;
      if (!key) {
        console.error("❌ GEMINI_API_KEY is missing");
        throw new Error("GEMINI_API_KEY is missing. Please set it in environment variables.");
      }
      const out = await geminiGenerate(key, "messages", { persona, rel, constraints });
      if (!out.messages || out.messages.length === 0) {
        throw new Error("Gemini returned no messages");
      }
      return out;
    }
    if (provider === "groq") {
      const key = env.GROQ_API_KEY;
      if (!key) {
        console.error("❌ GROQ_API_KEY is missing");
        throw new Error("GROQ_API_KEY is missing. Please set it in environment variables.");
      }
      const out = await groqGenerate(key, "llama-3.1-8b-instant", "messages", { persona, rel, constraints });
      if (!out.messages || out.messages.length === 0) {
        throw new Error("Groq returned no messages");
      }
      return out;
    }
    if (provider === "perplexity") {
      const key = env.PPLX_API_KEY;
      if (!key) {
        console.error("❌ PPLX_API_KEY is missing");
        throw new Error("PPLX_API_KEY is missing. Please set it in environment variables.");
      }
      const out = await perplexityGenerate(key, "messages", { persona, rel, constraints });
      if (!out.messages || out.messages.length === 0) {
        throw new Error("Perplexity returned no messages");
      }
      return out;
    }
    throw new Error(`Provider not yet implemented: ${provider}`);
  } catch (err: any) {
    console.error(`❌ Error in generateBirthdayMessages (provider: ${provider}):`, err);
    throw err;
  }
}


