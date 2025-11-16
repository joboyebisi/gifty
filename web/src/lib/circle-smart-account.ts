/**
 * Circle Smart Account Integration with Dynamic
 * Enables embedded wallets, gasless transactions, and account abstraction
 * Based on: https://developers.circle.com/w3s/modular-wallets-integ-dynamic
 */

import {
  toCircleSmartAccount,
  toModularTransport,
  walletClientToLocalAccount,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, http } from "viem";
import type { Chain } from "viem";
import { polygonAmoy } from "viem/chains";
import { createBundlerClient } from "viem/account-abstraction";
import type { SmartAccount } from "viem/account-abstraction";
import { sepoliaTestnet } from "../config/chains";

/**
 * Create Circle Smart Account from Dynamic wallet
 * This enables Circle Smart Accounts (account abstraction, gasless transactions)
 */
export async function createCircleSmartAccountFromDynamic(
  walletClient: any // Dynamic wallet client from useWalletClient()
): Promise<SmartAccount> {
  const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
  // IMPORTANT: Get the exact Client URL from Circle Console → Modular Wallets → Configurator
  // Example: https://modular-sdk.circle.com/v1/rpc/w3s/buidl
  // The code will append the network name (e.g., /arc) to create the full URL
  // Final URL will be: https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arc
  const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL || "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

  if (!clientKey) {
    throw new Error(
      "NEXT_PUBLIC_CIRCLE_CLIENT_KEY is REQUIRED for gasless transactions. " +
      "Get it from Circle Console → Keys → Create Client Key. " +
      "Without this, transactions will fail."
    );
  }

  if (!process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL) {
    console.warn(
      "⚠️ NEXT_PUBLIC_CIRCLE_CLIENT_URL not set. Using default sandbox URL. " +
      "Get the exact Client URL from Circle Console → Modular Wallets → Configurator and set it in Vercel environment variables."
    );
  }

  // Circle Modular Wallets supports: polygonAmoy, sepolia, baseSepolia, etc.
  // Arc is NOT supported by Circle Modular Wallets yet
  // Default to polygonAmoy for demo (Circle's recommended testnet)
  const rawNetwork = (process.env.NEXT_PUBLIC_CIRCLE_NETWORK || "polygonAmoy").toLowerCase();
  const networkPath = process.env.NEXT_PUBLIC_CIRCLE_NETWORK_PATH || 
    (rawNetwork === "polygonamoy" ? "polygonAmoy" : 
     rawNetwork === "sepolia" ? "sepolia" : 
     rawNetwork);

  const normalizedClientUrl = clientUrl.replace(/\/$/, "");

  // Use Polygon Amoy as default (Circle's supported network)
  let chain: Chain = polygonAmoy;
  if (rawNetwork.includes("sepolia")) {
    chain = sepoliaTestnet;
  }

  const transportUrl = `${normalizedClientUrl}/${networkPath}`;

  // Create Circle modular transport
  const modularTransport = toModularTransport(transportUrl, clientKey);

  // Create public client with Circle transport
  const publicClient = createPublicClient({
    chain,
    transport: modularTransport,
  });

  // Create bundler client for user operations (gasless transactions)
  const bundlerClient = createBundlerClient({
    chain: publicClient.chain,
    transport: modularTransport,
  });

  // Convert Dynamic wallet to local account
  const owner = walletClientToLocalAccount(walletClient);

  // Create Circle Smart Account
  const smartAccount = await toCircleSmartAccount({
    client: publicClient,
    owner,
  });

  return smartAccount;
}

/**
 * Get Circle Smart Account address
 * This is the address users will see and use for transactions
 */
export async function getCircleSmartAccountAddress(
  walletClient: any
): Promise<`0x${string}`> {
  const smartAccount = await createCircleSmartAccountFromDynamic(walletClient);
  return smartAccount.address;
}

