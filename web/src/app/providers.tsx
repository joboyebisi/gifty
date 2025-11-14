"use client";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { arcTestnet, arcMainnet } from "../config/chains";

const queryClient = new QueryClient();

// Wagmi config for Arc network (for direct blockchain interactions)
// Note: arcMainnet currently uses same ID as testnet, so we only configure testnet transport
const wagmiConfig = createConfig({
  chains: [arcTestnet, arcMainnet],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"), // Official Arc Testnet RPC
    // arcMainnet.id is same as arcTestnet.id currently, so transport is already configured above
  },
});

export function Providers({ children }: { children: ReactNode }) {
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

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
        // Configure to use Arc as primary chain
        appName: "Gifty",
        appLogoUrl: "/logo.png",
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
