/**
 * Arc Network Configuration
 * Based on official Arc documentation: https://developers.circle.com/arc
 */

// Arc Testnet Configuration
export const ARC_TESTNET = {
  chainId: 5042002, // Official Arc Testnet Chain ID
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  rpcUrls: [
    "https://rpc.testnet.arc.network",
    "https://rpc.blockdaemon.testnet.arc.network",
    "https://rpc.drpc.testnet.arc.network",
    "https://rpc.quicknode.testnet.arc.network",
  ],
  websocketUrl: "wss://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  faucetUrl: "https://faucet.circle.com",
  
  // Native USDC (gas token) - 18 decimals
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18, // Native USDC uses 18 decimals for gas
  },
  
  // USDC ERC-20 Contract (optional interface) - 6 decimals
  usdcERC20Address: "0x3600000000000000000000000000000000000000",
  usdcERC20Decimals: 6, // ERC-20 USDC uses 6 decimals
  
  // EURC Contract
  eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  eurcDecimals: 6,
  
  // CCTP Contracts (Domain 26)
  cctp: {
    domain: 26, // Arc Testnet domain
    tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    tokenMinterV2: "0xb43db544E2c27092c107639Ad201b3dEfAbcF192",
    messageV2: "0xbaC0179bB358A8936169a63408C8481D582390C4",
  },
  
  // Gateway Contracts (Domain 26)
  gateway: {
    domain: 26,
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
  },
  
  // StableFX Escrow
  stablefxEscrow: "0x1f91886C7028986aD885ffCee0e40b75C9cd5aC1",
};

// Circle API Chain Name for Arc Testnet
export const ARC_CIRCLE_CHAIN_NAME = "ETH-ARC-TESTNET";

// Helper function to get USDC address (ERC-20 interface)
export function getArcUSDCAddress(): `0x${string}` {
  return ARC_TESTNET.usdcERC20Address as `0x${string}`;
}

// Helper function to get USDC decimals (use ERC-20 for transfers)
export function getArcUSDCDecimals(): number {
  return ARC_TESTNET.usdcERC20Decimals; // Use 6 decimals for ERC-20 transfers
}

// Helper function to get CCTP domain
export function getArcCCTPDomain(): number {
  return ARC_TESTNET.cctp.domain;
}

