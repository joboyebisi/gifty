"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { createCircleSmartAccountFromDynamic } from "../lib/circle-smart-account";

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
      title="Copy address"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

interface BalanceData {
  sepolia?: {
    eth: { balanceFormatted: string; error?: string };
    usdc: { balanceFormatted: string; error?: string };
  };
  arc?: {
    usdc: { balanceFormatted: string; error?: string };
  };
  error?: string;
}

/**
 * Dual Wallet Display Component
 * Shows both Dynamic wallet (primary) and Circle Smart Account (secondary) with balances
 */
export function DualWalletDisplay() {
  const { primaryWallet } = useDynamicContext();
  const [smartAccountAddress, setSmartAccountAddress] = useState<`0x${string}` | null>(null);
  const [dynamicBalances, setDynamicBalances] = useState<BalanceData | null>(null);
  const [smartAccountBalances, setSmartAccountBalances] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Load Circle Smart Account address - using same method as CircleSmartAccountVerification
  useEffect(() => {
    if (!primaryWallet?.address) {
      setSmartAccountAddress(null);
      return;
    }

    // Wait a bit for Dynamic wallet to fully initialize
    let timeoutId: NodeJS.Timeout;

    async function loadSmartAccount() {
      const wallet = primaryWallet;
      if (!wallet) {
        setError("Dynamic wallet not connected");
        return;
      }

      try {
        const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
        if (!clientKey) {
          setError("Circle Client Key not configured");
          return;
        }

        // Use the same method as CircleSmartAccountVerification
        // Get wallet client directly from Dynamic connector (same as verification component)
        const dynamicWalletClient = await (wallet as any).getWalletClient?.();

        if (!dynamicWalletClient) {
          setError("Wallet client not ready");
          console.log("⏳ DualWalletDisplay: Waiting for wallet client...");
          return;
        }

        console.log("🔍 DualWalletDisplay: Creating Circle Smart Account...", {
          hasWalletClient: !!dynamicWalletClient,
          hasAddress: !!wallet.address,
          address: wallet.address?.slice(0, 10) + "...",
        });

        // Create Circle Smart Account (same as verification component)
        const smartAccount = await createCircleSmartAccountFromDynamic(dynamicWalletClient);
        const address = smartAccount.address;

        setSmartAccountAddress(address);
        setError(null); // Clear any previous errors
        console.log("✅ DualWalletDisplay: Circle Smart Account loaded:", address);
      } catch (err: any) {
        console.error("❌ DualWalletDisplay: Error loading Circle Smart Account:", err);
        setError(err.message || "Failed to load Circle Smart Account");
      }
    }

    // Wait 2 seconds for Dynamic wallet to initialize, then load
    // Use same timing as CircleSmartAccountVerification component
    timeoutId = setTimeout(() => {
      loadSmartAccount();
    }, 2000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [primaryWallet?.address]);

  // Fetch balances for Dynamic wallet (primary)
  useEffect(() => {
    if (!primaryWallet?.address) {
      setDynamicBalances(null);
      return;
    }

    async function fetchDynamicBalances() {
      const walletAddress = primaryWallet?.address;
      if (!walletAddress) return;
      
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/wallet/balance?walletAddress=${walletAddress}`);
        const data = await res.json();
        setDynamicBalances(data);
      } catch (err) {
        console.error("Error fetching Dynamic wallet balances:", err);
        setDynamicBalances({ error: "Failed to load balances" });
      } finally {
        setLoading(false);
      }
    }

    fetchDynamicBalances();
  }, [primaryWallet?.address, API]);

  // Fetch balances for Circle Smart Account (secondary)
  useEffect(() => {
    if (!smartAccountAddress) {
      setSmartAccountBalances(null);
      return;
    }

    async function fetchSmartAccountBalances() {
      try {
        const res = await fetch(`${API}/api/wallet/balance?walletAddress=${smartAccountAddress}`);
        const data = await res.json();
        setSmartAccountBalances(data);
      } catch (err) {
        console.error("Error fetching Smart Account balances:", err);
        setSmartAccountBalances({ error: "Failed to load balances" });
      }
    }

    fetchSmartAccountBalances();
  }, [smartAccountAddress, API]);

  if (!primaryWallet?.address) {
    return null;
  }

  const hasCircleClientKey = !!process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;

  return (
    <div className="space-y-4">
      {/* Primary Wallet: Dynamic Wallet */}
      <div className="tg-card p-4 border-2 border-green-200 bg-green-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="text-sm font-semibold text-green-900">
              🏦 Primary Wallet (Dynamic)
            </div>
          </div>
          <div className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
            PRIMARY
          </div>
        </div>
        <div className="font-mono text-xs text-green-800 break-all mb-2">
          {primaryWallet.address}
        </div>
        <div className="text-xs text-green-700 mb-3">
          <strong>Use:</strong> Receives funds, standard transactions, wallet connection
        </div>
        
        {/* Dynamic Wallet Balances */}
        {loading && !dynamicBalances ? (
          <div className="animate-pulse space-y-1">
            <div className="h-3 bg-green-200 rounded w-1/2"></div>
            <div className="h-3 bg-green-200 rounded w-1/3"></div>
          </div>
        ) : dynamicBalances?.error ? (
          <div className="text-xs text-red-600">⚠️ {dynamicBalances.error}</div>
        ) : (
          <div className="space-y-1 text-xs">
            {dynamicBalances?.sepolia && (
              <div className="space-y-1 pb-2 border-b border-green-200">
                <div className="font-semibold text-green-800">Ethereum Sepolia</div>
                <div className="flex justify-between">
                  <span className="text-green-700">ETH:</span>
                  <span className="font-mono font-semibold">
                    {dynamicBalances.sepolia.eth.balanceFormatted || "0.00"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">USDC:</span>
                  <span className="font-mono font-semibold text-green-600">
                    {dynamicBalances.sepolia.usdc.balanceFormatted || "0.00"}
                  </span>
                </div>
              </div>
            )}
            {dynamicBalances?.arc && (
              <div className="space-y-1">
                <div className="font-semibold text-green-800">Arc Testnet</div>
                <div className="flex justify-between">
                  <span className="text-green-700">USDC:</span>
                  <span className="font-mono font-semibold text-green-600">
                    {dynamicBalances.arc.usdc.balanceFormatted || "0.00"}
                  </span>
                </div>
              </div>
            )}
            {!dynamicBalances?.sepolia && !dynamicBalances?.arc && (
              <div className="text-xs text-green-600">No balances found</div>
            )}
          </div>
        )}
      </div>

      {/* Secondary Wallet: Circle Smart Account */}
      {hasCircleClientKey ? (
        error ? (
          <div className="tg-card p-4 border-2 border-red-200 bg-red-50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <div className="text-sm font-semibold text-red-900">
                ⚡ Secondary Wallet (Circle Smart Account)
              </div>
            </div>
            <div className="text-xs text-red-700">
              ⚠️ {error}
            </div>
          </div>
        ) : smartAccountAddress ? (
          <div className="tg-card p-4 border-2 border-blue-200 bg-blue-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="text-sm font-semibold text-blue-900">
                  ⚡ Secondary Wallet (Circle Smart Account)
                </div>
              </div>
              <div className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
                GASLESS
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="font-mono text-xs text-blue-800 break-all flex-1">
                {smartAccountAddress}
              </div>
              <CopyButton text={smartAccountAddress} />
            </div>
            <div className="text-xs text-blue-700 mb-3">
              <strong>Use:</strong> Gasless transactions, account abstraction, sponsored fees
            </div>
            
            {/* Smart Account Balances */}
            {smartAccountBalances?.error ? (
              <div className="text-xs text-red-600">⚠️ {smartAccountBalances.error}</div>
            ) : (
              <div className="space-y-1 text-xs">
                {smartAccountBalances?.sepolia && (
                  <div className="space-y-1 pb-2 border-b border-blue-200">
                    <div className="font-semibold text-blue-800">Ethereum Sepolia</div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">ETH:</span>
                      <span className="font-mono font-semibold">
                        {smartAccountBalances.sepolia.eth.balanceFormatted || "0.00"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">USDC:</span>
                      <span className="font-mono font-semibold text-blue-600">
                        {smartAccountBalances.sepolia.usdc.balanceFormatted || "0.00"}
                      </span>
                    </div>
                  </div>
                )}
                {smartAccountBalances?.arc && (
                  <div className="space-y-1">
                    <div className="font-semibold text-blue-800">Arc Testnet</div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">USDC:</span>
                      <span className="font-mono font-semibold text-blue-600">
                        {smartAccountBalances.arc.usdc.balanceFormatted || "0.00"}
                      </span>
                    </div>
                  </div>
                )}
                {!smartAccountBalances?.sepolia && !smartAccountBalances?.arc && (
                  <div className="text-xs text-blue-600">No balances found</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="tg-card p-4 border-2 border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="text-sm font-semibold text-gray-700">
                ⚡ Secondary Wallet (Circle Smart Account)
              </div>
            </div>
            <div className="text-xs text-gray-600">
              Loading Circle Smart Account...
            </div>
          </div>
        )
      ) : (
        <div className="tg-card p-4 border-2 border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <div className="text-sm font-semibold text-yellow-900">
              ⚡ Secondary Wallet (Circle Smart Account)
            </div>
          </div>
          <div className="text-xs text-yellow-800">
            ⚠️ Circle Client Key not configured. Gasless transactions unavailable.
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="tg-card p-3 bg-gray-50 border border-gray-200">
        <div className="text-xs text-gray-700">
          <strong>💡 How They Work Together:</strong>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><strong>Primary (Dynamic):</strong> Your main wallet address. Use for receiving funds and standard transactions.</li>
            <li><strong>Secondary (Circle Smart Account):</strong> Enables gasless transactions. Funds can be transferred between wallets.</li>
            <li>Both wallets share the same private key (managed by Dynamic).</li>
            <li>Circle Smart Account uses your Dynamic wallet as the owner.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

