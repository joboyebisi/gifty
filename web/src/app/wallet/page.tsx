"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegram } from "../../hooks/useTelegram";
import { WalletBalance } from "../../components/WalletBalance";
import { DualWalletDisplay } from "../../components/DualWalletDisplay";
import { CircleSmartAccountVerification } from "../../components/CircleSmartAccountVerification";
import { CCTPBridge } from "../../components/CCTPBridge";
import Link from "next/link";

interface BalanceData {
  sepolia?: {
    eth: { balanceFormatted: string; error?: string };
    usdc: { balanceFormatted: string; error?: string };
  };
  arc?: {
    usdc: { balanceFormatted: string; error?: string };
  };
  walletAddress?: string;
  error?: string;
}

export default function WalletPage() {
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const { isTelegram, user: tgUser } = useTelegram();
  const [balances, setBalances] = useState<BalanceData | null>(null);
  const [smartAccountBalances, setSmartAccountBalances] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSmartAccount, setLoadingSmartAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [circleWalletId, setCircleWalletId] = useState<string | null>(null);
  const [creatingCircleWallet, setCreatingCircleWallet] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Fetch Circle wallet status
  useEffect(() => {
    if (primaryWallet?.address) {
      fetch(`${API}/api/users/me?walletAddress=${primaryWallet.address}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.user?.circleWalletId) {
            setCircleWalletId(data.user.circleWalletId);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch Circle wallet status:", err);
        });
    }
  }, [primaryWallet?.address, API]);

  // Function to create Circle wallet
  const createCircleWallet = async () => {
    if (!primaryWallet?.address) return;
    
    setCreatingCircleWallet(true);
    try {
      const res = await fetch(`${API}/api/wallet/create-circle-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: primaryWallet.address,
          telegramUserId: isTelegram && tgUser?.id ? tgUser.id.toString() : undefined,
          telegramHandle: isTelegram && tgUser?.username ? tgUser.username : undefined,
        }),
      });
      const data = await res.json();
      if (data.circleWalletId) {
        setCircleWalletId(data.circleWalletId);
        alert("✅ Circle wallet created! You can now use fiat funding.");
      } else {
        alert(data.error || "Failed to create Circle wallet");
      }
    } catch (err: any) {
      console.error("Failed to create Circle wallet:", err);
      alert("❌ Failed to create Circle wallet. Please try again.");
    } finally {
      setCreatingCircleWallet(false);
    }
  };

  // Manual refresh function for primary wallet (no automatic refresh)
  const fetchBalances = async () => {
    if (!primaryWallet?.address) return;
    
    setLoading(true);
    try {
      console.log(`💰 Fetching balances for primary wallet: ${primaryWallet.address}`);
      const res = await fetch(`${API}/api/wallet/balance?walletAddress=${primaryWallet.address}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log("✅ Primary wallet balances:", data);
      setBalances(data);
    } catch (err: any) {
      console.error("❌ Error fetching primary wallet balances:", err);
      setBalances({ error: err.message || "Failed to load balances" });
    } finally {
      setLoading(false);
    }
  };

  // Get Circle Smart Account address from verification component or try to create it
  useEffect(() => {
    if (!primaryWallet?.address || smartAccountAddress) return;

    async function getSmartAccountAddress() {
      try {
        const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
        if (!clientKey) return;

        // Wait a bit for Dynamic wallet to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        const dynamicWalletClient = await (primaryWallet as any).getWalletClient?.();
        if (!dynamicWalletClient) {
          console.log("⏳ Wallet page: Waiting for wallet client...");
          return;
        }

        const { createCircleSmartAccountFromDynamic } = await import("../../lib/circle-smart-account");
        const smartAccount = await createCircleSmartAccountFromDynamic(dynamicWalletClient);
        setSmartAccountAddress(smartAccount.address);
        console.log("✅ Wallet page: Circle Smart Account address loaded:", smartAccount.address);
      } catch (err: any) {
        console.error("❌ Wallet page: Error getting Circle Smart Account address:", err);
      }
    }

    getSmartAccountAddress();
  }, [primaryWallet?.address, smartAccountAddress]);

  // Fetch Circle Smart Account balances
  const fetchSmartAccountBalances = async () => {
    if (!smartAccountAddress) {
      console.log("⏳ Wallet page: Smart account address not ready yet");
      return;
    }
    
    setLoadingSmartAccount(true);
    try {
      console.log(`💰 Fetching balances for Circle Smart Account: ${smartAccountAddress}`);
      const res = await fetch(`${API}/api/wallet/balance?walletAddress=${smartAccountAddress}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log("✅ Circle Smart Account balances:", data);
      setSmartAccountBalances(data);
    } catch (err: any) {
      console.error("❌ Error fetching Circle Smart Account balances:", err);
      setSmartAccountBalances({ error: err.message || "Failed to load balances" });
    } finally {
      setLoadingSmartAccount(false);
    }
  };

  // Auto-fetch smart account balances when address is available
  useEffect(() => {
    if (smartAccountAddress && !smartAccountBalances && !loadingSmartAccount) {
      fetchSmartAccountBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartAccountAddress]);

  // Combined refresh function
  const refreshAllBalances = async () => {
    await Promise.all([fetchBalances(), fetchSmartAccountBalances()]);
  };

  // Initial load only (no automatic refresh)
  useEffect(() => {
    if (!primaryWallet?.address) {
      setBalances(null);
      return;
    }
    fetchBalances();
  }, [primaryWallet?.address]);

  function copyAddress() {
    if (primaryWallet?.address) {
      navigator.clipboard.writeText(primaryWallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!primaryWallet?.address) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-4 text-center">💼 Manage Wallet</h2>
        <div className="tg-card p-6 text-center">
          <p className="text-sm text-gray-700 mb-4">
            Connect your wallet to manage it.
          </p>
          <Link href="/" className="tg-button-primary inline-block">
            Connect Wallet
          </Link>
        </div>
        <Link href="/" className="tg-button-secondary text-center block text-sm mt-4">
          ← Go Home
        </Link>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4 text-center">💼 Manage Wallet</h2>

      {/* Note: Circle Smart Accounts (Modular Wallets) don't support Arc network
          We use Dynamic wallets (user-controlled) + Developer-Controlled Wallets (escrow) instead
          Both support Arc network perfectly */}

      {/* Wallet Address */}
      <div className="tg-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Wallet Address</span>
          <button
            onClick={copyAddress}
            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div className="font-mono text-xs p-2 bg-gray-50 rounded break-all text-gray-900">
          {primaryWallet.address}
        </div>
      </div>

      {/* User Info */}
      <div className="tg-card p-4 mb-4">
        <div className="space-y-2 text-sm">
          {dynamicUser?.email && (
            <div>
              <span className="text-gray-600">Email:</span>
              <p className="font-medium">{dynamicUser.email}</p>
            </div>
          )}
          {isTelegram && tgUser?.username && (
            <div>
              <span className="text-gray-600">Telegram Handle:</span>
              <p className="font-medium">@{tgUser.username}</p>
            </div>
          )}
          {isTelegram && tgUser && (
            <div className="text-xs text-green-600">
              ✓ Authenticated via Telegram
            </div>
          )}
        </div>
      </div>

      {/* Circle Smart Account Verification */}
      <div className="mb-4">
        <CircleSmartAccountVerification />
      </div>

      {/* Dual Wallet Display with Balances */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-3">💼 Your Wallets</h3>
        <DualWalletDisplay />
      </div>

      {/* Quick Balance Check - Shows both Primary and Circle Smart Account */}
      <div className="tg-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">💰 Quick Balance Check</h3>
          <button
            onClick={refreshAllBalances}
            className="text-xs px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded disabled:opacity-50"
            disabled={loading || loadingSmartAccount}
          >
            {(loading || loadingSmartAccount) ? "⏳ Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
        
        {/* Primary Wallet (Dynamic) Balances */}
        <div className="mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="font-semibold text-sm text-gray-700">Primary Wallet (Dynamic)</div>
          </div>
          <div className="text-xs text-gray-500 mb-2 font-mono break-all">
            {primaryWallet.address}
          </div>
          {loading && !balances ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ) : balances?.error ? (
            <div className="text-xs text-red-600">⚠️ {balances.error}</div>
          ) : (
            <div className="space-y-2">
              {balances?.sepolia && (
                <div className="space-y-1">
                  <div className="font-semibold text-xs text-gray-600">Ethereum Sepolia</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">ETH:</span>
                    <span className="font-mono font-semibold">
                      {balances.sepolia.eth?.balanceFormatted || "0.00"}
                      {balances.sepolia.eth?.error && (
                        <span className="text-red-500 ml-1" title={balances.sepolia.eth.error}>⚠️</span>
                      )}
                    </span>
                  </div>
                  {balances.sepolia.eth?.error && (
                    <div className="text-xs text-red-500 mt-0.5">{balances.sepolia.eth.error}</div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">USDC:</span>
                    <span className="font-mono font-semibold text-green-600">
                      {balances.sepolia.usdc?.balanceFormatted || "0.00"}
                      {balances.sepolia.usdc?.error && (
                        <span className="text-red-500 ml-1" title={balances.sepolia.usdc.error}>⚠️</span>
                      )}
                    </span>
                  </div>
                  {balances.sepolia.usdc?.error && (
                    <div className="text-xs text-red-500 mt-0.5">{balances.sepolia.usdc.error}</div>
                  )}
                </div>
              )}
              {balances?.arc && (
                <div className="space-y-1 mt-2">
                  <div className="font-semibold text-xs text-gray-600">Arc Testnet</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">USDC:</span>
                    <span className="font-mono font-semibold text-green-600">
                      {balances.arc.usdc?.balanceFormatted || "0.00"}
                      {balances.arc.usdc?.error && (
                        <span className="text-red-500 ml-1" title={balances.arc.usdc.error}>⚠️</span>
                      )}
                    </span>
                  </div>
                  {balances.arc.usdc?.error && (
                    <div className="text-xs text-red-500 mt-0.5">{balances.arc.usdc.error}</div>
                  )}
                </div>
              )}
              {!balances?.sepolia && !balances?.arc && !balances?.error && (
                <div className="text-xs text-gray-500">No balances found</div>
              )}
            </div>
          )}
        </div>

        {/* Circle Smart Account Balances */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="font-semibold text-sm text-gray-700">Circle Smart Account</div>
          </div>
          {!smartAccountAddress ? (
            <div className="text-xs text-gray-500 mb-2">
              Circle Smart Account not loaded yet. Check "Your Wallets" section above.
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-2 font-mono break-all">
                {smartAccountAddress}
              </div>
              {loadingSmartAccount && !smartAccountBalances ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ) : smartAccountBalances?.error ? (
                <div className="text-xs text-red-600">⚠️ {smartAccountBalances.error}</div>
              ) : (
                <div className="space-y-2">
                  {smartAccountBalances?.sepolia && (
                    <div className="space-y-1">
                      <div className="font-semibold text-xs text-gray-600">Ethereum Sepolia</div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">ETH:</span>
                        <span className="font-mono font-semibold">
                          {smartAccountBalances.sepolia.eth?.balanceFormatted || "0.00"}
                          {smartAccountBalances.sepolia.eth?.error && (
                            <span className="text-red-500 ml-1" title={smartAccountBalances.sepolia.eth.error}>⚠️</span>
                          )}
                        </span>
                      </div>
                      {smartAccountBalances.sepolia.eth?.error && (
                        <div className="text-xs text-red-500 mt-0.5">{smartAccountBalances.sepolia.eth.error}</div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">USDC:</span>
                        <span className="font-mono font-semibold text-green-600">
                          {smartAccountBalances.sepolia.usdc?.balanceFormatted || "0.00"}
                          {smartAccountBalances.sepolia.usdc?.error && (
                            <span className="text-red-500 ml-1" title={smartAccountBalances.sepolia.usdc.error}>⚠️</span>
                          )}
                        </span>
                      </div>
                      {smartAccountBalances.sepolia.usdc?.error && (
                        <div className="text-xs text-red-500 mt-0.5">{smartAccountBalances.sepolia.usdc.error}</div>
                      )}
                    </div>
                  )}
                  {smartAccountBalances?.arc && (
                    <div className="space-y-1 mt-2">
                      <div className="font-semibold text-xs text-gray-600">Arc Testnet</div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">USDC:</span>
                        <span className="font-mono font-semibold text-green-600">
                          {smartAccountBalances.arc.usdc?.balanceFormatted || "0.00"}
                          {smartAccountBalances.arc.usdc?.error && (
                            <span className="text-red-500 ml-1" title={smartAccountBalances.arc.usdc.error}>⚠️</span>
                          )}
                        </span>
                      </div>
                      {smartAccountBalances.arc.usdc?.error && (
                        <div className="text-xs text-red-500 mt-0.5">{smartAccountBalances.arc.usdc.error}</div>
                      )}
                    </div>
                  )}
                  {!smartAccountBalances?.sepolia && !smartAccountBalances?.arc && !smartAccountBalances?.error && (
                    <div className="text-xs text-gray-500">No balances found</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

             {/* Circle Integration Info */}
             <div className="tg-card p-3 mb-4 bg-blue-50 border border-blue-200">
               <div className="text-xs text-blue-800">
                 <strong>💡 About Circle Integration</strong>
                 <div className="text-xs text-blue-600 mt-1">
                   • Your Dynamic wallet works directly on Arc network<br/>
                   • Developer-Controlled Wallets handle escrow (backend)<br/>
                   • Circle onramp works with any wallet address<br/>
                   • All transactions settle on Arc network as required
                 </div>
               </div>
             </div>

      {/* CCTP Bridge */}
      <div className="mb-4">
        <CCTPBridge
          primaryWalletAddress={primaryWallet.address}
          smartAccountAddress={smartAccountAddress}
          onTransferComplete={() => {
            // Refresh balances after transfer
            refreshAllBalances();
          }}
        />
      </div>

      {/* Actions */}
      <div className="space-y-2 mb-4">
        <Link href="/swap" className="tg-button-primary w-full text-center block">
          💱 Swap Tokens
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="tg-button-secondary text-sm"
            onClick={async () => {
              if (!primaryWallet?.address) return;
              
              // No Circle wallet needed - Dynamic wallet works directly
              
              const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
              try {
                const res = await fetch(`${API}/api/onramp/wire-instructions`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ walletAddress: primaryWallet.address }),
                });
                const data = await res.json();
                
                if (data.requiresCircleWallet) {
                  alert(`⚠️ ${data.error}\n\nTo use fiat funding, you need a Circle wallet. Click "Create Circle Wallet" above.`);
                } else {
                  alert(`💵 Fund Wallet (Fiat to Crypto)\n\n${data.message}\n\n${data.instructions.join("\n")}\n\n${data.note}`);
                }
              } catch (err: any) {
                alert(`Error: ${err.message || "Failed to get funding instructions"}`);
              }
            }}
          >
            💵 Fund Wallet
          </button>
          <button
            className="tg-button-secondary text-sm"
            onClick={async () => {
              if (!primaryWallet?.address) return;
              
              const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
              try {
                // For now, show info about withdrawal
                alert(`🏦 Withdraw to Bank (Crypto to Fiat)\n\nTo withdraw USDC to your bank account:\n\n1. Link a bank account using /api/bank/link\n2. Use /api/offramp/withdraw with your bank account ID\n3. Circle will convert USDC to fiat and transfer to your bank\n\nNote: This requires Circle Mint account setup.`);
              } catch (err: any) {
                alert(`Error: ${err.message || "Failed to get withdrawal info"}`);
              }
            }}
          >
            🏦 Withdraw
          </button>
        </div>
      </div>

      <Link href="/" className="tg-button-secondary text-center block text-sm">
        ← Go Home
      </Link>
    </div>
  );
}

