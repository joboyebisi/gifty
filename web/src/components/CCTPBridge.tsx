"use client";
import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { BridgeKit, Blockchain } from "@circle-fin/bridge-kit";
import { createAdapterFromProvider } from "@circle-fin/adapter-viem-v2";

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

// Map our chain names to BridgeKit chain identifiers
const CHAIN_MAP: Record<string, Blockchain> = {
  "eth-sepolia": Blockchain.Ethereum_Sepolia,
  "arc-testnet": Blockchain.Arc_Testnet,
};

export function CCTPBridge({ primaryWalletAddress, smartAccountAddress, onTransferComplete }: CCTPBridgeProps) {
  const { primaryWallet } = useDynamicContext();
  const { data: walletClient } = useWalletClient();
  
  const [sourceWallet, setSourceWallet] = useState<"primary" | "smart">("primary");
  const [sourceChain, setSourceChain] = useState<string>("eth-sepolia");
  const [destinationChain, setDestinationChain] = useState<string>("arc-testnet");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [result, setResult] = useState<{ success: boolean; message: string; txHashes?: { approval?: string; burn?: string; mint?: string } } | null>(null);
  const [walletClientReady, setWalletClientReady] = useState(false);
  const [primaryWalletClient, setPrimaryWalletClient] = useState<any>(null);
  
  // Check if wallet client is ready - prioritize primaryWallet first
  useEffect(() => {
    async function checkWalletClient() {
      // Priority 1: Try to get wallet client from primaryWallet first
      if (primaryWallet) {
        try {
          const client = await (primaryWallet as any).getWalletClient?.();
          if (client) {
            setPrimaryWalletClient(client);
            setWalletClientReady(true);
            return;
          }
        } catch (err) {
          console.log("⏳ Primary wallet client not ready yet...", err);
        }
      }
      
      // Priority 2: Fallback to wagmi's walletClient if primaryWallet not available
      if (walletClient) {
        setPrimaryWalletClient(null); // Clear primary wallet client
        setWalletClientReady(true);
        return;
      }
      
      // Neither available
      setPrimaryWalletClient(null);
      setWalletClientReady(false);
    }
    
    checkWalletClient();
    // Check periodically until wallet client is ready
    const interval = setInterval(checkWalletClient, 1000);
    return () => clearInterval(interval);
  }, [primaryWallet, walletClient]);

  const handleTransfer = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setResult({ success: false, message: "Please enter a valid amount" });
      return;
    }

    // Check if we have at least one wallet available
    if (!primaryWallet && !walletClient) {
      setResult({ success: false, message: "Wallet not connected. Please connect your wallet first." });
      return;
    }
    
    // Priority 1: Use primaryWallet client first
    let client = null;
    if (primaryWalletClient) {
      client = primaryWalletClient;
    } else if (primaryWallet) {
      try {
        client = await (primaryWallet as any).getWalletClient?.();
        if (client) {
          setPrimaryWalletClient(client); // Cache it
        }
      } catch (err) {
        console.error("Failed to get primary wallet client:", err);
      }
    }
    
    // Priority 2: Fallback to wagmi's walletClient if primaryWallet not available
    if (!client && walletClient) {
      client = walletClient;
    }
    
    if (!client) {
      setResult({ success: false, message: "Wallet client not ready. Please wait a moment and try again." });
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
    setStatusMessage("Initializing BridgeKit...");
    setResult(null);

    try {
      // Create adapter from wallet client
      // Priority: Use Dynamic wallet client directly (works in Telegram Mini App without MetaMask)
      // Fallback: Use window.ethereum if available (for browser extensions)
      setStatusMessage("Creating adapter...");
      
      let adapter: any = null;
      
      // Priority 1: Use Dynamic wallet client directly (Telegram Mini App compatible)
      // This works without MetaMask - uses Dynamic's embedded wallet
      if (client) {
        try {
          // Create a provider wrapper from the Dynamic wallet client
          // This allows BridgeKit to work with Dynamic wallets in Telegram Mini Apps
          const dynamicProvider = {
            request: async (args: { method: string; params?: any[] }) => {
              // For account requests, return the wallet address directly
              // This avoids calling eth_requestAccounts which might trigger MetaMask
              if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') {
                const address = sourceWallet === "primary" ? primaryWalletAddress : (smartAccountAddress || "");
                if (!address) {
                  throw new Error("Wallet address not available");
                }
                return [address];
              }
              
              // For chain switching, use the wallet client's request method
              if (args.method === 'wallet_switchEthereumChain' || args.method === 'wallet_addEthereumChain') {
                if (typeof (client as any).request === 'function') {
                  return (client as any).request(args);
                }
                // If client doesn't support it, try window.ethereum as fallback
                if (typeof window !== 'undefined' && (window as any).ethereum) {
                  return (window as any).ethereum.request(args);
                }
                throw new Error("Chain switching not supported");
              }
              
              // For other requests, use the client's request method if available
              if (typeof (client as any).request === 'function') {
                return (client as any).request(args);
              }
              
              // Fallback to transport if available
              if ((client as any).transport && typeof (client as any).transport.request === 'function') {
                return (client as any).transport.request(args);
              }
              
              throw new Error(`Method ${args.method} not supported`);
            },
            // Add other EIP-1193 provider methods
            on: () => {},
            removeListener: () => {},
            // Add provider identification (optional but helpful)
            isMetaMask: false,
            isCoinbaseWallet: false,
            isDynamic: true, // Mark as Dynamic wallet
          };
          
          adapter = await createAdapterFromProvider({
            provider: dynamicProvider as any,
          });
          console.log("✅ Created adapter from Dynamic wallet client (Telegram Mini App compatible)");
        } catch (adapterError: any) {
          console.error("Failed to create adapter from Dynamic wallet client:", adapterError);
          // Fall through to window.ethereum fallback
        }
      }
      
      // Fallback 2: Use window.ethereum if available (for browser extensions like MetaMask)
      // This is only used if Dynamic wallet client fails
      if (!adapter && typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const ethereum = (window as any).ethereum;
          
          // First, check if we already have accounts (non-blocking)
          let accounts: string[] = [];
          try {
            accounts = await ethereum.request({ method: 'eth_accounts' });
          } catch (err) {
            console.log("eth_accounts check failed:", err);
          }
          
          // If we don't have accounts, try to request them
          if (!accounts || accounts.length === 0) {
            try {
              accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            } catch (permError: any) {
              // If there's already a pending request, wait and retry once
              if (permError.message?.includes('already pending') || permError.code === -32002) {
                console.log("⏳ Permission request already pending, waiting 3 seconds...");
                await new Promise(resolve => setTimeout(resolve, 3000));
                try {
                  accounts = await ethereum.request({ method: 'eth_requestAccounts' });
                } catch (retryError: any) {
                  throw new Error("Please approve the wallet connection request and try again.");
                }
              } else {
                throw permError;
              }
            }
          }
          
          if (!accounts || accounts.length === 0) {
            throw new Error("No wallet accounts available. Please connect your wallet.");
          }
          
          console.log("✅ Wallet connected:", accounts[0]);
          
          adapter = await createAdapterFromProvider({
            provider: ethereum,
          });
          console.log("✅ Created adapter from window.ethereum (fallback)");
        } catch (adapterError: any) {
          console.error("Failed to create adapter from window.ethereum:", adapterError);
          // Continue to error handling below
        }
      }
      
      
      if (!adapter) {
        throw new Error("Unable to create adapter. Please ensure your wallet is connected and supports EIP-1193.");
      }

      // Initialize BridgeKit (no config needed - uses default CCTPv2 provider)
      const kit = new BridgeKit();

      // Map chain names to BridgeKit Blockchain enum
      const fromChain = CHAIN_MAP[sourceChain];
      const toChain = CHAIN_MAP[destinationChain];

      if (!fromChain || !toChain) {
        throw new Error(`Unsupported chain: ${sourceChain} or ${destinationChain}`);
      }

      setStatus("approving");
      setStatusMessage("Starting bridge (approve → burn → attestation → mint)...");

      // Execute bridge using BridgeKit
      const bridgeResult = await kit.bridge({
        from: {
          adapter,
          chain: fromChain,
        },
        to: {
          adapter,
          chain: toChain,
          recipientAddress, // Custom recipient address
        },
        amount: amount, // Amount as string
      });

      // Extract transaction hashes from steps
      const approvalStep = bridgeResult.steps.find(s => s.name.toLowerCase().includes("approve"));
      const burnStep = bridgeResult.steps.find(s => s.name.toLowerCase().includes("burn"));
      const mintStep = bridgeResult.steps.find(s => s.name.toLowerCase().includes("mint"));

      const txHashes = {
        approval: approvalStep?.txHash,
        burn: burnStep?.txHash,
        mint: mintStep?.txHash,
      };

      // Update status based on result state
      if (bridgeResult.state === "success") {
        setStatus("completed");
        setStatusMessage("Transfer completed successfully!");
        setResult({
          success: true,
          message: `Successfully bridged ${bridgeResult.amount} ${bridgeResult.token} from ${bridgeResult.source.chain.name} to ${bridgeResult.destination.chain.name}`,
          txHashes,
        });
        
        if (onTransferComplete) {
          setTimeout(() => {
            onTransferComplete();
          }, 2000);
        }
      } else if (bridgeResult.state === "pending") {
        // Transfer initiated but not complete yet
        if (burnStep?.txHash) {
          setStatus("waiting-attestation");
          setStatusMessage("Waiting for Circle attestation (10-20 seconds)...");
        } else {
          setStatus("burning");
          setStatusMessage("Burning USDC on source chain...");
        }
        setResult({
          success: true,
          message: `Transfer initiated! ${burnStep?.txHash ? `Burn transaction: ${burnStep.txHash}. Waiting for attestation...` : "Processing..."}`,
          txHashes,
        });
      } else {
        // Error state
        const errorStep = bridgeResult.steps.find(s => s.state === "error");
        throw new Error(errorStep?.errorMessage || "Bridge failed");
      }
    } catch (error: any) {
      console.error("BridgeKit error:", error);
      setStatus("error");
      setStatusMessage(error.message || "Bridge failed");
      setResult({
        success: false,
        message: error.message || "Failed to bridge USDC using BridgeKit",
      });
    }
  };

  // Update status message based on status
  useEffect(() => {
    switch (status) {
      case "initializing":
        setStatusMessage("Initializing BridgeKit...");
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
          {result.txHashes && (
            <div className="mt-2 space-y-1 text-xs">
              {result.txHashes.approval && (
                <div className="font-mono break-all">
                  Approval: {result.txHashes.approval}
                </div>
              )}
              {result.txHashes.burn && (
                <div className="font-mono break-all">
                  Burn: {result.txHashes.burn}
                </div>
              )}
              {result.txHashes.mint && (
                <div className="font-mono break-all">
                  Mint: {result.txHashes.mint}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transfer Button */}
      <button
        onClick={handleTransfer}
        disabled={status !== "idle" || !amount || parseFloat(amount) <= 0 || !walletClientReady || (!primaryWallet && !walletClient)}
        className="tg-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status !== "idle" ? `⏳ ${statusMessage}` : 
         !walletClientReady ? "⏳ Waiting for wallet..." :
         (!primaryWallet && !walletClient) ? "🔌 Connect Wallet" :
         "🌉 Bridge USDC"}
      </button>
      
      {/* Debug info (remove in production) */}
      {process.env.NODE_ENV === "development" && (
        <div className="text-xs text-gray-400 mt-2">
          Debug: primaryWallet={primaryWallet ? "✓" : "✗"}, primaryWalletClient={primaryWalletClient ? "✓" : "✗"}, wagmiClient={walletClient ? "✓" : "✗"}, ready={walletClientReady ? "✓" : "✗"}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3 text-center">
        Powered by Circle BridgeKit • All transfers use CCTP protocol and settle on Arc network
      </p>
    </div>
  );
}
