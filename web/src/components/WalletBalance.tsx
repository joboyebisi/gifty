"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

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

export function WalletBalance() {
  const { primaryWallet } = useDynamicContext();
  const [balances, setBalances] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    if (!primaryWallet?.address) {
      setBalances(null);
      return;
    }

    async function fetchBalances() {
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

  if (!primaryWallet?.address) {
    return null;
  }

  if (loading && !balances) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (balances?.error) {
    return (
      <div className="text-xs text-red-600">
        ⚠️ {balances.error}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {balances?.sepolia && (
        <div className="space-y-1">
          <div className="font-semibold text-gray-700">Ethereum Sepolia</div>
          <div className="flex justify-between">
            <span className="text-gray-600">ETH:</span>
            <span className="font-mono">{balances.sepolia.eth.balanceFormatted || "0.00"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">USDC:</span>
            <span className="font-mono text-green-600">{balances.sepolia.usdc.balanceFormatted || "0.00"}</span>
          </div>
        </div>
      )}
      {balances?.arc && (
        <div className="space-y-1 pt-2 border-t border-gray-200">
          <div className="font-semibold text-gray-700">Arc Testnet</div>
          <div className="flex justify-between">
            <span className="text-gray-600">USDC:</span>
            <span className="font-mono text-green-600">{balances.arc.usdc.balanceFormatted || "0.00"}</span>
          </div>
        </div>
      )}
      {!balances?.sepolia && !balances?.arc && (
        <div className="text-xs text-gray-500">No balances found</div>
      )}
    </div>
  );
}

