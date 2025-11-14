"use client";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Link from "next/link";
import { GiftSuccessView } from "../../../../components/GiftSuccessView";

interface Gift {
  id: string;
  claimCode: string;
  amountUsdc: string;
  message?: string;
  senderUserId?: string;
  recipientHandle?: string;
  status: string;
}

export default function ClaimGiftPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const [gift, setGift] = useState<Gift | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [claimSecret, setClaimSecret] = useState("");

  const claimCode = params?.claimCode as string;
  const secretFromUrl = searchParams?.get("secret") || "";
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Auto-extract secret from URL
  useEffect(() => {
    if (secretFromUrl) {
      setClaimSecret(secretFromUrl);
    }
  }, [secretFromUrl]);

  // Auto-load gift from URL when page loads (deeplinking)
  useEffect(() => {
    if (!claimCode) {
      setError("Invalid claim code in URL");
      setLoading(false);
      return;
    }

    async function fetchGift() {
      try {
        // Build URL with secret if available
        const url = secretFromUrl
          ? `${API}/api/gifts/claim/${claimCode}?secret=${encodeURIComponent(secretFromUrl)}`
          : `${API}/api/gifts/claim/${claimCode}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (res.ok && data.gift) {
          setGift(data.gift);
          setError(null);
        } else {
          // Check if it requires a secret
          if (data.requiresSecret && !secretFromUrl) {
            setError("This gift requires a secret code. Please check the full link you received.");
          } else {
            setError(data.error || "Gift not found, already claimed, or expired");
          }
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load gift");
      } finally {
        setLoading(false);
      }
    }

    fetchGift();
  }, [claimCode, secretFromUrl, API]);

  async function handleClaim() {
    if (!primaryWallet?.address) {
      setError("Please connect your wallet first");
      return;
    }

    if (!gift) {
      setError("Gift not loaded");
      return;
    }

    // If gift requires a secret and we don't have it from URL, ask for it
    if (!claimSecret && gift.status === "pending") {
      const secret = prompt("Enter the gift secret code:");
      if (!secret) {
        setError("Secret code required to claim this gift");
        return;
      }
      setClaimSecret(secret);
      // Re-fetch gift with secret
      try {
        const res = await fetch(`${API}/api/gifts/claim/${claimCode}?secret=${encodeURIComponent(secret)}`);
        const data = await res.json();
        if (res.ok && data.gift) {
          setGift(data.gift);
        } else {
          setError(data.error || "Invalid secret code");
          return;
        }
      } catch (err: any) {
        setError("Failed to verify secret");
        return;
      }
    }

    setClaiming(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/gifts/${gift.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: primaryWallet.address,
          claimSecret: claimSecret || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        setGift({ ...gift, status: "claimed" });
      } else {
        setError(data.error || "Failed to claim gift");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to claim gift");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !gift) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <div className="tg-card p-6 text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold mb-2">Gift Not Found</h2>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          {error.includes("secret") && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-left">
              <p className="text-xs text-yellow-800">
                💡 <strong>Tip:</strong> Make sure you're using the complete link that includes the secret code. 
                The link should look like: <code className="text-xs">.../gifts/claim/CODE?secret=SECRET</code>
              </p>
            </div>
          )}
          <Link href="/" className="tg-button-primary inline-block">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return <GiftSuccessView gift={gift} walletAddress={primaryWallet?.address} />;
  }

  if (!gift) {
    return null;
  }

  const isClaimed = gift.status === "claimed";
  const needsWallet = !primaryWallet?.address;

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-8">
      <div className="tg-card p-6">
        <h2 className="text-2xl font-bold mb-4 text-center">🎁 Claim Your Gift</h2>
        
        <div className="space-y-4 mb-6">
          <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {gift.amountUsdc} USDC
            </div>
            <div className="text-xs text-gray-600">Gift Amount</div>
          </div>

          {gift.message && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-1">Message from sender:</div>
              <p className="text-sm text-gray-800 italic">"{gift.message}"</p>
            </div>
          )}

          {isClaimed && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">⚠️ This gift has already been claimed.</p>
            </div>
          )}

          {needsWallet && !isClaimed && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 mb-2">
                🔐 Please connect your wallet to claim this gift.
              </p>
              <Link href="/" className="tg-button-primary text-center block text-xs">
                Connect Wallet
              </Link>
            </div>
          )}
        </div>

        {!needsWallet && !isClaimed && (
          <div className="space-y-3">
            {!secretFromUrl && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gift Secret Code (if required)
                </label>
                <input
                  type="text"
                  value={claimSecret}
                  onChange={(e) => setClaimSecret(e.target.value)}
                  placeholder="Enter secret code"
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If the gift link included a secret, it should have been loaded automatically.
                </p>
              </div>
            )}
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="tg-button-primary w-full"
            >
              {claiming ? "Claiming..." : "🎁 Claim Gift"}
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-xs text-gray-500 hover:underline">
            ← Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

