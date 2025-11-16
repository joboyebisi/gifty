/**
 * Circle Smart Account Integration with Dynamic
 * Enables embedded wallets, gasless transactions, and account abstraction
 * Based on: https://developers.circle.com/w3s/modular-wallets-integ-dynamic
 * 
 * IMPORTANT: This file ONLY handles Circle Smart Account creation.
 * Polygon Amoy is used ONLY for Circle Smart Account creation (Circle's supported network).
 * 
 * Main transactions use Arc network (configured in providers.tsx).
 * Dynamic wallet works on Arc network for all main transactions.
 * Circle Smart Account is a secondary wallet for gasless transactions on Polygon Amoy.
 */

import {
  toCircleSmartAccount,
  toModularTransport,
  walletClientToLocalAccount,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient } from "viem";
import type { Chain } from "viem";
import { polygonAmoy } from "viem/chains";
// import { createBundlerClient } from "viem/account-abstraction"; // For future gasless transactions
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
  // The code will append the network name (e.g., /polygonAmoy) to create the full URL
  // Final URL will be: https://modular-sdk.circle.com/v1/rpc/w3s/buidl/polygonAmoy
  // NOTE: This is ONLY for Circle Smart Account creation, NOT for main transactions (which use Arc)
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

  // IMPORTANT: Polygon Amoy is ONLY used for Circle Smart Account creation
  // This does NOT affect the main transaction network (Arc)
  // 
  // Circle Modular Wallets supports: polygonAmoy, sepolia, baseSepolia, etc.
  // Arc is NOT supported by Circle Modular Wallets yet
  // 
  // Main transactions use Arc network (configured in providers.tsx)
  // Circle Smart Account is a secondary wallet for gasless transactions on Polygon Amoy
  const rawNetwork = (process.env.NEXT_PUBLIC_CIRCLE_NETWORK || "polygonAmoy").toLowerCase();
  const networkPath = process.env.NEXT_PUBLIC_CIRCLE_NETWORK_PATH || 
    (rawNetwork === "polygonamoy" ? "polygonAmoy" : 
     rawNetwork === "sepolia" ? "sepolia" : 
     rawNetwork);

  const normalizedClientUrl = clientUrl.replace(/\/$/, "");

  // Use Polygon Amoy ONLY for Circle Smart Account creation (Circle's supported network)
  // This chain is ONLY used for the Circle Smart Account, NOT for main transactions
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

  // Note: bundlerClient is created for future gasless transaction support
  // Currently not used, but will be needed for sendUserOperation() calls
  // const bundlerClient = createBundlerClient({
  //   chain: publicClient.chain,
  //   transport: modularTransport,
  // });

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
 * 
 * NOTE: This returns the Circle Smart Account address on Polygon Amoy.
 * Main transactions still use Arc network via Dynamic wallet.
 * Circle Smart Account is for gasless transactions on Polygon Amoy only.
 */
export async function getCircleSmartAccountAddress(
  walletClient: any
): Promise<`0x${string}`> {
  const smartAccount = await createCircleSmartAccountFromDynamic(walletClient);
  return smartAccount.address;
}

