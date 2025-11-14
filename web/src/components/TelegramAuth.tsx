"use client";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegramLogin } from "@dynamic-labs/sdk-react-core";
import { useTelegram } from "../hooks/useTelegram";
import { useSearchParams } from "next/navigation";

/**
 * TelegramAuth Component
 * 
 * Handles seamless Telegram login and auto-wallet creation
 * when users open the Mini App from Telegram
 */
export function TelegramAuth() {
  const { user, setShowAuthFlow } = useDynamicContext();
  const isAuthenticated = !!user; // Check authentication via user object
  const { telegramSignIn, isAuthWithTelegram } = useTelegramLogin();
  const { isTelegram, user: tgUser } = useTelegram();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAndAuth = async () => {
      if (!isTelegram || !tgUser) {
        setChecking(false);
        return;
      }

      try {
        // Check if user is already authenticated with Telegram
        const isLinkedWithTelegram = await isAuthWithTelegram();

        if (isLinkedWithTelegram) {
          // Auto login if Telegram is connected
          try {
            await telegramSignIn();
            setChecking(false);
          } catch (error) {
            console.error("Auto-login failed:", error);
            setChecking(false);
          }
        } else {
          // Check for auth token in URL (from bot)
          const authToken = searchParams.get("tgWebAppStartParam");
          
          if (authToken) {
            // User came from Telegram bot - try seamless login
            try {
              await telegramSignIn({ 
                forceCreateUser: true, 
                authToken: authToken 
              });
              setChecking(false);
            } catch (error) {
              console.error("Seamless login failed:", error);
              // Show modal to check if user has existing account
              setShowModal(true);
              setChecking(false);
            }
          } else {
            // Show modal to check if user has existing account
            setShowModal(true);
            setChecking(false);
          }
        }
      } catch (error) {
        console.error("Telegram auth check error:", error);
        setChecking(false);
      }
    };

    checkAndAuth();
  }, [isTelegram, tgUser, isAuthWithTelegram, telegramSignIn, searchParams]);

  const handleModalResponse = async (userHasAccount: boolean) => {
    setHasAccount(userHasAccount);
    setShowModal(false);

    if (userHasAccount) {
      // Prompt user to log in with their existing account
      setShowAuthFlow(true);
    } else {
      // Auto-create account and log in
      try {
        const authToken = searchParams.get("tgWebAppStartParam");
        await telegramSignIn({ 
          forceCreateUser: true,
          authToken: authToken || undefined,
        });
      } catch (error) {
        console.error("Auto-create failed:", error);
        setShowAuthFlow(true);
      }
    }
  };

  // Don't render anything, just handle auth logic
  if (checking) {
    return null;
  }

  // Show modal if user needs to confirm account status
  if (showModal && hasAccount === null) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="tg-card p-6 max-w-md w-full">
          <h3 className="text-lg font-semibold mb-4">Welcome to Gifties! 🎁</h3>
          <p className="text-sm text-gray-700 mb-6">
            Do you already have a Gifties account?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleModalResponse(true)}
              className="tg-button-secondary flex-1"
            >
              Yes, I have an account
            </button>
            <button
              onClick={() => handleModalResponse(false)}
              className="tg-button-primary flex-1"
            >
              No, create new account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

