import Link from "next/link";
import { DynamicWallet } from "../components/DynamicWallet";
import { SwapInterface } from "../components/SwapInterface";
import { DeFiAgentPanel } from "../components/DeFiAgent";

export default function HomePage() {
  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4 md:py-8">
      <div className="text-center mb-8 relative z-10">
        <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 bg-clip-text text-transparent drop-shadow-lg">
          🎁 Gifty
        </h1>
        <p className="text-sm text-gray-700 font-medium">Send delightful stablecoin-powered gifts to your family and friends, home and abroad</p>
      </div>
      
      <nav className="flex flex-col gap-3 mb-6 md:flex-row md:gap-4 md:justify-center">
        <Link href="/birthdays" className="tg-button-secondary text-center transform hover:scale-105 transition-transform">
          🎂 Birthdays
        </Link>
        <Link href="/gifts" className="tg-button-primary text-center transform hover:scale-105 transition-transform">
          🎁 Send or Claim Gifts
        </Link>
        <Link href="/compose" className="tg-button-secondary text-center transform hover:scale-105 transition-transform">
          ✍️ Compose
        </Link>
        <Link href="/team/bulk" className="tg-button-secondary text-center transform hover:scale-105 transition-transform">
          🏢 Bulk Gifts
        </Link>
        <Link href="/programmable" className="tg-button-secondary text-center transform hover:scale-105 transition-transform">
          ⚡ Programmable
        </Link>
      </nav>
      
      <div className="tg-card p-6 mb-4">
        <DynamicWallet />
      </div>

      <div className="mb-4">
        <SwapInterface />
      </div>

      <div className="mb-4">
        <DeFiAgentPanel />
      </div>
      
      <div className="tg-card p-6">
        <p className="text-sm text-gray-700 text-center leading-relaxed">
          Send delightful stablecoin-powered gifts to your family and friends, home and abroad. All swaps settle on Arc using USDC via CCTP.
        </p>
      </div>
      
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-400">Powered by Circle CCTP, Dynamic & Arc Network</p>
      </div>
    </div>
  );
}
