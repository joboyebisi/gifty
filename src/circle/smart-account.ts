import { loadEnv } from "../config/env";
import {
  toCircleSmartAccount,
  toModularTransport,
  walletClientToLocalAccount,
  encodeTransfer,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, type Hex, parseUnits } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import type { SmartAccount } from "viem/account-abstraction";

// Arc network configuration (Official values from Arc docs)
const ARC_CHAIN_ID = 5042002; // Official Arc Testnet Chain ID
const ARC_RPC_URL = "https://rpc.testnet.arc.network";

// Polygon Amoy for testing (as per Circle docs)
const POLYGON_AMOY_CHAIN_ID = 80002;

export interface CircleSmartAccountConfig {
  clientKey: string;
  clientUrl: string;
  chainId?: number;
}

/**
 * Create a Circle Smart Account from a Dynamic wallet
 * Based on: https://developers.circle.com/wallets/modular/dynamic-integration
 */
export async function createCircleSmartAccount(
  walletClient: any, // Dynamic wallet client
  config?: CircleSmartAccountConfig
): Promise<SmartAccount> {
  const env = loadEnv();
  
  const clientKey = config?.clientKey || env.CIRCLE_CLIENT_KEY || "";
  const clientUrl = config?.clientUrl || env.CIRCLE_CLIENT_URL || "";
  const chainId = config?.chainId || ARC_CHAIN_ID;

  if (!clientKey || !clientUrl) {
    throw new Error("Circle Client Key and Client URL are required. Set CIRCLE_CLIENT_KEY and CIRCLE_CLIENT_URL in environment variables.");
  }

  // Determine network name for Circle API
  let networkName = "polygonAmoy"; // Default for testing
  if (chainId === ARC_CHAIN_ID) {
    networkName = "arc"; // Arc network
  } else if (chainId === POLYGON_AMOY_CHAIN_ID) {
    networkName = "polygonAmoy";
  }

  // Create Circle modular transport
  const modularTransport = toModularTransport(
    `${clientUrl}/${networkName}`,
    clientKey
  );

  // Create public client
  const publicClient = createPublicClient({
    chain: {
      id: chainId,
      name: networkName === "arc" ? "Arc" : "Polygon Amoy",
      nativeCurrency: {
        name: "USDC", // Arc uses USDC as native currency
        symbol: "USDC",
        decimals: 18, // Native USDC uses 18 decimals for gas
      },
      rpcUrls: {
        default: {
          http: [networkName === "arc" ? ARC_RPC_URL : "https://rpc-amoy.polygon.technology"],
        },
      },
    },
    transport: modularTransport,
  });

  // Create bundler client for user operations
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
 * Send USDC via Circle Smart Account user operation
 */
export async function sendUSDCViaSmartAccount(
  smartAccount: SmartAccount,
  to: `0x${string}`,
  amount: string, // Amount in USDC (e.g., "10.5")
  usdcContractAddress: `0x${string}`,
  bundlerClient: any
): Promise<Hex> {
  const USDC_DECIMALS = 6;
  const amountWei = parseUnits(amount, USDC_DECIMALS);

  // Encode transfer call
  const callData = encodeTransfer(to, usdcContractAddress, amountWei);

  // Send user operation
  const opHash = await bundlerClient.sendUserOperation({
    account: smartAccount,
    calls: [callData],
    paymaster: true, // Enable gas sponsorship if supported
  });

  return opHash;
}

/**
 * Wait for user operation receipt
 */
export async function waitForUserOperationReceipt(
  bundlerClient: any,
  opHash: Hex
): Promise<{ transactionHash: Hex }> {
  const { receipt } = await bundlerClient.waitForUserOperationReceipt({
    hash: opHash,
  });
  return receipt;
}

