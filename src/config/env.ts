import { z } from "zod";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("3001"),
  DEFAULT_LLM_PROVIDER: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  PPLX_API_KEY: z.string().optional(),
  GROK_API_KEY: z.string().optional(),
  LLAMA_API_URL: z.string().url().optional(),
  LLAMA_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  // Circle API
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_ENTITY_ID: z.string().optional(),
  CIRCLE_ENTITY_SECRET: z.string().optional(),
  CIRCLE_CLIENT_KEY: z.string().optional(), // For Modular Wallets SDK
  CIRCLE_CLIENT_URL: z.string().optional(), // For Modular Wallets SDK
  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  // Frontend URL
  FRONTEND_URL: z.string().default("https://gifties-w3yr.vercel.app"), // Update when new Vercel URL is provided
  // Goody API
  GOODY_API_KEY: z.string().optional(),
  GOODY_API_BASE_URL: z.string().url().optional(),
  GOODY_WEBHOOK_SECRET: z.string().optional(),
  // Arc Testnet RPC (optional, defaults to official RPC)
  ARC_TESTNET_RPC_URL: z.string().url().optional(),
  // USDC Contract Address on Arc Testnet (optional, defaults to official ERC-20 address)
  ARC_TESTNET_USDC_ADDRESS: z.string().optional(),
  // Sepolia RPC (optional, defaults to public RPC)
  SEPOLIA_RPC_URL: z.string().url().optional(),
  // 1inch API (optional, for DEX aggregator)
  ONEINCH_API_KEY: z.string().optional(),
  NEXT_PUBLIC_ONEINCH_API_KEY: z.string().optional(),
  // Smart Contract Addresses (set after deployment)
  GIFT_ESCROW_ADDRESS: z.string().optional(),
  BULK_GIFT_ADDRESS: z.string().optional(),
  GROUP_GIFT_ESCROW_ADDRESS: z.string().optional(),
  CONDITIONAL_RELEASE_ADDRESS: z.string().optional(),
  RECURRING_GIFT_ADDRESS: z.string().optional(),
  MULTISIG_GIFT_ADDRESS: z.string().optional(),
  // Deployment wallet (for contract deployment)
  DEPLOYER_PRIVATE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  // Load base .env first
  dotenv.config();
  // Then override with .env.local if present
  const localPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(localPath)) {
    dotenv.config({ path: localPath, override: true });
  }
  const parsed = schema.parse(process.env);
  // Prefer GEMINI_API_KEY, but support GOOGLE_API_KEY alias
  if (!parsed.GEMINI_API_KEY && parsed.GOOGLE_API_KEY) {
    (parsed as any).GEMINI_API_KEY = parsed.GOOGLE_API_KEY;
  }
  // Map NEXT_PUBLIC supabase vars if server vars absent
  if (!parsed.SUPABASE_URL && parsed.NEXT_PUBLIC_SUPABASE_URL) {
    (parsed as any).SUPABASE_URL = parsed.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!parsed.SUPABASE_ANON_KEY && parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    (parsed as any).SUPABASE_ANON_KEY = parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  // Sanitize DEFAULT_LLM_PROVIDER to supported values
  const allowed = new Set(["gemini", "groq", "perplexity", "grok", "llama"]);
  let provider = (parsed.DEFAULT_LLM_PROVIDER || "").toLowerCase().trim();
  if (!allowed.has(provider)) provider = "gemini";
  (parsed as any).DEFAULT_LLM_PROVIDER = provider as any;
  return parsed;
}
