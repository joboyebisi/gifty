"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegram } from "../../hooks/useTelegram";
import { WalletBalance } from "../../components/WalletBalance";
import { DualWalletDisplay } from "../../components/DualWalletDisplay";
import { CircleSmartAccountVerification } from "../../components/CircleSmartAccountVerification";
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
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [circleWalletId, setCircleWalletId] = useState<string | null>(null);
  const [creatingCircleWallet, setCreatingCircleWallet] = useState(false);

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

  useEffect(() => {
    if (!primaryWallet?.address) {
      setBalances(null);
      return;
    }

    async function fetchBalances() {
      if (!primaryWallet?.address) return;
      
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/wallet/balance?walletAddress=${primaryWallet.address}`);
        const data = await res.json();
        setBalances(data);
      } catch (err) {
        console.error("Error fetching balances:", err);
        setBalances({ error: "Failed to load balances" });
      } finally {
        setLoading(false);
      }
    }

    fetchBalances();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [primaryWallet?.address, API]);

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

      {/* Legacy Balance Display (for backward compatibility) */}
      <div className="tg-card p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">💰 Quick Balance Check</h3>
        {loading && !balances ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ) : balances?.error ? (
          <div className="text-xs text-red-600">⚠️ {balances.error}</div>
        ) : (
          <div className="space-y-3">
            {balances?.sepolia && (
              <div className="space-y-2 pb-3 border-b border-gray-200">
                <div className="font-semibold text-sm text-gray-700">Ethereum Sepolia</div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ETH:</span>
                  <span className="font-mono font-semibold">
                    {balances.sepolia.eth.balanceFormatted || "0.00"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">USDC:</span>
                  <span className="font-mono font-semibold text-green-600">
                    {balances.sepolia.usdc.balanceFormatted || "0.00"}
                  </span>
                </div>
              </div>
            )}
            {balances?.arc && (
              <div className="space-y-2">
                <div className="font-semibold text-sm text-gray-700">Arc Testnet</div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">USDC:</span>
                  <span className="font-mono font-semibold text-green-600">
                    {balances.arc.usdc.balanceFormatted || "0.00"}
                  </span>
                </div>
              </div>
            )}
            {!balances?.sepolia && !balances?.arc && (
              <div className="text-xs text-gray-500">No balances found</div>
            )}
          </div>
        )}
        <button
          onClick={() => {
            if (primaryWallet?.address) {
              const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
              fetch(`${API}/api/wallet/balance?walletAddress=${primaryWallet.address}`)
                .then((res) => res.json())
                .then((data) => setBalances(data))
                .catch((err) => console.error("Error refreshing:", err));
            }
          }}
          className="tg-button-secondary w-full text-sm mt-3"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "🔄 Refresh Balances"}
        </button>
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

