"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Gift {
  id: string;
  claimCode: string;
  senderUserId?: string;
  recipientHandle?: string;
  recipientEmail?: string;
  amountUsdc: string;
  srcChain: string;
  dstChain: string;
  message?: string;
  status: "pending" | "claimed" | "expired";
  expiresAt?: string;
  createdAt: string;
  transferStatus?: string;
}

export default function ClaimPage() {
  const params = useParams();
  const code = params.code as string;
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const [gift, setGift] = useState<Gift | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"intro" | "wallet-setup" | "connect" | "claim" | "complete" | null>(null);
  const [walletInstalled, setWalletInstalled] = useState(false);
  const [secret, setSecret] = useState("");
  const [requiresSecret, setRequiresSecret] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);

  // Check if wallet is installed
  useEffect(() => {
    if (typeof window !== "undefined") {
      setWalletInstalled(!!(window as any).ethereum);
    }
  }, []);

  // Check for secret in URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSecret = urlParams.get("secret");
      if (urlSecret) {
        setSecret(urlSecret);
      }
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    
    // Check if we have secret from URL
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const urlSecret = urlParams?.get("secret") || "";
    
    fetch(`${API}/api/gifts/claim/${code}${urlSecret ? `?secret=${encodeURIComponent(urlSecret)}` : ""}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            const errorText = res.statusText || "Gift not found, already claimed, or invalid secret";
            setError(errorText);
            // Check if it's a secret error
            res.json().then((data) => {
              if (data?.error?.includes("secret")) {
                setRequiresSecret(true);
              }
            }).catch(() => {});
          } else {
            setError("Failed to load gift");
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.gift) {
          setGift(data.gift);
          setRequiresSecret(data.requiresSecret || false);
          // If user is not connected, show onboarding for new users
          if (!isConnected && !requiresSecret) {
            setOnboardingStep("intro");
          }
        } else if (data?.requiresSecret) {
          setRequiresSecret(true);
        }
      })
      .catch(() => {
        setError("Failed to load gift");
      })
      .finally(() => setLoading(false));
  }, [code, isConnected, requiresSecret]);

  // Auto-advance onboarding when wallet connects
  useEffect(() => {
    if (isConnected && onboardingStep === "connect") {
      setOnboardingStep("claim");
    }
  }, [isConnected, onboardingStep]);

  async function verifySecret() {
    if (!secret.trim()) {
      setSecretError("Please enter the secret code");
      return false;
    }
    
    setSecretError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/gifts/claim/${code}?secret=${encodeURIComponent(secret)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.gift) {
          setGift(data.gift);
          setRequiresSecret(false);
          setLoading(false);
          return true;
        }
      }
      setSecretError("Invalid secret code. Please try again.");
      setLoading(false);
      return false;
    } catch (err) {
      setSecretError("Failed to verify secret. Please try again.");
      setLoading(false);
      return false;
    }
  }

  async function handleClaim() {
    if (!address || !gift) return;
    if (requiresSecret && !secret.trim()) {
      setSecretError("Secret code is required to claim this gift");
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/gifts/claim/${code}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, secret: secret || undefined }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to execute claim");
      }
      const data = await res.json();
      setClaimed(true);
      setOnboardingStep("complete");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setClaiming(false);
    }
  }

  // Onboarding flow for new users
  if (onboardingStep === "intro") {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold mb-2">🎁 You've Received a Gift!</h2>
          <p className="text-sm text-gray-600">
            {gift?.amountUsdc} USDC is waiting for you
          </p>
        </div>

        <div className="tg-card p-6 mb-4">
          <h3 className="text-lg font-semibold mb-3">What is USDC?</h3>
          <p className="text-sm text-gray-700 mb-4">
            USDC is a digital currency (cryptocurrency) that's worth $1 USD. It's like digital dollars that work on blockchain networks.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-800">
              <strong>💡 Why blockchain?</strong> It's secure, fast, and works anywhere in the world without banks.
            </p>
          </div>
        </div>

        <div className="tg-card p-6 mb-4">
          <h3 className="text-lg font-semibold mb-3">How to Claim Your Gift</h3>
          <ol className="text-sm text-gray-700 space-y-3 list-decimal list-inside">
            <li>Set up a digital wallet (like a digital bank account)</li>
            <li>Connect your wallet to this app</li>
            <li>Claim your {gift?.amountUsdc} USDC gift</li>
            <li>Your gift will be sent to your wallet!</li>
          </ol>
        </div>

        <div className="tg-card p-4 bg-green-50 border-green-200">
          <p className="text-xs text-green-800 mb-2">
            <strong>✅ Safe & Secure:</strong> We'll never ask for your password or seed phrase. Your wallet stays private.
          </p>
        </div>

        <button
          onClick={() => setOnboardingStep("wallet-setup")}
          className="tg-button-primary w-full mt-4"
        >
          Get Started →
        </button>
      </div>
    );
  }

  if (onboardingStep === "wallet-setup") {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Set Up Your Wallet</h2>
          <button onClick={() => setOnboardingStep("intro")} className="text-sm text-gray-600">← Back</button>
        </div>

        <div className="tg-card p-6 mb-4">
          <h3 className="text-lg font-semibold mb-4">Choose MetaMask (Recommended)</h3>
          
          {!walletInstalled ? (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 mb-3">
                  <strong>Step 1:</strong> Install MetaMask extension
                </p>
                <a
                  href="https://metamask.io/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tg-button-primary text-center block text-sm"
                >
                  📥 Install MetaMask
                </a>
              </div>

              <div className="space-y-3 text-sm text-gray-700 mb-4">
                <p><strong>After installing:</strong></p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Click the MetaMask icon in your browser</li>
                  <li>Create a new wallet or import an existing one</li>
                  <li>Write down your recovery phrase (keep it secret!)</li>
                  <li>Come back here and click "I've Installed MetaMask"</li>
                </ol>
              </div>

              <button
                onClick={() => {
                  // Check again if wallet is now installed
                  if ((window as any).ethereum) {
                    setWalletInstalled(true);
                  } else {
                    alert("Please install MetaMask first. After installing, refresh this page.");
                  }
                }}
                className="tg-button-secondary w-full"
              >
                I've Installed MetaMask
              </button>
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-green-800 mb-2">
                  ✅ MetaMask detected! Now let's connect it.
                </p>
              </div>

              <div className="space-y-3 text-sm text-gray-700 mb-4">
                <p><strong>What happens when you connect:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>MetaMask will ask you to approve the connection</li>
                  <li>You'll see your wallet address (like a bank account number)</li>
                  <li>No money will be moved - we're just connecting</li>
                </ul>
              </div>

              <button
                onClick={() => setOnboardingStep("connect")}
                className="tg-button-primary w-full"
              >
                Connect MetaMask →
              </button>
            </>
          )}
        </div>

        <div className="tg-card p-4 bg-gray-50">
          <p className="text-xs text-gray-600">
            <strong>💡 Tip:</strong> MetaMask is like a digital wallet for cryptocurrencies. It's free, secure, and works on all major browsers.
          </p>
        </div>
      </div>
    );
  }

  if (onboardingStep === "connect") {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Connect Your Wallet</h2>
          <button onClick={() => setOnboardingStep("wallet-setup")} className="text-sm text-gray-600">← Back</button>
        </div>

        <div className="tg-card p-6 mb-4">
          <h3 className="text-lg font-semibold mb-4">Connect MetaMask</h3>
          
          {!isConnected ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 mb-2">
                  Click the button below to connect your MetaMask wallet.
                </p>
                <p className="text-xs text-blue-700">
                  MetaMask will open a popup asking you to approve the connection.
                </p>
              </div>

              <button
                onClick={() => connect({ connector: injected() })}
                disabled={isConnecting}
                className="tg-button-primary w-full"
              >
                {isConnecting ? "Connecting..." : "🔗 Connect MetaMask"}
              </button>

              <div className="mt-4 space-y-2 text-xs text-gray-600">
                <p><strong>What to expect:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>MetaMask popup will appear</li>
                  <li>Click "Next" then "Connect"</li>
                  <li>You'll be redirected back here automatically</li>
                </ul>
              </div>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 mb-2">
                ✅ Wallet Connected!
              </p>
              <p className="text-xs text-green-700 font-mono break-all">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
              <button
                onClick={() => setOnboardingStep("claim")}
                className="tg-button-primary w-full mt-4"
              >
                Continue to Claim →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (onboardingStep === "complete") {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 text-center border-green-200 bg-green-50">
          <h2 className="text-3xl font-bold mb-4 text-green-800">🎉 Gift Claimed!</h2>
          <p className="text-gray-700 mb-2">
            <span className="font-semibold">{gift?.amountUsdc} USDC</span> is being transferred to your wallet.
          </p>
          <p className="text-xs text-gray-600 mb-4">
            The transfer may take a few minutes. Check your MetaMask wallet to see your USDC balance.
          </p>
          
          {gift?.message && (
            <div className="bg-white rounded-lg p-4 mb-4 text-left">
              <p className="text-sm text-gray-700 italic">"{gift.message}"</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-left">
            <h3 className="text-sm font-semibold mb-2">What's Next?</h3>
            <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
              <li>Your USDC will appear in MetaMask within a few minutes</li>
              <li>You can send it to others, swap it, or hold it</li>
              <li>Check your wallet balance in MetaMask</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Link href="/gifts" className="tg-button-secondary text-center flex-1 text-sm">
              Send a Gift
            </Link>
            <Link href="/" className="tg-button-primary text-center flex-1 text-sm">
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Standard claim flow for users with wallets
  if (loading) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 text-center">
          <p className="text-gray-600">Loading gift...</p>
        </div>
      </div>
    );
  }

  if (error && !gift) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 border-red-200 bg-red-50">
          <h2 className="text-xl font-bold mb-4 text-red-800">❌ {error}</h2>
          <Link href="/gifts" className="tg-button-primary text-center block">← Try Again</Link>
        </div>
      </div>
    );
  }

  if (!gift) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6">
          <p className="text-gray-600 mb-4">Gift not found</p>
          <Link href="/gifts" className="tg-button-primary text-center block">← Go Back</Link>
        </div>
      </div>
    );
  }

  if (claimed || gift.status === "claimed") {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 text-center border-green-200 bg-green-50">
          <h2 className="text-2xl font-bold mb-4 text-green-800">🎉 Gift Claimed!</h2>
          <p className="text-gray-700 mb-2">
            <span className="font-semibold">{gift.amountUsdc} USDC</span> has been claimed to your wallet.
          </p>
          <p className="text-xs text-gray-600 mb-4">The transfer may take a few minutes to complete.</p>
          <Link href="/" className="tg-button-primary text-center block">← Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-4 text-center">🎁 Claim Your Gift</h2>
      
      <div className="tg-card p-4 mb-4">
        <div className="space-y-4">
          <div>
            <span className="text-sm text-gray-600">Amount</span>
            <p className="text-2xl font-bold text-green-600">{gift.amountUsdc} USDC</p>
          </div>
          {gift.message && (
            <div>
              <span className="text-sm text-gray-600">Message</span>
              <p className="text-gray-800 text-sm">{gift.message}</p>
            </div>
          )}
          {gift.recipientHandle && (
            <div>
              <span className="text-sm text-gray-600">Recipient</span>
              <p className="text-gray-800 text-sm">@{gift.recipientHandle}</p>
            </div>
          )}
          {gift.expiresAt && (
            <div>
              <span className="text-sm text-gray-600">Expires</span>
              <p className="text-gray-800 text-sm">{new Date(gift.expiresAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="tg-card p-4 mb-4 border-yellow-200 bg-yellow-50">
          <p className="text-yellow-800 mb-2 text-sm">Connect your wallet to claim this gift.</p>
          <button
            onClick={() => {
              // Show onboarding for new users, or direct connect for experienced users
              if (!walletInstalled) {
                setOnboardingStep("intro");
              } else {
                connect({ connector: injected() });
              }
            }}
            className="tg-button-primary text-center block w-full text-sm"
          >
            {walletInstalled ? "Connect Wallet" : "Get Started (New to Crypto?)"}
          </button>
        </div>
      ) : (
        <div className="tg-card p-4 mb-4">
          <p className="text-xs text-gray-500 mb-2">Connected wallet</p>
          <p className="font-mono text-xs mb-4 break-all text-gray-900">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
          {requiresSecret && !secret && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-yellow-800 mb-2">🔐 Secret code required</p>
              <input
                type="text"
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setSecretError(null);
                }}
                placeholder="Enter secret code"
                className="w-full p-2 border border-yellow-300 rounded-lg text-sm mb-2"
              />
              {secretError && <p className="text-xs text-red-600 mb-2">{secretError}</p>}
              <button
                onClick={verifySecret}
                disabled={loading || !secret.trim()}
                className="tg-button-secondary w-full text-xs"
              >
                {loading ? "Verifying..." : "Verify Secret"}
              </button>
            </div>
          )}
          <button 
            className="tg-button-primary w-full" 
            onClick={handleClaim} 
            disabled={claiming || (requiresSecret && !secret.trim())}
          >
            {claiming ? "Claiming..." : `🎁 Claim ${gift.amountUsdc} USDC`}
          </button>
        </div>
      )}

      {error && (
        <div className="tg-card p-4 mb-4 border-red-200 bg-red-50">
          <p className="text-red-800 text-xs">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <Link href="/gifts" className="tg-button-secondary text-center flex-1 text-sm">← Send/Claim</Link>
        <Link href="/" className="tg-button-secondary text-center flex-1 text-sm">Home</Link>
      </div>
    </div>
  );
}
