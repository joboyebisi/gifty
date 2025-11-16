"use client";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Link from "next/link";
import confetti from "canvas-confetti";

interface Gift {
  id: string;
  claimCode: string;
  amountUsdc: string;
  message?: string;
  senderUserId?: string;
  recipientHandle?: string;
  status: string;
}

export default function ClaimPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const [gift, setGift] = useState<Gift | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [claimSecret, setClaimSecret] = useState("");
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [sendingThankYou, setSendingThankYou] = useState(false);
  const confettiTriggered = useRef(false);

  const claimCode = params?.claimCode as string;
  const secretFromUrl = searchParams?.get("secret") || "";
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    if (secretFromUrl) {
      setClaimSecret(secretFromUrl);
    }
  }, [secretFromUrl]);

  useEffect(() => {
    if (!claimCode) {
      setError("Invalid claim code");
      setLoading(false);
      return;
    }

    async function fetchGift() {
      try {
        const url = secretFromUrl
          ? `${API}/api/gifts/claim/${claimCode}?secret=${secretFromUrl}`
          : `${API}/api/gifts/claim/${claimCode}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (res.ok && data.gift) {
          setGift(data.gift);
        } else {
          setError(data.error || "Gift not found or already claimed");
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

    // If gift requires a secret and we don't have it, ask for it
    if (!claimSecret && gift.status === "pending") {
      const secret = prompt("Enter the gift secret code:");
      if (!secret) {
        setError("Secret code required to claim this gift");
        return;
      }
      setClaimSecret(secret);
    }

    setClaiming(true);
    setError(null);

    try {
      // Use the execute endpoint with claim code (not gift ID)
      const res = await fetch(`${API}/api/gifts/claim/${claimCode}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: primaryWallet.address,
          secret: claimSecret || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        setGift({ ...gift, status: "claimed" });
        
        // Trigger confetti animation
        if (!confettiTriggered.current) {
          confettiTriggered.current = true;
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'],
          });
          // Additional burst after delay
          setTimeout(() => {
            confetti({
              particleCount: 50,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ['#FFD700', '#FF6B6B', '#4ECDC4'],
            });
            confetti({
              particleCount: 50,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ['#FFD700', '#FF6B6B', '#4ECDC4'],
            });
          }, 250);
        }
      } else {
        setError(data.error || "Failed to claim gift");
      }
    } catch (err: any) {
      console.error("Claim error:", err);
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
          <Link href="/" className="tg-button-primary inline-block">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <div className="tg-card p-6 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2 text-green-600">Congratulations!</h2>
          <p className="text-lg font-semibold mb-2">
            You've received <span className="text-green-600">{gift?.amountUsdc} USDC</span>
          </p>
          {gift?.message && (
            <div className="bg-gray-50 rounded-lg p-4 my-4 text-left">
              <p className="text-sm text-gray-700 italic">"{gift.message}"</p>
            </div>
          )}
          <p className="text-sm text-gray-600 mb-4">
            The funds have been transferred to your wallet: {primaryWallet?.address?.slice(0, 6)}...{primaryWallet?.address?.slice(-4)}
          </p>
          
          {/* Thank You Section */}
          {!showThankYou ? (
            <div className="space-y-3 mt-4">
              <button
                onClick={() => setShowThankYou(true)}
                className="tg-button-secondary w-full"
              >
                💌 Send Thank You
              </button>
              <Link href="/" className="tg-button-primary w-full inline-block text-center">
                Go Home
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thank You Message
                </label>
                <textarea
                  value={thankYouMessage}
                  onChange={(e) => setThankYouMessage(e.target.value)}
                  placeholder="Thank you for the gift! I really appreciate it..."
                  rows={3}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional: We can generate a personalized message using AI
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    // Generate AI thank you message
                    setSendingThankYou(true);
                    try {
                      const res = await fetch(`${API}/api/ai/generate-thank-you`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          giftAmount: gift?.amountUsdc,
                          senderMessage: gift?.message,
                          recipientHandle: primaryWallet?.address,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.message) {
                        setThankYouMessage(data.message);
                      }
                    } catch (err) {
                      console.error("Failed to generate thank you:", err);
                    } finally {
                      setSendingThankYou(false);
                    }
                  }}
                  disabled={sendingThankYou}
                  className="tg-button-secondary flex-1 text-sm"
                >
                  {sendingThankYou ? "Generating..." : "✨ Generate with AI"}
                </button>
                <button
                  onClick={() => setShowThankYou(false)}
                  className="tg-button-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={async () => {
                  if (!gift?.id) return;
                  setSendingThankYou(true);
                  try {
                    const res = await fetch(`${API}/api/gifts/${gift.id}/thank-you`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        message: thankYouMessage || "Thank you for the gift!",
                        senderWalletAddress: gift.senderUserId, // This might need adjustment
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      alert("✅ Thank you message sent!");
                      setShowThankYou(false);
                    } else {
                      alert(data.error || "Failed to send thank you");
                    }
                  } catch (err: any) {
                    alert(err.message || "Failed to send thank you");
                  } finally {
                    setSendingThankYou(false);
                  }
                }}
                disabled={sendingThankYou}
                className="tg-button-primary w-full"
              >
                {sendingThankYou ? "Sending..." : "💌 Send Thank You"}
              </button>
              <Link href="/" className="tg-button-secondary w-full inline-block text-center text-sm">
                Skip & Go Home
              </Link>
            </div>
          )}
        </div>
      </div>
    );
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

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Claim Code:</span>
              <span className="font-mono text-xs">{gift.claimCode}</span>
            </div>
            {claimSecret && (
              <div className="flex justify-between">
                <span className="text-gray-600">Secret:</span>
                <span className="font-mono text-xs">{claimSecret}</span>
              </div>
            )}
          </div>

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

