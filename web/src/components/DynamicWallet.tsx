"use client";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegramLogin } from "@dynamic-labs/sdk-react-core";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTelegram } from "../hooks/useTelegram";
import { WalletBalance } from "./WalletBalance";
import { CircleSmartWallet } from "./CircleSmartWallet";

export function DynamicWallet() {
  const { 
    primaryWallet, 
    setShowAuthFlow, 
    user
  } = useDynamicContext();
  const { telegramSignIn } = useTelegramLogin();
  const { isTelegram, user: tgUser } = useTelegram();
  const [mounted, setMounted] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-connect if in Telegram and not authenticated
  useEffect(() => {
    if (mounted && isTelegram && tgUser && !primaryWallet && !autoConnecting) {
      const tryAutoConnect = async () => {
        setAutoConnecting(true);
        try {
          // Try seamless Telegram login
          await telegramSignIn({ forceCreateUser: true });
        } catch (error) {
          console.log("Auto-connect failed, user will need to manually connect:", error);
        } finally {
          setAutoConnecting(false);
        }
      };
      
      // Small delay to let auth flow initialize
      setTimeout(tryAutoConnect, 1000);
    }
  }, [mounted, isTelegram, tgUser, primaryWallet, autoConnecting, telegramSignIn]);

  // Auto-create account and sync handle when wallet connects
  useEffect(() => {
    if (primaryWallet?.address) {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      
      // Auto-create account by fetching user (will create if doesn't exist)
      const queryParams = new URLSearchParams({
        walletAddress: primaryWallet.address,
      });
      
      // Add Telegram info if available
      if (isTelegram && tgUser) {
        if (tgUser.username) {
          queryParams.set("telegramHandle", tgUser.username);
        }
        if (tgUser.id) {
          queryParams.set("telegramUserId", tgUser.id.toString());
        }
      }
      
      // This will auto-create account if it doesn't exist
      fetch(`${API}/api/users/me?${queryParams.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            console.log("✅ User account synced:", data.user.telegramHandle || "no handle");
          }
        })
        .catch((err) => {
          console.error("Failed to sync user account:", err);
        });
    }
  }, [primaryWallet?.address, isTelegram, tgUser?.username, tgUser?.id]);

  if (!mounted) {
    return (
      <div className="animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl"></div>
      </div>
    );
  }

  if (primaryWallet) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <div className="text-xs font-semibold text-green-700">
            {isTelegram ? "Telegram Wallet Connected" : "Dynamic Wallet Connected"}
          </div>
        </div>
        <div className="font-mono text-xs mb-2 p-2 bg-gray-50 rounded-lg text-gray-900 break-all">
          {primaryWallet.address?.slice(0, 6)}...{primaryWallet.address?.slice(-4)}
        </div>
        {user?.email && (
          <div className="text-xs text-gray-600 mb-2">
            {user.email}
          </div>
        )}
        {isTelegram && tgUser?.username && (
          <div className="text-xs text-gray-600 mb-2">
            @{tgUser.username}
          </div>
        )}
        {isTelegram && tgUser && (
          <div className="text-xs text-gray-600 mb-2">
            ✓ Authenticated via Telegram
          </div>
        )}
        <div className="mb-3 pt-2 border-t border-gray-200">
          <CircleSmartWallet />
          <WalletBalance />
        </div>
        <Link 
          href="/wallet"
          className="tg-button-secondary w-full text-sm text-center block"
        >
          Manage Wallet
        </Link>
      </div>
    );
  }

  return (
    <div>
      {isTelegram && tgUser ? (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <p className="text-xs text-blue-800">
              👋 Welcome, {tgUser.first_name}! 
              {tgUser.username && ` (@${tgUser.username})`}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Click below to create your wallet automatically
            </p>
          </div>
          <button 
            className="tg-button-primary w-full" 
            onClick={async () => {
              try {
                await telegramSignIn({ forceCreateUser: true });
              } catch (error) {
                setShowAuthFlow(true);
              }
            }}
            disabled={autoConnecting}
          >
            {autoConnecting ? "Connecting..." : "🔐 Create Wallet (Auto)"}
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Your wallet will be created automatically with Telegram
          </p>
        </>
      ) : (
        <>
          <button 
            className="tg-button-primary w-full" 
            onClick={() => setShowAuthFlow(true)}
          >
            🔐 Create or Connect Wallet
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Create a wallet with Dynamic or connect existing one
          </p>
        </>
      )}
    </div>
  );
}

