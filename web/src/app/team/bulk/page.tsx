"use client";
import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegram } from "../../../hooks/useTelegram";
import Link from "next/link";

interface Recipient {
  firstName: string;
  lastName?: string;
  email?: string;
  telegramHandle?: string;
  phoneNumber?: string;
  country?: string;
}

export default function BulkGiftPage() {
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const { isTelegram, user: tgUser } = useTelegram();
  const [step, setStep] = useState<"info" | "analyze" | "recipients" | "gift" | "review" | "success">("info");
  const [companyName, setCompanyName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [giftType, setGiftType] = useState<"goody" | "usdc" | "mixed">("usdc");
  const [productId, setProductId] = useState("");
  const [amountUsdc, setAmountUsdc] = useState("");
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [teamClaimUrl, setTeamClaimUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [useAiSuggestions, setUseAiSuggestions] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Auto-fill sender name
  useState(() => {
    if (dynamicUser?.email) {
      setSenderName(dynamicUser.email.split("@")[0]);
    } else if (tgUser?.first_name) {
      setSenderName(tgUser.first_name);
    }
  });

  function parseRecipients(input: string): Recipient[] {
    // Support CSV format: firstName,lastName,email,telegramHandle,phoneNumber,country
    // Or one per line: firstName lastName email @handle phone country
    const lines = input.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 3) {
        // CSV format
        return {
          firstName: parts[0],
          lastName: parts[1] || undefined,
          email: parts[2] || undefined,
          telegramHandle: parts[3]?.replace("@", "") || undefined,
          phoneNumber: parts[4] || undefined,
          country: parts[5] || undefined,
        };
      } else {
        // Space-separated format
        const words = line.split(/\s+/);
        const handleMatch = words.find((w) => w.startsWith("@"));
        const emailMatch = words.find((w) => w.includes("@") && w.includes("."));
        const phoneMatch = words.find((w) => /^\+?[\d\s-]+$/.test(w));

        return {
          firstName: words[0] || "",
          lastName: words[1] || undefined,
          email: emailMatch || undefined,
          telegramHandle: handleMatch?.replace("@", "") || undefined,
          phoneNumber: phoneMatch || undefined,
          country: words[words.length - 1] || undefined,
        };
      }
    });
  }

  function addRecipients() {
    const parsed = parseRecipients(recipientInput);
    setRecipients([...recipients, ...parsed]);
    setRecipientInput("");
  }

  function removeRecipient(index: number) {
    setRecipients(recipients.filter((_, i) => i !== index));
  }

  async function analyzeTelegramGroup() {
    if (!telegramChatId) {
      alert("Please enter a Telegram chat ID");
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch(`${API}/api/ai/analyze-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: parseInt(telegramChatId),
          days: 30,
          giftType: giftType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze group");
      }

      setAiSuggestions(data.suggestions || []);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeMessages(messages: any[]) {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API}/api/ai/analyze-group-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          giftType: giftType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze messages");
      }

      setAiSuggestions(data.suggestions || []);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function createBulkGift() {
    if (!primaryWallet?.address) {
      alert("Please connect your wallet first");
      return;
    }

    if (!senderName || recipients.length === 0) {
      alert("Please fill in all required fields");
      return;
    }

    if (giftType === "goody" && !productId) {
      alert("Please select a product for Goody gifts");
      return;
    }

    if ((giftType === "usdc" || giftType === "mixed") && !amountUsdc) {
      alert("Please enter an amount for USDC gifts");
      return;
    }

    setLoading(true);
    try {
      // Get sender user ID
      const userRes = await fetch(`${API}/api/users/me?walletAddress=${primaryWallet.address}`);
      const userData = await userRes.json();
      const senderUserId = userData.user?.id || primaryWallet.address;

      const res = await fetch(`${API}/api/bulk-gifts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUserId,
          senderWalletAddress: primaryWallet.address,
          companyName: companyName || undefined,
          senderName,
          giftType,
          productId: productId || undefined,
          amountUsdc: amountUsdc || undefined,
          message: message || undefined,
          recipients,
          expiresInDays: 90,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create bulk gift");
      }

      setTeamClaimUrl(data.teamClaimUrl);
      setStep("success");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!primaryWallet?.address) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-4 text-center">🎁 Bulk Holiday Gifts</h2>
        <div className="tg-card p-6 text-center">
          <p className="text-sm text-gray-700 mb-4">
            Connect your wallet to send bulk gifts to your team.
          </p>
          <Link href="/" className="tg-button-primary inline-block">
            Connect Wallet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4 text-center">🎁 Bulk Holiday Gifts</h2>

      {step === "info" && (
        <div className="space-y-4">
          <div className="tg-card p-4">
            <h3 className="font-semibold mb-2">Company Information</h3>
            <input
              type="text"
              placeholder="Company Name (optional)"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full p-2 border rounded mb-2"
            />
            <input
              type="text"
              placeholder="Your Name *"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div className="tg-card p-4">
            <h3 className="font-semibold mb-2">Gift Type</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="usdc"
                  checked={giftType === "usdc"}
                  onChange={(e) => setGiftType(e.target.value as any)}
                  className="mr-2"
                />
                USDC (Crypto Gift)
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="goody"
                  checked={giftType === "goody"}
                  onChange={(e) => setGiftType(e.target.value as any)}
                  className="mr-2"
                />
                Goody (Physical Gift)
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="mixed"
                  checked={giftType === "mixed"}
                  onChange={(e) => setGiftType(e.target.value as any)}
                  className="mr-2"
                />
                Mixed (Both)
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <button onClick={() => setStep("analyze")} className="tg-button-secondary w-full">
              🤖 Analyze Group with AI (Recommended)
            </button>
            <button onClick={() => setStep("recipients")} className="tg-button-primary w-full">
              Next: Add Recipients Manually
            </button>
          </div>
        </div>
      )}

      {step === "analyze" && (
        <div className="space-y-4">
          <div className="tg-card p-4">
            <h3 className="font-semibold mb-2">🤖 AI Group Analysis</h3>
            <p className="text-xs text-gray-600 mb-4">
              Analyze your Telegram group messages to generate personalized gift suggestions for each team member based on their personality and communication style.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Telegram Group Chat ID (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., -1001234567890"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="w-full p-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get this from your Telegram group info, or paste messages below
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Messages (JSON format - Paste here)
              </label>
              <textarea
                placeholder='[{"from": {"id": 123, "first_name": "John", "username": "johndoe"}, "text": "Great work team!", "date": 1234567890}, ...]'
                className="w-full p-2 border rounded h-32 text-xs font-mono"
                onChange={async (e) => {
                  try {
                    const messages = JSON.parse(e.target.value);
                    if (Array.isArray(messages) && messages.length > 0) {
                      await analyzeMessages(messages);
                    }
                  } catch (err) {
                    // Invalid JSON, ignore
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste an array of message objects from your Telegram group
              </p>
            </div>

            <button
              onClick={async () => {
                if (telegramChatId) {
                  await analyzeTelegramGroup();
                } else {
                  alert("Please enter a Telegram chat ID or paste group messages in JSON format");
                }
              }}
              disabled={analyzing}
              className="tg-button-primary w-full"
            >
              {analyzing ? "🤖 Analyzing..." : "🤖 Analyze Group"}
            </button>
          </div>

          {aiSuggestions.length > 0 && (
            <div className="tg-card p-4">
              <h3 className="font-semibold mb-2">✨ AI Gift Suggestions</h3>
              <p className="text-xs text-gray-600 mb-3">
                Based on personality analysis of {aiSuggestions.length} team members
              </p>
              
              <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                {aiSuggestions.map((suggestion, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded text-sm">
                    <div className="font-medium mb-1">
                      {suggestion.username ? `@${suggestion.username}` : `User ${suggestion.userId}`}
                    </div>
                    {suggestion.suggestedAmountUsdc && (
                      <div className="text-xs text-gray-700 mb-1">
                        💰 Suggested: {suggestion.suggestedAmountUsdc.toFixed(2)} USDC
                      </div>
                    )}
                    {suggestion.suggestedProductIds && suggestion.suggestedProductIds.length > 0 && (
                      <div className="text-xs text-gray-700 mb-1">
                        🎁 {suggestion.suggestedProductIds.length} product suggestion(s)
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1 italic">
                      {suggestion.reasoning}
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex items-center mb-3 p-2 bg-blue-50 rounded">
                <input
                  type="checkbox"
                  checked={useAiSuggestions}
                  onChange={(e) => setUseAiSuggestions(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Use AI suggestions to pre-fill bulk gift</span>
              </label>

              {useAiSuggestions && (
                <button
                  onClick={() => {
                    // Convert suggestions to recipients
                    const suggestedRecipients = aiSuggestions.map((s) => ({
                      firstName: s.username || `User${s.userId}`,
                      email: undefined,
                      telegramHandle: s.username,
                      phoneNumber: undefined,
                      country: undefined,
                    }));
                    setRecipients(suggestedRecipients);
                    
                    // Set gift amounts/products based on suggestions
                    // Use average or first suggestion
                    if (aiSuggestions[0]?.suggestedAmountUsdc) {
                      const avgAmount = aiSuggestions.reduce((sum, s) => sum + (s.suggestedAmountUsdc || 0), 0) / aiSuggestions.length;
                      setAmountUsdc(avgAmount.toFixed(2));
                    }
                    if (aiSuggestions[0]?.suggestedProductIds?.[0]) {
                      setProductId(aiSuggestions[0].suggestedProductIds[0]);
                    }
                    
                    setStep("gift");
                  }}
                  className="tg-button-primary w-full mb-2"
                >
                  Apply Suggestions & Continue to Gift Configuration
                </button>
              )}

              <button
                onClick={() => setStep("recipients")}
                className="tg-button-secondary w-full text-sm"
              >
                Skip & Add Recipients Manually
              </button>
            </div>
          )}

          <button onClick={() => setStep("info")} className="tg-button-secondary w-full">
            ← Back
          </button>
        </div>
      )}

      {step === "recipients" && (
        <div className="space-y-4">
          <div className="tg-card p-4">
            <h3 className="font-semibold mb-2">Add Team Members</h3>
            <p className="text-xs text-gray-600 mb-2">
              Enter recipients (one per line or CSV format):
              <br />
              Format: firstName,lastName,email,@telegramHandle,phone,country
            </p>
            <textarea
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              placeholder="John,Doe,john@example.com,@johndoe,+1234567890,USA"
              className="w-full p-2 border rounded h-32"
            />
            <button onClick={addRecipients} className="tg-button-secondary w-full mt-2 text-sm">
              Add Recipients
            </button>
          </div>

          {recipients.length > 0 && (
            <div className="tg-card p-4">
              <h3 className="font-semibold mb-2">Recipients ({recipients.length})</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {recipients.map((r, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <div className="text-sm">
                      {r.firstName} {r.lastName}
                      {r.email && <div className="text-xs text-gray-600">{r.email}</div>}
                    </div>
                    <button
                      onClick={() => removeRecipient(i)}
                      className="text-red-500 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep("info")} className="tg-button-secondary flex-1">
              Back
            </button>
            <button
              onClick={() => setStep("gift")}
              disabled={recipients.length === 0}
              className="tg-button-primary flex-1"
            >
              Next: Configure Gift
            </button>
          </div>
        </div>
      )}

      {step === "gift" && (
        <div className="space-y-4">
          {(giftType === "usdc" || giftType === "mixed") && (
            <div className="tg-card p-4">
              <h3 className="font-semibold mb-2">USDC Amount</h3>
              <input
                type="number"
                placeholder="Amount in USDC"
                value={amountUsdc}
                onChange={(e) => setAmountUsdc(e.target.value)}
                className="w-full p-2 border rounded"
                step="0.01"
                min="0"
              />
            </div>
          )}

          {(giftType === "goody" || giftType === "mixed") && (
            <div className="tg-card p-4">
              <h3 className="font-semibold mb-2">Goody Product</h3>
              <input
                type="text"
                placeholder="Product ID (from Goody API)"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full p-2 border rounded"
              />
              <p className="text-xs text-gray-600 mt-1">
                You can browse products at Goody API or use product search
              </p>
            </div>
          )}

          <div className="tg-card p-4">
            <h3 className="font-semibold mb-2">Personal Message (Optional)</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Happy holidays! Thank you for your hard work..."
              className="w-full p-2 border rounded h-24"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep("recipients")} className="tg-button-secondary flex-1">
              Back
            </button>
            <button onClick={() => setStep("review")} className="tg-button-primary flex-1">
              Review
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="tg-card p-4">
            <h3 className="font-semibold mb-2">Review Your Bulk Gift</h3>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Company:</strong> {companyName || "N/A"}
              </div>
              <div>
                <strong>From:</strong> {senderName}
              </div>
              <div>
                <strong>Gift Type:</strong> {giftType}
              </div>
              {amountUsdc && (
                <div>
                  <strong>USDC Amount:</strong> {amountUsdc} USDC
                </div>
              )}
              {productId && (
                <div>
                  <strong>Product ID:</strong> {productId}
                </div>
              )}
              <div>
                <strong>Recipients:</strong> {recipients.length} team members
              </div>
            </div>
          </div>

          <button
            onClick={createBulkGift}
            disabled={loading}
            className="tg-button-primary w-full"
          >
            {loading ? "Creating..." : "Create Bulk Gift"}
          </button>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-4">
          <div className="tg-card p-4 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="font-semibold mb-2">Bulk Gift Created!</h3>
            <p className="text-sm text-gray-700 mb-4">
              Share this link with your team members to claim their gifts:
            </p>
            <div className="bg-gray-50 p-3 rounded mb-4">
              <code className="text-xs break-all">{teamClaimUrl}</code>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(teamClaimUrl)}
              className="tg-button-secondary w-full text-sm"
            >
              Copy Link
            </button>
          </div>

          <Link href="/" className="tg-button-primary w-full text-center block">
            Go Home
          </Link>
        </div>
      )}
    </div>
  );
}

