"use client";
import Link from "next/link";
// import { SwapInterface } from "../components/SwapInterface";

// Force dynamic rendering to avoid static generation issues
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <div className="text-center mb-8 pt-4">
        <h1 className="text-3xl font-bold mb-2">Gifty 🎁</h1>
        <p className="text-gray-600">Give delightful stablecoin gifts</p>
      </div>

      <div className="tg-card p-6 mb-6 text-center">
        <p className="text-gray-700 mb-6">
          The easiest way to send digital gifts to friends and family.
          Powered by USDC on Arc.
        </p>

        <div className="space-y-3">
          <Link href="/wallet" className="tg-button-primary w-full block">
            Connect / Create Wallet
          </Link>
          <Link href="/gifts?action=claim" className="tg-button-secondary w-full block">
            🎁 Claim a Gift
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Securely login with Google. No seed phrases required.
        </p>
      </div>

      <div className="mb-4 text-center">
        {/* <SwapInterface /> */}
        <p className="text-sm text-gray-500">Swap feature coming soon for Circle Wallets</p>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 pl-2">
          Features
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/birthdays" className="tg-card p-4 hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-2">🎂</div>
            <div className="text-sm font-medium">Birthdays</div>
          </Link>
          <Link href="/gifts" className="tg-card p-4 hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-2">✍️</div>
            <div className="text-sm font-medium">Send Gift</div>
          </Link>
          <Link href="/team/bulk" className="tg-card p-4 hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-2">🏢</div>
            <div className="text-sm font-medium">Bulk Send</div>
          </Link>
          <Link href="/programmable" className="tg-card p-4 hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-2">⚡</div>
            <div className="text-sm font-medium">Programmable</div>
          </Link>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 mt-8 mb-4">
        <p>Built for the Arc Hackathon</p>
      </div>
    </div>
  );
}
