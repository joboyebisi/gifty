"use client";
import { useEffect, useState } from "react";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

function checkTelegramSDK() {
  if (typeof window === "undefined") return null;
  
  // Check for Telegram WebApp SDK
  if ((window as any).Telegram?.WebApp) {
    return (window as any).Telegram.WebApp;
  }
  
  // Check for alternative SDK format
  if ((window as any).TelegramWebApp) {
    return (window as any).TelegramWebApp;
  }
  
  return null;
}

export function useTelegram() {
  const [isTelegram, setIsTelegram] = useState(false);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    let checkInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const initializeTelegram = () => {
      const tg = checkTelegramSDK();
      
      if (tg) {
        console.log("✅ Telegram WebApp detected");
        setIsTelegram(true);
        setSdkReady(true);
        
        try {
          tg.ready();
          tg.expand();
          
          // Enable closing confirmation
          tg.enableClosingConfirmation();
          
          // Set theme colors if available
          if (tg.themeParams) {
            console.log("📱 Telegram theme:", tg.themeParams);
          }

          if (tg.initDataUnsafe?.user) {
            console.log("👤 Telegram user detected:", tg.initDataUnsafe.user);
            setUser(tg.initDataUnsafe.user);
            setInitData(tg.initData);
          } else {
            console.warn("⚠️ Telegram WebApp detected but no user data found");
            console.log("Available initDataUnsafe:", tg.initDataUnsafe);
          }
        } catch (error) {
          console.error("❌ Error initializing Telegram WebApp:", error);
        }
      } else {
        // Check if we're in Telegram's user agent (even if SDK not loaded yet)
        const userAgent = typeof window !== "undefined" ? window.navigator?.userAgent || "" : "";
        const isTelegramUA = userAgent.includes("Telegram");
        
        if (isTelegramUA) {
          console.log("📱 Telegram user agent detected, waiting for SDK...");
          // Wait for SDK to load
          checkInterval = setInterval(() => {
            const tg = checkTelegramSDK();
            if (tg) {
              if (checkInterval) clearInterval(checkInterval);
              initializeTelegram();
            }
          }, 100);
          
          // Timeout after 5 seconds
          timeoutId = setTimeout(() => {
            if (checkInterval) clearInterval(checkInterval);
            console.warn("⚠️ Telegram SDK did not load within 5 seconds");
          }, 5000);
        } else {
          console.log("🌐 Not running in Telegram WebApp");
        }
      }
    };

    // Try immediately
    initializeTelegram();

    // Also listen for SDK ready event
    const handleSDKReady = () => {
      console.log("📡 Telegram SDK ready event received");
      initializeTelegram();
    };

    window.addEventListener("telegram-sdk-ready", handleSDKReady);

    return () => {
      window.removeEventListener("telegram-sdk-ready", handleSDKReady);
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { isTelegram, user, initData };
}

