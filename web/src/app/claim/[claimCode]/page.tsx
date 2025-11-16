"use client";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Link from "next/link";
import confetti from "canvas-confetti";
import { createCircleSmartAccountFromDynamic } from "../../../lib/circle-smart-account";

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
  const { primaryWallet, user: dynamicUser, setShowAuthFlow } = useDynamicContext();
  const [gift, setGift] = useState<Gift | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [claimSecret, setClaimSecret] = useState("");
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [sendingThankYou, setSendingThankYou] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  const confettiTriggered = useRef(false);

  const claimCode = params?.claimCode as string;
  const secretFromUrl = searchParams?.get("secret") || "";
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Extract secret from URL
  useEffect(() => {
    if (secretFromUrl) {
      setClaimSecret(secretFromUrl);
    }
  }, [secretFromUrl]);

  // Check if user needs onboarding when they land on claim page
  useEffect(() => {
    if (!claimCode || onboardingChecked) return;

    // If user is not authenticated, they need to onboard
    if (!dynamicUser || !primaryWallet?.address) {
      setNeedsOnboarding(true);
      setOnboardingChecked(true);
      // Show auth flow to create account
      setTimeout(() => {
        setShowAuthFlow(true);
      }, 500); // Small delay to let page render
    } else {
      // User is authenticated, create account in backend if needed
      const createAccount = async () => {
        try {
          const queryParams = new URLSearchParams({
            walletAddress: primaryWallet.address,
          });
          
          // Auto-create account by fetching user (will create if doesn't exist)
          await fetch(`${API}/api/users/me?${queryParams.toString()}`);
          console.log("✅ Account ready for gift claiming");
        } catch (err) {
          console.error("Failed to sync account:", err);
        }
      };
      
      createAccount();
      setOnboardingChecked(true);
    }
  }, [claimCode, dynamicUser, primaryWallet?.address, setShowAuthFlow, API, onboardingChecked]);

  // Reset onboarding state when wallet connects (user completed onboarding)
  useEffect(() => {
    if (primaryWallet?.address && needsOnboarding) {
      console.log("✅ Wallet connected, resetting onboarding state");
      setNeedsOnboarding(false);
      
      // Create backend account when wallet connects
      const createAccount = async () => {
        try {
          const queryParams = new URLSearchParams({
            walletAddress: primaryWallet.address,
          });
          await fetch(`${API}/api/users/me?${queryParams.toString()}`);
          console.log("✅ Account ready for gift claiming");
        } catch (err) {
          console.error("Failed to sync account:", err);
        }
      };
      
      createAccount();
      
      // Ensure gift loads if it hasn't yet (force reload)
      if (!gift && claimCode) {
        setLoading(true);
        // Gift will load via the other useEffect, but we ensure it triggers
      }
    }
  }, [primaryWallet?.address, needsOnboarding, gift, claimCode, API]);

  // Load gift details
  useEffect(() => {
    if (!claimCode || !onboardingChecked) return;

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
  }, [claimCode, secretFromUrl, API, onboardingChecked]);

  // Load Circle Smart Account address when wallet is connected
  useEffect(() => {
    if (!primaryWallet?.address || smartAccountAddress) return;

    const loadSmartAccount = async () => {
      try {
        // Wait a bit for Dynamic wallet to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // We need to get the wallet client from Dynamic
        if (primaryWallet && typeof (primaryWallet as any).getWalletClient === 'function') {
          const walletClient = await (primaryWallet as any).getWalletClient();
          if (walletClient) {
            console.log("🔄 Creating Smart Account for claiming...");
            const smartAccount = await createCircleSmartAccountFromDynamic(walletClient);
            const address = await smartAccount.getAddress();
            setSmartAccountAddress(address);
            console.log("✅ Smart Account loaded for claiming:", address);
          } else {
            console.warn("⚠️ Wallet client not available yet");
          }
        } else {
          console.warn("⚠️ getWalletClient not available on primaryWallet");
        }
      } catch (err: any) {
        console.warn("⚠️ Could not load Smart Account (will use primary wallet):", err.message);
        // Don't set error state - gracefully fall back to primary wallet
      }
    };

    loadSmartAccount();
  }, [primaryWallet?.address, smartAccountAddress]);

  async function handleClaim() {
    if (!primaryWallet?.address) {
      setError("Please connect your wallet first");
      setShowAuthFlow(true);
      return;
    }

    if (!gift) {
      setError("Gift not loaded. Please wait or refresh the page.");
      return;
    }

    if (gift.status === "claimed") {
      setError("This gift has already been claimed.");
      return;
    }

    if (gift.status === "expired") {
      setError("This gift has expired.");
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
      // Use Smart Account address if available, otherwise primary wallet
      const recipientWallet = smartAccountAddress || primaryWallet.address;
      const walletType = smartAccountAddress ? "Smart Account (Gasless)" : "Primary Wallet";
      
      console.log(`🎁 Claiming gift to ${walletType}: ${recipientWallet}`);
      
      const res = await fetch(`${API}/api/gifts/claim/${claimCode}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: recipientWallet, // Use Smart Account for gasless claiming if available
          secret: claimSecret || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        setGift({ ...gift, status: "claimed" });
        
        // Log success details for debugging
        console.log("✅ Gift claimed successfully:", {
          transferId: data.transfer?.id,
          wallet: recipientWallet,
          walletType,
          amount: gift.amountUsdc,
        });
        
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
        const errorMsg = data.error || "Failed to claim gift";
        console.error("❌ Claim failed:", errorMsg, data);
        setError(errorMsg);
        
        // Provide helpful error messages
        if (errorMsg.includes("already claimed")) {
          setGift({ ...gift, status: "claimed" });
        } else if (errorMsg.includes("expired")) {
          setGift({ ...gift, status: "expired" });
        } else if (errorMsg.includes("insufficient") || errorMsg.includes("balance")) {
          setError(`${errorMsg}. Please contact the sender.`);
        } else if (errorMsg.includes("escrow")) {
          setError(`${errorMsg}. The gift may not be funded yet.`);
        }
      }
    } catch (err: any) {
      console.error("❌ Claim error:", err);
      const errorMsg = err?.message || "Failed to claim gift. Please try again.";
      setError(errorMsg);
      
      // Network errors
      if (err.message?.includes("fetch") || err.message?.includes("network")) {
        setError("Network error. Please check your connection and try again.");
      }
    } finally {
      setClaiming(false);
    }
  }

  // Show onboarding prompt if user needs to connect wallet
  // Only show if we haven't loaded the gift yet (to avoid blocking after wallet connects)
  if (needsOnboarding && !primaryWallet?.address && !gift) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <div className="tg-card p-6 text-center">
          <div className="text-6xl mb-4">🎁</div>
          <h2 className="text-2xl font-bold mb-4">You Have a Gift to Claim!</h2>
          <p className="text-sm text-gray-600 mb-6">
            To claim your gift, you'll need a wallet. We'll help you create one in just a few seconds.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setShowAuthFlow(true);
              }}
              className="tg-button-primary w-full"
            >
              Create Wallet & Claim Gift
            </button>
            <p className="text-xs text-gray-500">
              Your gift will be safe and you can always access it with your wallet
            </p>
          </div>
        </div>
      </div>
    );
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
            The funds have been transferred to your {smartAccountAddress ? "Smart Account (Gasless)" : "wallet"}: {(smartAccountAddress || primaryWallet?.address)?.slice(0, 6)}...{(smartAccountAddress || primaryWallet?.address)?.slice(-4)}
          </p>
          {smartAccountAddress && (
            <p className="text-xs text-green-600 mb-2">
              ✅ Claimed via Smart Account - No gas fees!
            </p>
          )}
          
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
              <button
                onClick={() => setShowAuthFlow(true)}
                className="tg-button-primary w-full text-xs"
              >
                Connect Wallet
              </button>
            </div>
          )}
          
          {primaryWallet?.address && smartAccountAddress && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-800 mb-1">
                ✅ Wallet Connected
              </p>
              <p className="text-xs text-green-700">
                Primary: {primaryWallet.address.slice(0, 6)}...{primaryWallet.address.slice(-4)}
              </p>
              <p className="text-xs text-green-700">
                Smart Account: {smartAccountAddress.slice(0, 6)}...{smartAccountAddress.slice(-4)} (Gasless)
              </p>
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

