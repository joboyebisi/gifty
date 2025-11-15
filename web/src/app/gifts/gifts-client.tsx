"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

// Native share utility
async function shareGift(claimUrl: string, claimCode: string, recipientHandle?: string, recipientEmail?: string, recipientPhone?: string) {
  const shareText = `🎁 You've received a gift!\n\nClaim it here: ${claimUrl}\n\nOr use claim code: ${claimCode}`;
  
  // Try native Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({
        title: "You've received a gift!",
        text: shareText,
        url: claimUrl,
      });
      return true;
    } catch (err) {
      // User cancelled or error - fall through to manual options
    }
  }
  
  // Fallback: Show share options
  const shareOptions: string[] = [];
  
  if (recipientHandle) {
    shareOptions.push(`Telegram: https://t.me/share/url?url=${encodeURIComponent(claimUrl)}&text=${encodeURIComponent(shareText)}`);
  }
  if (recipientEmail) {
    shareOptions.push(`Email: mailto:${recipientEmail}?subject=You've received a gift!&body=${encodeURIComponent(shareText)}`);
  }
  if (recipientPhone) {
    shareOptions.push(`SMS: sms:${recipientPhone}?body=${encodeURIComponent(shareText)}`);
    shareOptions.push(`WhatsApp: https://wa.me/${recipientPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(shareText)}`);
  }
  
  // Copy to clipboard as fallback
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(claimUrl);
    alert(`✅ Gift link copied to clipboard!\n\n${shareOptions.length > 0 ? `Or share via:\n${shareOptions.join("\n")}` : ""}`);
  } else {
    prompt("Copy this gift link:", claimUrl);
  }
  
  return false;
}

// Component that uses useSearchParams - must be wrapped in Suspense
export default function GiftsPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const isConnected = !!primaryWallet && !!dynamicUser;
  const [action, setAction] = useState<"choose" | "send" | "bulk" | "claim" | "programmable">("choose");

  // Auto-navigate based on URL parameters from bot
  useEffect(() => {
    const recipients = searchParams.get("recipients");
    const amount = searchParams.get("amount");
    const from = searchParams.get("from");
    
    if (from === "bot" && recipients) {
      // Bot is directing user to send gift
      setAction("send");
    }
  }, [searchParams]);

  if (action === "send") {
    return <SendGiftFlow onBack={() => setAction("choose")} />;
  }

  if (action === "bulk") {
    return <BulkGiftFlow onBack={() => setAction("choose")} />;
  }

  if (action === "claim") {
    return <ClaimGiftFlow onBack={() => setAction("choose")} />;
  }

  if (action === "programmable") {
    // Redirect to programmable page
    router.push("/programmable");
    return null;
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-6 text-center">🎁 Send or Claim Gifts</h2>
      
      <div className="space-y-4 mb-6">
        <div className="tg-card p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Send a Gift</h3>
          <p className="text-sm text-gray-600 mb-4">
            Create a personalized gift with AI-generated messages. Funds are locked in escrow until claimed.
          </p>
          <button
            onClick={() => setAction("send")}
            className="tg-button-primary w-full"
          >
            ✍️ Send Gift
          </button>
        </div>

        <div className="tg-card p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">🏢 Send Bulk Gifts</h3>
          <p className="text-sm text-gray-600 mb-4">
            Send gifts to your entire team! Perfect for HR, CEOs, and companies. Support for USDC, Goody physical gifts, or both.
          </p>
          <button
            onClick={() => setAction("bulk")}
            className="tg-button-secondary w-full"
          >
            🏢 Bulk Gifts
          </button>
        </div>

        <div className="tg-card p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">⚡ Programmable Gifts</h3>
          <p className="text-sm text-gray-600 mb-4">
            Create advanced programmable gifts: recurring payments, multi-signature approvals, conditional releases, and more.
          </p>
          <button
            onClick={() => setAction("programmable")}
            className="tg-button-secondary w-full"
          >
            ⚡ Programmable
          </button>
        </div>

        <div className="tg-card p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Claim a Gift</h3>
          <p className="text-sm text-gray-600 mb-4">
            Received a gift link? Enter your claim code to receive your USDC gift.
          </p>
          <button
            onClick={() => setAction("claim")}
            className="tg-button-secondary w-full"
          >
            🎁 Claim Gift
          </button>
        </div>
      </div>

      <Link href="/" className="tg-button-secondary text-center block text-sm">← Go home</Link>
    </div>
  );
}

// Send Gift Flow Component
function SendGiftFlow({ onBack }: { onBack: () => void }) {
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const searchParams = useSearchParams();
  const address = primaryWallet?.address;
  const isConnected = !!primaryWallet && !!dynamicUser;
  const [step, setStep] = useState<"recipient" | "amount" | "message" | "chains" | "review">("recipient");
  const [formData, setFormData] = useState({
    recipientHandle: "",
    recipientEmail: "",
    recipientPhone: "",
    amount: "10.00",
    message: "",
    srcChain: "ethereum",
    dstChain: "arc",
    snippets: "",
  });
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [selectedMessage, setSelectedMessage] = useState("");
  const [giftCreated, setGiftCreated] = useState(false);
  const [claimUrl, setClaimUrl] = useState("");
  const [claimCode, setClaimCode] = useState("");

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Prefill from URL params (from birthday page or other sources)
  useEffect(() => {
    const recipients = searchParams.get("recipients");
    const name = searchParams.get("name");
    const phoneNumber = searchParams.get("phoneNumber");
    
    if (recipients) {
      // Check if it's an email or telegram handle
      if (recipients.includes("@") && !recipients.startsWith("@")) {
        setFormData(prev => ({ ...prev, recipientEmail: recipients }));
      } else {
        setFormData(prev => ({ ...prev, recipientHandle: recipients.replace("@", "") }));
      }
    }
    if (phoneNumber) {
      setFormData(prev => ({ ...prev, recipientPhone: phoneNumber }));
    }
  }, [searchParams]);

  async function generatePersona() {
    if (!formData.snippets.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/ai/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippets: formData.snippets.split("\n").filter(Boolean),
          stats: {},
          locale: "en",
          provider: "gemini",
          recipientHandle: formData.recipientHandle || undefined,
        }),
      });
      const data = await res.json();
      setPersona(data.persona || "");
    } finally {
      setLoading(false);
    }
  }

  async function generateMessages() {
    if (!persona) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/ai/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          relationship: {
            senderName: "You",
            recipientHandle: formData.recipientHandle || "friend",
            relationship: "friend",
          },
          constraints: {
            tone: "heartfelt",
            maxChars: 220,
            variants: 3,
            locale: "en",
          },
          provider: "gemini",
        }),
      });
      const data = await res.json();
      setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  }

  async function createGift() {
    if (!isConnected || !address) {
      alert("Please connect your wallet first");
      return;
    }
    if (!formData.recipientHandle && !formData.recipientEmail) {
      alert("Please provide recipient handle or email");
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/gifts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientHandle: formData.recipientHandle || undefined,
          recipientEmail: formData.recipientEmail || undefined,
          amountUsdc: formData.amount,
          srcChain: formData.srcChain,
          dstChain: formData.dstChain,
          message: selectedMessage || formData.message,
          senderWalletAddress: address,
          expiresInDays: 90,
        }),
      });
      const data = await res.json();
      if (res.ok && data.claimUrl) {
        setClaimUrl(data.claimUrl);
        setClaimCode(data.claimCode || "");
        setGiftCreated(true);
        // Auto-trigger share
        await shareGift(
          data.claimUrl,
          data.claimCode || "",
          formData.recipientHandle,
          formData.recipientEmail,
          formData.recipientPhone
        );
      } else {
        alert(data.error || "Failed to create gift");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to create gift");
    } finally {
      setLoading(false);
    }
  }

  // Show success state after gift creation
  if (giftCreated && claimUrl) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 text-center mb-4">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-xl font-bold mb-2">Gift Created!</h2>
          <p className="text-sm text-gray-700 mb-4">
            Your gift is ready to share. The recipient can claim it using the link below.
          </p>
          <div className="bg-gray-50 p-3 rounded-lg mb-4">
            <div className="text-xs text-gray-600 mb-1">Claim Code:</div>
            <div className="font-mono text-sm font-semibold">{claimCode}</div>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg mb-4">
            <div className="text-xs text-blue-600 mb-1">Share Link:</div>
            <div className="font-mono text-xs break-all">{claimUrl}</div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => shareGift(claimUrl, claimCode, formData.recipientHandle, formData.recipientEmail, formData.recipientPhone)}
              className="tg-button-primary w-full"
            >
              📤 Share Gift Again
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(claimUrl);
                alert("✅ Link copied to clipboard!");
              }}
              className="tg-button-secondary w-full"
            >
              📋 Copy Link
            </button>
            <button onClick={onBack} className="tg-button-secondary w-full">
              ← Back to Gifts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">✍️ Send Gift</h2>
        <button onClick={onBack} className="text-sm text-gray-600 hover:underline">← Back</button>
      </div>

      {step === "recipient" && (
        <div className="tg-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Telegram Handle (optional)
            </label>
            <input
              type="text"
              value={formData.recipientHandle}
              onChange={(e) => setFormData({ ...formData, recipientHandle: e.target.value })}
              placeholder="@username"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Email (optional)
            </label>
            <input
              type="email"
              value={formData.recipientEmail}
              onChange={(e) => setFormData({ ...formData, recipientEmail: e.target.value })}
              placeholder="friend@example.com"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Phone Number (optional)
            </label>
            <input
              type="tel"
              value={formData.recipientPhone}
              onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
              placeholder="+1234567890"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <p className="text-xs text-gray-500">
            Provide at least one way to identify the recipient. We'll use this to notify them.
          </p>
          <button
            onClick={() => {
              if (!formData.recipientHandle && !formData.recipientEmail) {
                alert("Please provide at least recipient handle or email");
                return;
              }
              setStep("amount");
            }}
            className="tg-button-primary w-full"
          >
            Next: Amount
          </button>
        </div>
      )}

      {step === "amount" && (
        <div className="tg-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gift Amount (USDC)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
              placeholder="10.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Chain (where funds come from)
            </label>
            <select
              value={formData.srcChain}
              onChange={(e) => setFormData({ ...formData, srcChain: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            >
              <option value="ethereum">Ethereum (Sepolia)</option>
              <option value="arc">Arc Testnet</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Destination Chain (where recipient receives)
            </label>
            <select
              value={formData.dstChain}
              onChange={(e) => setFormData({ ...formData, dstChain: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            >
              <option value="arc">Arc Testnet</option>
              <option value="ethereum">Ethereum (Sepolia)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("recipient")} className="tg-button-secondary flex-1">
              ← Back
            </button>
            <button onClick={() => setStep("message")} className="tg-button-primary flex-1">
              Next: Message
            </button>
          </div>
        </div>
      )}

      {step === "message" && (
        <div className="tg-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tell us about the recipient (for AI message generation)
            </label>
            <textarea
              value={formData.snippets}
              onChange={(e) => setFormData({ ...formData, snippets: e.target.value })}
              placeholder="They love sci-fi movies...&#10;Always shipping features fast...&#10;Loves coffee ☕"
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={generatePersona}
              disabled={loading || !formData.snippets.trim()}
              className="tg-button-secondary w-full mt-2 text-sm"
            >
              {loading ? "Generating..." : "Generate Persona"}
            </button>
          </div>

          {persona && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-700 mb-2">
                <strong>Persona:</strong> {persona}
              </p>
              <button
                onClick={generateMessages}
                disabled={loading}
                className="tg-button-secondary w-full text-sm"
              >
                {loading ? "Generating..." : "Generate Message Options"}
              </button>
            </div>
          )}

          {messages.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Choose a message (or write your own)
              </label>
              <div className="space-y-2 mb-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`p-3 border rounded-lg cursor-pointer text-sm ${
                      selectedMessage === m ? "border-pink-500 bg-pink-50" : "border-gray-200"
                    }`}
                    onClick={() => setSelectedMessage(m)}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Or write your own message
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => {
                setFormData({ ...formData, message: e.target.value });
                setSelectedMessage("");
              }}
              placeholder="Write a personal message..."
              rows={3}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep("amount")} className="tg-button-secondary flex-1">
              ← Back
            </button>
            <button
              onClick={() => setStep("review")}
              disabled={!selectedMessage && !formData.message.trim()}
              className="tg-button-primary flex-1"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="tg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold mb-4">Review Your Gift</h3>
          
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-600">Recipient:</span>
              <p className="font-medium">
                {formData.recipientHandle ? `@${formData.recipientHandle}` : formData.recipientEmail || "Not specified"}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Amount:</span>
              <p className="font-medium text-green-600">{formData.amount} USDC</p>
            </div>
            <div>
              <span className="text-gray-600">Chains:</span>
              <p className="font-medium">{formData.srcChain} → {formData.dstChain}</p>
            </div>
            <div>
              <span className="text-gray-600">Message:</span>
              <p className="font-medium">{selectedMessage || formData.message}</p>
            </div>
          </div>

          {!isConnected && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800 mb-2">Connect your wallet to fund the escrow</p>
              <Link href="/" className="tg-button-primary text-center block text-xs">Connect Wallet</Link>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep("message")} className="tg-button-secondary flex-1">
              ← Back
            </button>
            <button
              onClick={createGift}
              disabled={loading || !isConnected}
              className="tg-button-primary flex-1"
            >
              {loading ? "Creating & Escrowing..." : "🎁 Create Gift"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Claim Gift Flow Component
function ClaimGiftFlow({ onBack }: { onBack: () => void }) {
  const [claimCode, setClaimCode] = useState("");
  const [loading, setLoading] = useState(false);

  function handleClaim() {
    if (!claimCode.trim()) {
      alert("Please enter a claim code");
      return;
    }
    window.location.href = `/claim/${claimCode.trim()}`;
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">🎁 Claim Gift</h2>
        <button onClick={onBack} className="text-sm text-gray-600 hover:underline">← Back</button>
      </div>

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

      <div className="tg-card p-4 bg-gray-50">
        <p className="text-xs text-gray-600 text-center mb-2">
          Received a gift link? Paste the claim code here or click the link directly.
        </p>
        <p className="text-xs text-gray-500 text-center">
          If you received a link in Telegram or email, it will open automatically.
        </p>
      </div>
    </div>
  );
}

// Bulk Gift Flow Component - Redirects to dedicated bulk page
function BulkGiftFlow({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to dedicated bulk gift page
    router.push("/team/bulk");
  }, [router]);

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <div className="tg-card p-6 text-center">
        <p className="text-sm text-gray-700 mb-4">Redirecting to bulk gifts page...</p>
        <button onClick={onBack} className="tg-button-secondary w-full">
          ← Back
        </button>
      </div>
    </div>
  );
}
