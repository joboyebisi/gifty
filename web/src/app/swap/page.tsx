"use client";
import { SwapInterface } from "../../components/SwapInterface";
import Link from "next/link";

export default function SwapPage() {
  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4 text-center">💱 Swap Tokens</h2>
      <SwapInterface />
      <Link href="/wallet" className="tg-button-secondary text-center block text-sm mt-4">
        ← Back to Wallet
      </Link>
    </div>
  );
}

