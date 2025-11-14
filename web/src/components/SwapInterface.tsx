"use client";
import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { Address } from "viem";
import { SwapService, SwapParams, SwapResult } from "../lib/defi/swap";
import { CCTPService } from "../lib/defi/cctp-integration";
import { arcTestnet, arcMainnet } from "../config/chains";

export function SwapInterface() {
  const { primaryWallet } = useDynamicContext();
  const { data: wagmiWalletClient } = useWalletClient();
  const [tokenIn, setTokenIn] = useState<Address>("0x0000000000000000000000000000000000000000" as Address);
  const [tokenOut, setTokenOut] = useState<Address>("0x0000000000000000000000000000000000000000" as Address);
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [sourceChain, setSourceChain] = useState<number | undefined>();
  const [destinationChain, setDestinationChain] = useState<number>(arcMainnet.id);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);

  const swapService = new SwapService(destinationChain);
  const cctpService = new CCTPService();

  useEffect(() => {
    if (primaryWallet?.chain) {
      const chainId = typeof primaryWallet.chain === 'number' 
        ? primaryWallet.chain 
        : (typeof primaryWallet.chain === 'string' 
          ? parseInt(primaryWallet.chain, 10) 
          : undefined);
      setSourceChain(chainId);
    }
  }, [primaryWallet]);

  const handleGetQuote = async () => {
    if (!tokenIn || !tokenOut || !amountIn || !primaryWallet?.address) return;

    setLoading(true);
    try {
      const params: SwapParams = {
        tokenIn,
        tokenOut,
        amountIn,
        slippageTolerance: parseFloat(slippage),
        recipient: primaryWallet.address as Address,
        sourceChain,
        destinationChain,
      };

      const quoteResult = await swapService.getQuote(params);
      setQuote(quoteResult);
    } catch (error: any) {
      console.error("Quote error:", error);
      alert(`Error getting quote: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!tokenIn || !tokenOut || !amountIn || !primaryWallet || !quote) return;

    setLoading(true);
    setSwapResult(null);

    try {
      // Get wallet client from wagmi (works with Dynamic SDK)
      if (!wagmiWalletClient) {
        throw new Error("Wallet client not available. Please ensure your wallet is connected.");
      }
      
      const walletClient = wagmiWalletClient;
      const params: SwapParams = {
        tokenIn,
        tokenOut,
        amountIn,
        slippageTolerance: parseFloat(slippage),
        recipient: primaryWallet.address as Address,
        sourceChain,
        destinationChain,
      };

      // CCTP transfer function for cross-chain swaps
      const cctpTransferFn = async (
        amount: string,
        fromChain: string,
        toChain: string,
        recipient: Address
      ): Promise<string> => {
        const result = await cctpService.initiateTransfer({
          amount,
          sourceChain: fromChain,
          destinationChain: toChain,
          recipientAddress: recipient,
          senderWalletAddress: primaryWallet.address,
        });

        if (!result.success || !result.transferId) {
          throw new Error(result.error || "CCTP transfer failed");
        }

        return result.transferId;
      };

      const result = await swapService.executeSwap(walletClient, params, cctpTransferFn);
      setSwapResult(result);

      if (result.success) {
        // Reset form
        setAmountIn("");
        setQuote(null);
      }
    } catch (error: any) {
      console.error("Swap error:", error);
      setSwapResult({
        success: false,
        amountOut: "0",
        error: error.message || "Swap failed",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!primaryWallet) {
    return (
      <div className="tg-card p-6">
        <p className="text-sm text-gray-600 text-center">
          Connect your wallet to use swap functionality
        </p>
      </div>
    );
  }

  return (
    <div className="tg-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">🔄 DeFi Swap</h3>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <strong>All swaps settle on Arc network</strong> using USDC. Cross-chain swaps use CCTP.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Source Chain (where token is located)
        </label>
        <select
          value={sourceChain || ""}
          onChange={(e) => setSourceChain(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value={arcTestnet.id}>Arc Testnet</option>
          <option value={arcMainnet.id}>Arc Mainnet</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Destination Chain (sends to Arc)
        </label>
        <select
          value={destinationChain}
          onChange={(e) => setDestinationChain(Number(e.target.value))}
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value={arcMainnet.id}>Arc Mainnet</option>
          <option value={arcTestnet.id}>Arc Testnet</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Token In Address
        </label>
        <input
          type="text"
          value={tokenIn}
          onChange={(e) => setTokenIn(e.target.value as Address)}
          placeholder="0x..."
          className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Token Out Address (USDC on Arc)
        </label>
        <input
          type="text"
          value={tokenOut}
          onChange={(e) => setTokenOut(e.target.value as Address)}
          placeholder="0x..."
          className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Amount In
        </label>
        <input
          type="number"
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
          placeholder="10.00"
          step="0.01"
          min="0"
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Slippage Tolerance (%)
        </label>
        <input
          type="number"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
          placeholder="0.5"
          step="0.1"
          min="0"
          max="50"
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <button
        onClick={handleGetQuote}
        disabled={loading || !tokenIn || !tokenOut || !amountIn}
        className="tg-button-secondary w-full"
      >
        {loading ? "Getting Quote..." : "Get Quote"}
      </button>

      {quote && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Amount Out:</span>
            <span className="text-sm font-semibold">{quote.amountOut}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Price Impact:</span>
            <span className="text-sm">{quote.priceImpact}%</span>
          </div>
          {quote.useCCTP && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
              <p className="text-xs text-yellow-800">
                ⚠️ This swap will use CCTP for cross-chain transfer
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                From {quote.sourceChain} → {quote.destinationChain}
              </p>
            </div>
          )}
          <button
            onClick={handleSwap}
            disabled={loading}
            className="tg-button-primary w-full mt-4"
          >
            {loading ? "Executing Swap..." : "Execute Swap"}
          </button>
        </div>
      )}

      {swapResult && (
        <div className={`border rounded-lg p-4 ${swapResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {swapResult.success ? (
            <>
              <p className="text-sm font-medium text-green-800 mb-2">✅ Swap Successful!</p>
              {swapResult.transactionHash && (
                <p className="text-xs text-green-700 font-mono break-all">
                  TX: {swapResult.transactionHash}
                </p>
              )}
              {swapResult.cctpTransferId && (
                <p className="text-xs text-green-700 mt-2">
                  CCTP Transfer ID: {swapResult.cctpTransferId}
                </p>
              )}
              <p className="text-xs text-green-700 mt-2">
                Amount Out: {swapResult.amountOut}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-red-800 mb-2">❌ Swap Failed</p>
              <p className="text-xs text-red-700">{swapResult.error}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

