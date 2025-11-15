"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { createCircleSmartAccountFromDynamic } from "../lib/circle-smart-account";

/**
 * Circle Smart Account Verification Component
 * Tests if Circle Smart Account creation works correctly
 */
export function CircleSmartAccountVerification() {
  const { primaryWallet } = useDynamicContext();
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!primaryWallet?.address) {
      setStatus("error");
      setError("Dynamic wallet not connected");
      console.error("❌ Circle Smart Account verification: primaryWallet.address is null");
      return;
    }

    if (!walletClient) {
      setStatus("error");
      setError("Wallet client not ready. Waiting for wagmi to initialize...");
      console.error("❌ Circle Smart Account verification: walletClient is null");
      console.log("Debug info:", { 
        hasPrimaryWallet: !!primaryWallet, 
        hasAddress: !!primaryWallet?.address,
        address: primaryWallet?.address 
      });
      return;
    }

    async function verifyCircleSmartAccount() {
      try {
        const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
        
        if (!clientKey) {
          setStatus("error");
          setError("NEXT_PUBLIC_CIRCLE_CLIENT_KEY not configured in Vercel environment variables");
          console.error("❌ Circle Smart Account verification: Client Key missing");
          return;
        }

        console.log("🔍 Verifying Circle Smart Account...", {
          hasWalletClient: !!walletClient,
          hasAddress: !!primaryWallet?.address,
          address: primaryWallet?.address?.slice(0, 10) + "...",
        });

        // Try to create Circle Smart Account
        const smartAccount = await createCircleSmartAccountFromDynamic(walletClient);
        const address = smartAccount.address;
        
        setSmartAccountAddress(address);
        setStatus("success");
        console.log("✅ Circle Smart Account verified:", address);
      } catch (err: any) {
        setStatus("error");
        const errorMsg = err.message || "Failed to create Circle Smart Account";
        setError(errorMsg);
        console.error("❌ Circle Smart Account verification failed:", {
          error: err.message,
          stack: err.stack,
          name: err.name,
          hasWalletClient: !!walletClient,
          hasAddress: !!primaryWallet?.address,
        });
      }
    }

    verifyCircleSmartAccount();
  }, [primaryWallet?.address, walletClient]);

  if (!primaryWallet?.address) {
    return null;
  }

  return (
    <div className="tg-card p-4 mb-4">
      <h3 className="text-sm font-semibold mb-2">🔍 Circle Smart Account Verification</h3>
      
      {status === "checking" && (
        <div className="text-xs text-gray-600">Checking Circle Smart Account integration...</div>
      )}
      
      {status === "success" && (
        <div className="text-xs text-green-700">
          <div className="font-semibold mb-1">✅ Circle Smart Account Working!</div>
          <div className="font-mono text-xs break-all mt-1">
            {smartAccountAddress}
          </div>
          <div className="text-green-600 mt-1">
            Circle APIs are configured correctly. Gasless transactions will work.
          </div>
        </div>
      )}
      
      {status === "error" && (
        <div className="text-xs text-red-700">
          <div className="font-semibold mb-1">❌ Circle Smart Account Error</div>
          <div className="text-red-600">{error}</div>
          <div className="mt-2 text-red-500">
            Check that NEXT_PUBLIC_CIRCLE_CLIENT_KEY is set in Vercel environment variables.
          </div>
        </div>
      )}
    </div>
  );
}

