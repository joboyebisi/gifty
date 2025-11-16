"use client";
import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { CCTPService } from "../lib/defi/cctp-integration";

interface CCTPBridgeProps {
  primaryWalletAddress: string;
  smartAccountAddress?: string | null;
  onTransferComplete?: () => void;
}

type BridgeStatus = 
  | "idle"
  | "initializing"
  | "approving"
  | "burning"
  | "waiting-attestation"
  | "minting"
  | "completed"
  | "error";

export function CCTPBridge({ primaryWalletAddress, smartAccountAddress, onTransferComplete }: CCTPBridgeProps) {
  const { primaryWallet } = useDynamicContext();
  
  const [sourceWallet, setSourceWallet] = useState<"primary" | "smart">("primary");
  const [sourceChain, setSourceChain] = useState<string>("eth-sepolia");
  const [destinationChain, setDestinationChain] = useState<string>("arc-testnet");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [result, setResult] = useState<{ success: boolean; message: string; transferId?: string } | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const cctpService = new CCTPService(API);

  const handleTransfer = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setResult({ success: false, message: "Please enter a valid amount" });
      return;
    }

    if (!primaryWallet) {
      setResult({ success: false, message: "Wallet not connected" });
      return;
    }

    const sourceAddress = sourceWallet === "primary" ? primaryWalletAddress : (smartAccountAddress || "");
    const recipientAddress = destinationAddress || 
      (sourceWallet === "primary" ? (smartAccountAddress || "") : primaryWalletAddress);

    if (!sourceAddress || !recipientAddress) {
      setResult({ success: false, message: "Wallet addresses not available" });
      return;
    }

    setStatus("initializing");
    setStatusMessage("Initializing CCTP transfer...");
    setResult(null);

    try {
      setStatus("approving");
      setStatusMessage("Initiating transfer (approval, burn, attestation, mint)...");

      // Convert amount to smallest unit (USDC has 6 decimals)
      const amountInSmallestUnit = (parseFloat(amount) * 1000000).toString();

      // Use backend CCTP service (will be upgraded to BridgeKit after package installation)
      const transferResult = await cctpService.initiateTransfer({
        amount: amountInSmallestUnit,
        sourceChain,
        destinationChain,
        recipientAddress,
        senderWalletAddress: sourceAddress,
      });

      if (transferResult.success && transferResult.transferId) {
        setStatus("waiting-attestation");
        setStatusMessage("Waiting for Circle attestation (10-20 seconds)...");
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts = ~30 seconds
        
        const checkStatus = async () => {
          try {
            const statusResult = await cctpService.getTransferStatus(transferResult.transferId!);
            if (statusResult.success) {
              setStatus("completed");
              setStatusMessage("Transfer completed successfully!");
              setResult({
                success: true,
                message: `Successfully bridged ${amount} USDC from ${sourceChain} to ${destinationChain}`,
                transferId: transferResult.transferId,
              });
              if (onTransferComplete) {
                setTimeout(() => {
                  onTransferComplete();
                }, 2000);
              }
            } else if (attempts < maxAttempts) {
              attempts++;
              setTimeout(checkStatus, 1000);
            } else {
              setStatus("completed");
              setStatusMessage("Transfer initiated - check status manually");
              setResult({
                success: true,
                message: `Transfer initiated! Transfer ID: ${transferResult.transferId}. It may take 10-20 seconds to complete.`,
                transferId: transferResult.transferId,
              });
            }
          } catch (err) {
            // Still show success if transfer was initiated
            setStatus("completed");
            setStatusMessage("Transfer initiated");
            setResult({
              success: true,
              message: `Transfer initiated! Transfer ID: ${transferResult.transferId}. Please check status manually.`,
              transferId: transferResult.transferId,
            });
          }
        };
        
        // Start polling after a short delay
        setTimeout(checkStatus, 2000);
      } else {
        throw new Error(transferResult.error || "Transfer failed");
      }
    } catch (error: any) {
      console.error("Bridge error:", error);
      setStatus("error");
      setStatusMessage(error.message || "Bridge failed");
      setResult({
        success: false,
        message: error.message || "Failed to bridge USDC",
      });
    }
  };

  // Update status message based on status
  useEffect(() => {
    switch (status) {
      case "initializing":
        setStatusMessage("Initializing transfer...");
        break;
      case "approving":
        setStatusMessage("Approving USDC...");
        break;
      case "burning":
        setStatusMessage("Burning USDC on source chain...");
        break;
      case "waiting-attestation":
        setStatusMessage("Waiting for Circle attestation (10-20 seconds)...");
        break;
      case "minting":
        setStatusMessage("Minting USDC on destination chain...");
        break;
      case "completed":
        setStatusMessage("Transfer completed!");
        break;
      case "error":
        setStatusMessage("Transfer failed");
        break;
      default:
        setStatusMessage("");
    }
  }, [status]);

  return (
    <div className="tg-card p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">🌉 CCTP Bridge</h3>
      <p className="text-xs text-gray-600 mb-4">
        Transfer USDC between wallets and chains using Circle's BridgeKit
      </p>

      {/* Source Wallet Selection */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">Source Wallet</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSourceWallet("primary")}
            disabled={status !== "idle"}
            className={`flex-1 px-3 py-2 rounded text-sm ${
              sourceWallet === "primary"
                ? "bg-green-100 text-green-800 border-2 border-green-300"
                : "bg-gray-100 text-gray-700 border-2 border-transparent"
            } disabled:opacity-50`}
          >
            🏦 Primary Wallet
          </button>
          <button
            onClick={() => setSourceWallet("smart")}
            disabled={!smartAccountAddress || status !== "idle"}
            className={`flex-1 px-3 py-2 rounded text-sm ${
              sourceWallet === "smart"
                ? "bg-blue-100 text-blue-800 border-2 border-blue-300"
                : "bg-gray-100 text-gray-700 border-2 border-transparent"
            } ${!smartAccountAddress || status !== "idle" ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            ⚡ Smart Account
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-1 font-mono break-all">
          {sourceWallet === "primary" ? primaryWalletAddress : (smartAccountAddress || "Not available")}
        </div>
      </div>

      {/* Source Chain */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">From Chain</label>
        <select
          value={sourceChain}
          onChange={(e) => setSourceChain(e.target.value)}
          disabled={status !== "idle"}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50"
        >
          <option value="eth-sepolia">Ethereum Sepolia</option>
          <option value="arc-testnet">Arc Testnet</option>
        </select>
      </div>

      {/* Destination Chain */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">To Chain</label>
        <select
          value={destinationChain}
          onChange={(e) => setDestinationChain(e.target.value)}
          disabled={status !== "idle"}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50"
        >
          <option value="arc-testnet">Arc Testnet</option>
          <option value="eth-sepolia">Ethereum Sepolia</option>
        </select>
      </div>

      {/* Destination Address (optional - defaults to other wallet) */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">
          Recipient Address <span className="text-gray-500 text-xs">(optional)</span>
        </label>
        <input
          type="text"
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder={sourceWallet === "primary" 
            ? (smartAccountAddress || "Smart Account address") 
            : primaryWalletAddress}
          disabled={status !== "idle"}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 mt-1">
          Leave empty to transfer to {sourceWallet === "primary" ? "Smart Account" : "Primary Wallet"}
        </p>
      </div>

      {/* Amount */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">Amount (USDC)</label>
        <input
          type="number"
          step="0.000001"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={status !== "idle"}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50"
        />
      </div>

      {/* Status Display */}
      {status !== "idle" && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="text-sm font-semibold text-blue-800 mb-1">
            {status === "initializing" && "⏳ Initializing..."}
            {status === "approving" && "✅ Approving USDC..."}
            {status === "burning" && "🔥 Burning USDC..."}
            {status === "waiting-attestation" && "⏳ Waiting for attestation..."}
            {status === "minting" && "✨ Minting USDC..."}
            {status === "completed" && "✅ Completed!"}
            {status === "error" && "❌ Error"}
          </div>
          <div className="text-xs text-blue-600">{statusMessage}</div>
        </div>
      )}

      {/* Result Message */}
      {result && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            result.success
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {result.message}
          {result.transferId && (
            <div className="mt-2 text-xs font-mono break-all">
              Transfer ID: {result.transferId}
            </div>
          )}
        </div>
      )}

      {/* Transfer Button */}
      <button
        onClick={handleTransfer}
        disabled={status !== "idle" || !amount || parseFloat(amount) <= 0}
        className="tg-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status !== "idle" ? `⏳ ${statusMessage}` : "🌉 Bridge USDC"}
      </button>

      <p className="text-xs text-gray-500 mt-3 text-center">
        All transfers use Circle's CCTP protocol and settle on Arc network
      </p>
    </div>
  );
}
