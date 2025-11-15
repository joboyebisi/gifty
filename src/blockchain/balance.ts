// On-chain balance checking for Dynamic wallet addresses
// This checks the actual blockchain balance, not Circle API balance

import { loadEnv } from "../config/env";

interface BalanceResult {
  balance: string;
  balanceFormatted: string;
  error?: string;
}

// USDC contract addresses
function getUSDCContractAddresses(): Record<string, string> {
  const env = loadEnv();
  return {
    // Arc Testnet - Official ERC-20 USDC address (6 decimals)
    "5042002": env.ARC_TESTNET_USDC_ADDRESS || "0x3600000000000000000000000000000000000000",
    // Ethereum Sepolia - USDC contract address
    "11155111": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
  };
}

// RPC URLs - using public RPCs as fallback
function getRPCUrls(): Record<string, string> {
  const env = loadEnv();
  return {
    "5042002": env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network", // Arc Testnet (official)
    "11155111": env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org", // Ethereum Sepolia - public RPC (fallback: https://ethereum-sepolia-rpc.publicnode.com)
  };
}

/**
 * Encode function call data for balanceOf
 */
function encodeBalanceOf(address: string): string {
  // balanceOf(address) function signature: 0x70a08231
  const functionSignature = "0x70a08231";
  // Pad address to 32 bytes (64 hex characters)
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, "0");
  return functionSignature + paddedAddress;
}

/**
 * Encode function call data for decimals
 */
function encodeDecimals(): string {
  // decimals() function signature: 0x313ce567
  return "0x313ce567";
}

/**
 * Decode uint256 from hex response
 */
function decodeUint256(hex: string): bigint {
  if (!hex || hex === "0x") return BigInt(0);
  return BigInt(hex);
}

/**
 * Make RPC call to Ethereum-compatible chain
 */
async function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    const statusText = response.statusText || `HTTP ${response.status}`;
    const errorText = await response.text().catch(() => statusText);
    throw new Error(`RPC call failed: ${statusText} - ${errorText.slice(0, 100)}`);
  }

  const data = await response.json() as { error?: { message: string; code?: number }; result?: any };
  if (data.error) {
    const errorMsg = data.error.message || `Error code ${data.error.code || 'unknown'}`;
    throw new Error(`RPC error: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Get USDC balance for an address on Arc Testnet
 */
export async function getOnChainUSDCBalance(
  address: string,
  chainId: string = "5042002" // Arc Testnet (official Chain ID)
): Promise<BalanceResult> {
  try {
    const RPC_URLS = getRPCUrls();
    const USDC_CONTRACT_ADDRESSES = getUSDCContractAddresses();
    
    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
      return {
        balance: "0",
        balanceFormatted: "0.00",
        error: `Unsupported chain ID: ${chainId}`,
      };
    }

    const usdcContract = USDC_CONTRACT_ADDRESSES[chainId];
    if (!usdcContract || usdcContract === "0x0000000000000000000000000000000000000000") {
      // For Arc Testnet, if USDC contract is not configured, check native balance
      // Arc might use native USDC
      console.log("USDC contract not configured, checking native balance instead");
      return getNativeBalance(address, chainId);
    }

    // Get decimals
    const decimalsData = encodeDecimals();
    const decimalsHex = await rpcCall(rpcUrl, "eth_call", [
      {
        to: usdcContract,
        data: decimalsData,
      },
      "latest",
    ]);
    const decimals = Number(decimalsHex ? decodeUint256(decimalsHex) : 18);

    // Get balance
    const balanceData = encodeBalanceOf(address);
    const balanceHex = await rpcCall(rpcUrl, "eth_call", [
      {
        to: usdcContract,
        data: balanceData,
      },
      "latest",
    ]);

    const balance = decodeUint256(balanceHex);
    const balanceFormatted = (Number(balance) / Math.pow(10, decimals)).toFixed(2);

    return {
      balance: balance.toString(),
      balanceFormatted,
    };
  } catch (error: any) {
    const errorMsg = error.message || "Failed to fetch balance";
    console.error(`❌ [BALANCE] Error getting on-chain USDC balance for ${address.slice(0, 10)}... on chain ${chainId}:`, errorMsg);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return {
      balance: "0",
      balanceFormatted: "0.00",
      error: errorMsg,
    };
  }
}

/**
 * Get native token balance (ETH, ARC, etc.)
 */
export async function getNativeBalance(
  address: string,
  chainId: string = "5042002" // Arc Testnet (official Chain ID)
): Promise<BalanceResult> {
  try {
    const RPC_URLS = getRPCUrls();
    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
      return {
        balance: "0",
        balanceFormatted: "0.00",
        error: `Unsupported chain ID: ${chainId}`,
      };
    }

    // Get native balance
    const balanceHex = await rpcCall(rpcUrl, "eth_getBalance", [address, "latest"]);
    const balance = decodeUint256(balanceHex);
    // Arc Testnet uses native USDC with 6 decimals (like mainnet)
    // Ethereum Sepolia uses 18 decimals for ETH
    // Other chains typically use 18 decimals for native tokens
    const decimals = chainId === "117000" ? 6 : 18; // Arc uses 6 decimals for native USDC, ETH uses 18
    const balanceFormatted = (Number(balance) / Math.pow(10, decimals)).toFixed(6);

    return {
      balance: balance.toString(),
      balanceFormatted,
    };
  } catch (error: any) {
    const errorMsg = error.message || "Failed to fetch balance";
    console.error(`❌ [BALANCE] Error getting native balance for ${address.slice(0, 10)}... on chain ${chainId}:`, errorMsg);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return {
      balance: "0",
      balanceFormatted: "0.00",
      error: errorMsg,
    };
  }
}

/**
 * Get balance for an address (tries USDC first, falls back to native)
 */
export async function getWalletBalance(
  address: string,
  chainId: string = "117000"
): Promise<BalanceResult> {
  // First try to get USDC balance
  const usdcBalance = await getOnChainUSDCBalance(address, chainId);
  
  // If USDC contract is not configured, try native balance
  if (usdcBalance.error && usdcBalance.error.includes("contract address not configured")) {
    return getNativeBalance(address, chainId);
  }
  
  return usdcBalance;
}

/**
 * Get both native token (ETH) and USDC balances for a chain
 */
export interface ChainBalances {
  native: BalanceResult;
  usdc: BalanceResult;
  chainId: string;
  chainName: string;
}

export async function getChainBalances(
  address: string,
  chainId: string = "11155111" // Sepolia by default
): Promise<ChainBalances> {
  const chainNames: Record<string, string> = {
    "117000": "Arc Testnet",
    "11155111": "Ethereum Sepolia",
  };

  const [nativeBalance, usdcBalance] = await Promise.all([
    getNativeBalance(address, chainId),
    getOnChainUSDCBalance(address, chainId),
  ]);

  return {
    native: nativeBalance,
    usdc: usdcBalance,
    chainId,
    chainName: chainNames[chainId] || `Chain ${chainId}`,
  };
}

/**
 * Get balances for multiple chains
 */
export async function getMultiChainBalances(
  address: string,
  chainIds: string[] = ["11155111", "117000"]
): Promise<ChainBalances[]> {
  const balancePromises = chainIds.map((chainId) => getChainBalances(address, chainId));
  return Promise.all(balancePromises);
}

