"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ClaimPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const [claimCode, setClaimCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-detect claim code from URL
  useEffect(() => {
    const codeFromUrl = searchParams.get("code");
    if (codeFromUrl) {
      setClaimCode(codeFromUrl);
      // Auto-redirect if code is in URL
      setTimeout(() => {
        router.push(`/claim/${codeFromUrl}`);
      }, 500);
    }
  }, [searchParams, router]);

  // Check if user came from a claim link (e.g., /claim/abc123)
  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    if (pathParts.length === 3 && pathParts[1] === "claim" && pathParts[2] && pathParts[2] !== "demo-code") {
      // Already on a specific claim page, redirect handled by Next.js routing
      return;
    }
  }, []);

  function handleClaim() {
    if (!claimCode.trim()) {
      alert("Please enter a claim code");
      return;
    }
    router.push(`/claim/${claimCode.trim()}`);
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-4 text-center">🎁 Claim Gift</h2>

      {!isConnected && (
        <div className="tg-card p-4 mb-4 bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-800 mb-2">Connect your wallet to claim gifts</p>
          <Link href="/" className="tg-button-primary text-center block text-sm">Connect Wallet</Link>
        </div>
      )}

      <div className="tg-card p-6 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Enter Claim Code</label>
        <input
          type="text"
          value={claimCode}
          onChange={(e) => setClaimCode(e.target.value)}
          placeholder="Paste claim code or link here"
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm mb-4"
          onKeyPress={(e) => {
            if (e.key === "Enter") handleClaim();
          }}
        />
        <button onClick={handleClaim} disabled={loading} className="tg-button-primary w-full">
          {loading ? "Processing..." : "Claim Gift"}
        </button>
      </div>

      <div className="tg-card p-4 mb-4 bg-gray-50">
        <p className="text-xs text-gray-600 text-center mb-2">
          Received a gift link? Paste the claim code here or click the link directly.
        </p>
        <p className="text-xs text-gray-500 text-center">
          If you received a link in Telegram or email, it will open automatically.
        </p>
      </div>

      <Link href="/" className="tg-button-secondary text-center block text-sm">← Go home</Link>
    </div>
  );
}

