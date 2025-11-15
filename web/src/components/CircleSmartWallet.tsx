"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { createCircleSmartAccountFromDynamic, getCircleSmartAccountAddress } from "../lib/circle-smart-account";

/**
 * Circle Smart Wallet Component
 * Shows Circle Smart Account address and enables gasless transactions
 */
export function CircleSmartWallet() {
  const { primaryWallet } = useDynamicContext();
  const { data: walletClient } = useWalletClient();
  const [smartAccountAddress, setSmartAccountAddress] = useState<`0x${string}` | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!primaryWallet?.address || !walletClient) {
      setSmartAccountAddress(null);
      return;
    }

    async function loadSmartAccount() {
      setLoading(true);
      setError(null);
      try {
        const address = await getCircleSmartAccountAddress(walletClient);
        setSmartAccountAddress(address);
      } catch (err: any) {
        console.error("Error loading Circle Smart Account:", err);
        setError(err.message || "Failed to load Circle Smart Account");
      } finally {
        setLoading(false);
      }
    }

    loadSmartAccount();
  }, [primaryWallet?.address, walletClient]);

  if (!primaryWallet?.address) {
    return null;
  }

  // Circle Smart Accounts are REQUIRED for gasless transactions
  const hasCircleClientKey = !!process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;

  if (!hasCircleClientKey) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
        <div className="text-xs text-red-800">
          <strong>⚠️ Circle Smart Account Required:</strong> NEXT_PUBLIC_CIRCLE_CLIENT_KEY must be configured for gasless transactions. Transactions will fail without it.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg mb-4">
        <div className="text-xs text-gray-600">Loading Circle Smart Account...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
        <div className="text-xs text-red-800">⚠️ {error}</div>
      </div>
    );
  }

  if (!smartAccountAddress) {
    return null;
  }

  return (
    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
      <div className="text-xs font-semibold text-blue-900 mb-1">
        ⚡ Circle Smart Account (Gasless)
      </div>
      <div className="font-mono text-xs text-blue-700 break-all">
        {smartAccountAddress}
      </div>
      <div className="text-xs text-blue-600 mt-1">
        This address supports gasless transactions and account abstraction
      </div>
    </div>
  );
}

