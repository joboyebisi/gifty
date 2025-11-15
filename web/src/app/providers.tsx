"use client";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { arcTestnet, arcMainnet, sepoliaTestnet } from "../config/chains";

const queryClient = new QueryClient();

// Wagmi config for Arc network and Ethereum Sepolia (for CCTP testing)
// Configure Wagmi to not conflict with Dynamic SDK's ethereum injection
const wagmiConfig = createConfig({
  chains: [sepoliaTestnet, arcTestnet, arcMainnet],
  transports: {
    [sepoliaTestnet.id]: http("https://rpc.sepolia.org"), // Ethereum Sepolia RPC
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"), // Official Arc Testnet RPC
    // arcMainnet.id is same as arcTestnet.id currently, so transport is already configured above
  },
  // Prevent conflicts with Dynamic SDK's ethereum injection
  ssr: false,
  syncConnectedChain: false,
});

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Prevent ethereum property redefinition errors
    // Check if ethereum is already defined and make it configurable
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        // Make the property configurable to prevent redefinition errors
        const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
        if (descriptor && !descriptor.configurable) {
          Object.defineProperty(window, 'ethereum', {
            ...descriptor,
            configurable: true,
            writable: true,
          });
        }
      } catch (e) {
        // Ignore if we can't modify it
        console.warn("Could not make ethereum property configurable:", e);
      }
    }
  }, []);

  useEffect(() => {
    // Load Telegram WebApp SDK if in Telegram
    if (typeof window !== "undefined") {
      // Check if script already exists
      const existingScript = document.querySelector('script[src="https://telegram.org/js/telegram-web-app.js"]');
      if (existingScript) {
        return; // Script already loaded
      }

      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.async = true;
      
      script.onload = () => {
        console.log("✅ Telegram WebApp SDK loaded");
        // Dispatch custom event when SDK is ready
        window.dispatchEvent(new Event("telegram-sdk-ready"));
      };
      
      script.onerror = () => {
        console.error("❌ Failed to load Telegram WebApp SDK");
      };
      
      document.head.appendChild(script);
    }
  }, []);

  const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const circleClientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
  const circleClientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL;

  // If Dynamic environment ID is not set, show error message but don't crash
  if (!dynamicEnvironmentId) {
    console.error("❌ NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set. Please set it in your .env.local file.");
    // Return a fallback provider that shows an error message
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg m-4">
        <h2 className="text-red-800 font-bold mb-2">Configuration Error</h2>
        <p className="text-red-700 text-sm">
          NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set. Please add it to your .env.local file.
        </p>
        <p className="text-red-600 text-xs mt-2">
          Get your Dynamic Environment ID from: <a href="https://app.dynamic.xyz/dashboard" target="_blank" rel="noopener noreferrer" className="underline">Dynamic Dashboard</a>
        </p>
      </div>
    );
  }

  // Warn if Circle Client Key is not set (for Circle Smart Accounts)
  if (!circleClientKey) {
    console.warn("⚠️ NEXT_PUBLIC_CIRCLE_CLIENT_KEY is not set. Circle Smart Accounts (gasless transactions) will not be available.");
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
        // Configure to use Arc as primary chain
        appName: "Gifty",
        appLogoUrl: "https://gifty-peach.vercel.app/logo.png",
        // Override default chain to Arc
        overrides: {
          evmNetworks: [
            {
              chainId: arcTestnet.id,
              networkId: arcTestnet.id, // For EVM networks, networkId equals chainId
              chainName: arcTestnet.name,
              name: arcTestnet.name,
              nativeCurrency: {
                name: arcTestnet.nativeCurrency.name,
                symbol: arcTestnet.nativeCurrency.symbol,
                decimals: arcTestnet.nativeCurrency.decimals,
              },
              rpcUrls: [...arcTestnet.rpcUrls.default.http],
              blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
              iconUrls: [], // Optional: add chain icon URLs if available
            },
            {
              chainId: arcMainnet.id,
              networkId: arcMainnet.id, // For EVM networks, networkId equals chainId
              chainName: arcMainnet.name,
              name: arcMainnet.name,
              nativeCurrency: {
                name: arcMainnet.nativeCurrency.name,
                symbol: arcMainnet.nativeCurrency.symbol,
                decimals: arcMainnet.nativeCurrency.decimals,
              },
              rpcUrls: [...arcMainnet.rpcUrls.default.http],
              blockExplorerUrls: [arcMainnet.blockExplorers.default.url],
              iconUrls: [], // Optional: add chain icon URLs if available
            },
          ],
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}
