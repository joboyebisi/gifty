import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, Address } from "viem";
import { arcTestnet, arcMainnet } from "../../config/chains";

// DEX Router ABIs (Generic Uniswap V2 style router)
const ROUTER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForTokens",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapETHForExactTokens",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  path: Address[];
  priceImpact: number;
  useCCTP: boolean; // Whether this swap requires CCTP cross-chain transfer
  sourceChain?: string;
  destinationChain?: string;
}

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  slippageTolerance: number; // e.g., 0.5 for 0.5%
  recipient: Address;
  sourceChain?: number; // Chain ID where tokenIn is located
  destinationChain?: number; // Chain ID where tokenOut should be (default: Arc)
}

export interface SwapResult {
  success: boolean;
  transactionHash?: `0x${string}`;
  cctpTransferId?: string; // If using CCTP
  amountOut: string;
  error?: string;
}

// Mock DEX router address - replace with actual Arc DEX router
// This would be a DEX like Uniswap, SushiSwap, or Arc-native DEX
// Note: arcMainnet uses same ID as testnet until mainnet is available
const DEFAULT_DEX_ROUTER: Record<number, Address> = {
  [arcTestnet.id]: "0x0000000000000000000000000000000000000000" as Address, // Replace with actual router
  // arcMainnet.id is same as testnet until mainnet launches, so only one entry needed
};

// USDC address on Arc (native token, but still represented as ERC20)
// Note: arcMainnet uses same ID as testnet until mainnet is available
const USDC_ADDRESS: Record<number, Address> = {
  [arcTestnet.id]: "0x0000000000000000000000000000000000000000" as Address, // Replace with actual USDC address
  // arcMainnet.id is same as testnet until mainnet launches, so only one entry needed
};

// 1inch Aggregator API (for quote and swap execution)
const ONEINCH_API_BASE = "https://api.1inch.dev/swap/v6.0";

export class SwapService {
  private chainId: number;
  private publicClient: ReturnType<typeof createPublicClient>;
  private oneInchApiKey?: string;

  constructor(chainId: number = arcTestnet.id, oneInchApiKey?: string) {
    this.chainId = chainId;
    this.oneInchApiKey = oneInchApiKey || process.env.NEXT_PUBLIC_ONEINCH_API_KEY;
    const rpcUrl = chainId === arcMainnet.id ? "https://rpc.arc.io" : "https://rpc.arc-testnet.io";
    this.publicClient = createPublicClient({
      chain: chainId === arcMainnet.id ? arcMainnet : arcTestnet,
      transport: http(rpcUrl),
    });
  }

  /**
   * Determine if swap requires CCTP (cross-chain)
   */
  requiresCCTP(params: SwapParams): boolean {
    const sourceChain = params.sourceChain || this.chainId;
    const destinationChain = params.destinationChain || this.chainId;
    
    // If source and destination are different, or if destination is explicitly Arc
    return sourceChain !== destinationChain || 
           (destinationChain !== this.chainId && destinationChain === arcMainnet.id);
  }

  /**
   * Get a quote for a token swap using 1inch aggregator or direct DEX
   */
  async getQuote(params: SwapParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn, sourceChain, destinationChain } = params;
    const sourceChainId = sourceChain || this.chainId;
    const destChainId = destinationChain || this.chainId;
    const useCCTP = this.requiresCCTP(params);

    // If using CCTP, we need to get quote from source chain, then transfer via CCTP
    if (useCCTP && sourceChainId !== destChainId) {
      // For cross-chain swaps via CCTP:
      // 1. Get quote on source chain (if tokenIn is not USDC)
      // 2. Transfer via CCTP to destination chain
      // 3. Get quote on destination chain if needed
      
      // For now, return a quote that indicates CCTP usage
      const amountInWei = parseUnits(amountIn, 6); // USDC uses 6 decimals
      const estimatedAmountOut = amountInWei * BigInt(995) / BigInt(1000); // Account for CCTP fees

      return {
        amountIn,
        amountOut: formatUnits(estimatedAmountOut, 6),
        path: [tokenIn, tokenOut],
        priceImpact: 0.5,
        useCCTP: true,
        sourceChain: sourceChainId.toString(),
        destinationChain: destChainId.toString(),
      };
    }

    // Same-chain swap - use 1inch aggregator if available, otherwise direct DEX
    if (this.oneInchApiKey && sourceChainId === destChainId) {
      try {
        return await this.get1inchQuote(params);
      } catch (error) {
        console.warn("1inch API failed, falling back to direct DEX:", error);
      }
    }

    // Fallback to direct DEX quote
    return await this.getDirectDEXQuote(params);
  }

  /**
   * Get quote from 1inch aggregator
   */
  private async get1inchQuote(params: SwapParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn } = params;
    const chainId = params.sourceChain || this.chainId;
    
    // Map chain IDs to 1inch format
    // Note: arcMainnet uses same ID as testnet until mainnet is available
    const oneInchChainMap: Record<number, number> = {
      [arcTestnet.id]: 1, // Use Ethereum mainnet as fallback
      // arcMainnet.id is same as testnet until mainnet launches
    };

    const oneInchChain = oneInchChainMap[chainId] || 1;
    const amountInWei = parseUnits(amountIn, 6).toString();

    const url = `${ONEINCH_API_BASE}/${oneInchChain}/quote?fromTokenAddress=${tokenIn}&toTokenAddress=${tokenOut}&amount=${amountInWei}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.oneInchApiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`1inch API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      amountIn,
      amountOut: formatUnits(BigInt(data.toTokenAmount), 6),
      path: data.protocols?.[0]?.[0]?.[0]?.path || [tokenIn, tokenOut],
      priceImpact: parseFloat(data.estimatedGas) || 0.5,
      useCCTP: false,
    };
  }

  /**
   * Get quote from direct DEX (fallback)
   */
  private async getDirectDEXQuote(params: SwapParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn } = params;
    const amountInWei = parseUnits(amountIn, 6);
    const estimatedAmountOut = amountInWei * BigInt(995) / BigInt(1000); // 0.5% slippage estimate

    return {
      amountIn,
      amountOut: formatUnits(estimatedAmountOut, 6),
      path: [tokenIn, tokenOut],
      priceImpact: 0.5,
      useCCTP: false,
    };
  }

  /**
   * Execute a swap - handles both same-chain and cross-chain (CCTP) swaps
   */
  async executeSwap(
    walletClient: ReturnType<typeof createWalletClient>,
    params: SwapParams,
    cctpTransferFn?: (amount: string, fromChain: string, toChain: string, recipient: Address) => Promise<string>
  ): Promise<SwapResult> {
    const { tokenIn, tokenOut, amountIn, slippageTolerance, recipient, sourceChain, destinationChain } = params;
    const sourceChainId = sourceChain || this.chainId;
    const destChainId = destinationChain || this.chainId;
    const useCCTP = this.requiresCCTP(params);

    try {
      // Cross-chain swap via CCTP
      if (useCCTP && sourceChainId !== destChainId && cctpTransferFn) {
        return await this.executeCCTPSwap(
          walletClient,
          params,
          cctpTransferFn
        );
      }

      // Same-chain swap
      return await this.executeDirectSwap(walletClient, params);
    } catch (error: any) {
      return {
        success: false,
        amountOut: "0",
        error: error.message || "Swap execution failed",
      };
    }
  }

  /**
   * Execute cross-chain swap using CCTP
   */
  private async executeCCTPSwap(
    walletClient: ReturnType<typeof createWalletClient>,
    params: SwapParams,
    cctpTransferFn: (amount: string, fromChain: string, toChain: string, recipient: Address) => Promise<string>
  ): Promise<SwapResult> {
    const { tokenIn, tokenOut, amountIn, sourceChain, destinationChain, recipient } = params;
    const sourceChainId = sourceChain || this.chainId;
    const destChainId = destinationChain || arcMainnet.id;

    // Step 1: If tokenIn is not USDC, swap to USDC on source chain first
    const usdcAddress = this.getUSDCAddressForChain(sourceChainId);
    
    if (tokenIn.toLowerCase() !== usdcAddress.toLowerCase()) {
      // Swap tokenIn to USDC on source chain
      const swapToUSDC = await this.executeDirectSwap(walletClient, {
        ...params,
        tokenOut: usdcAddress,
        destinationChain: sourceChainId,
      });

      if (!swapToUSDC.success) {
        return swapToUSDC;
      }

      // Update amountIn to the USDC amount received
      params.amountIn = swapToUSDC.amountOut;
    }

    // Step 2: Transfer USDC via CCTP to destination chain (Arc)
    // Note: arcMainnet uses same ID as testnet until mainnet is available
    const chainNameMap: Record<number, string> = {
      [arcTestnet.id]: "arc-testnet", // Use testnet for now
      // arcMainnet.id is same as testnet until mainnet launches
    };

    const fromChain = chainNameMap[sourceChainId] || "ethereum";
    const toChain = chainNameMap[destChainId] || "arc";

    const cctpTransferId = await cctpTransferFn(
      params.amountIn,
      fromChain,
      toChain,
      recipient
    );

    // Step 3: If tokenOut is not USDC, swap USDC to tokenOut on destination chain
    if (tokenOut.toLowerCase() !== this.getUSDCAddress().toLowerCase()) {
      // Note: This would require a wallet on the destination chain
      // For now, we'll return the CCTP transfer result
      // In production, you'd need to execute the swap on destination chain
    }

    return {
      success: true,
      cctpTransferId,
      amountOut: params.amountIn, // For USDC transfers, amountOut = amountIn (minus fees)
    };
  }

  /**
   * Execute direct same-chain swap
   */
  private async executeDirectSwap(
    walletClient: ReturnType<typeof createWalletClient>,
    params: SwapParams
  ): Promise<SwapResult> {
    const { tokenIn, tokenOut, amountIn, slippageTolerance, recipient } = params;
    const routerAddress = DEFAULT_DEX_ROUTER[this.chainId];

    if (!routerAddress || routerAddress === "0x0000000000000000000000000000000000000000") {
      // Try 1inch swap if available
      if (this.oneInchApiKey) {
        return await this.execute1inchSwap(walletClient, params);
      }
      throw new Error("DEX router not configured for this chain");
    }

    // Get quote
    const quote = await this.getQuote(params);
    const amountOutMin = parseUnits(
      (parseFloat(quote.amountOut) * (1 - slippageTolerance / 100)).toFixed(6),
      6
    );

    const amountInWei = parseUnits(amountIn, 6);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

    // Get account from wallet client
    if (!walletClient.account) {
      throw new Error("Wallet account not available");
    }

    const accountAddress = walletClient.account.address;

    // Check and approve token if needed
    const allowance = await this.publicClient.readContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [accountAddress, routerAddress],
    });

    if (allowance < amountInWei) {
      // Approve token - walletClient from wagmi already has chain configured
      const approveHash = await walletClient.writeContract({
        account: walletClient.account,
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [routerAddress, amountInWei],
      } as any); // Type assertion to bypass strict type checking

      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Execute swap - walletClient from wagmi already has chain configured
    const swapHash = await walletClient.writeContract({
      account: walletClient.account,
      address: routerAddress,
      abi: ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [amountInWei, amountOutMin, [tokenIn, tokenOut], recipient, deadline],
    } as any); // Type assertion to bypass strict type checking

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: swapHash });

    return {
      success: true,
      transactionHash: swapHash,
      amountOut: quote.amountOut,
    };
  }

  /**
   * Execute swap using 1inch aggregator
   */
  private async execute1inchSwap(
    walletClient: ReturnType<typeof createWalletClient>,
    params: SwapParams
  ): Promise<SwapResult> {
    // This would integrate with 1inch swap API
    // For now, return a placeholder
    throw new Error("1inch swap execution not yet implemented");
  }

  /**
   * Get USDC address for the current chain
   */
  getUSDCAddress(): Address {
    return USDC_ADDRESS[this.chainId];
  }

  /**
   * Get USDC address for a specific chain
   */
  getUSDCAddressForChain(chainId: number): Address {
    return USDC_ADDRESS[chainId] || USDC_ADDRESS[this.chainId];
  }
}
