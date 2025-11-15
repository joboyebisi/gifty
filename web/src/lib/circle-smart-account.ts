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
import { createBundlerClient } from "viem/account-abstraction";
import type { SmartAccount } from "viem/account-abstraction";
import { arcTestnet } from "../config/chains";

/**
 * Create Circle Smart Account from Dynamic wallet
 * This enables Circle Smart Accounts (account abstraction, gasless transactions)
 */
export async function createCircleSmartAccountFromDynamic(
  walletClient: any // Dynamic wallet client from useWalletClient()
): Promise<SmartAccount> {
  const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
  const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL || "https://api.circle.com/v1/w3s";

  if (!clientKey) {
    throw new Error(
      "NEXT_PUBLIC_CIRCLE_CLIENT_KEY is required. Get it from Circle Console → Keys → Create Client Key"
    );
  }

  // Use Arc network
  const networkName = "arc";
  const chainId = arcTestnet.id;

  // Create Circle modular transport
  const modularTransport = toModularTransport(
    `${clientUrl}/${networkName}`,
    clientKey
  );

  // Create public client with Circle transport
  const publicClient = createPublicClient({
    chain: {
      id: chainId,
      name: "Arc",
      nativeCurrency: {
        name: "USDC",
        symbol: "USDC",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [arcTestnet.rpcUrls.default.http[0]],
        },
      },
    },
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

