import { defineChain } from "viem";

// Arc Testnet chain definition (Official: Chain ID 5042002)
export const arcTestnet = defineChain({
  id: 5042002, // Official Arc Testnet Chain ID per https://developers.circle.com/arc
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC", // USDC is the native gas token on Arc
    symbol: "USDC",
    decimals: 18, // Native USDC uses 18 decimals for gas
  },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.testnet.arc.network",
        "https://rpc.blockdaemon.testnet.arc.network",
        "https://rpc.drpc.testnet.arc.network",
        "https://rpc.quicknode.testnet.arc.network",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

// Arc Mainnet chain definition (USDC is native EVM asset)
// Note: Mainnet details TBD - using testnet for now
export const arcMainnet = defineChain({
  id: 5042002, // Using testnet ID until mainnet is available
  name: "Arc",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18, // Native USDC uses 18 decimals for gas
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"], // Update when mainnet available
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: "https://testnet.arcscan.app", // Update when mainnet available
    },
  },
  testnet: false,
});

