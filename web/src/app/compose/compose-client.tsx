"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ComposePageClient() {
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const recipientsParam = searchParams.get("recipients");
  const [recipients, setRecipients] = useState(recipientsParam || "");
  const [snippets, setSnippets] = useState("They love sci-fi\nShipping features fast 🚀");
  const [persona, setPersona] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("10.00");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recipientsParam) {
      setRecipients(recipientsParam);
    }
  }, [recipientsParam]);

  async function generatePersona() {
    setLoading(true);
    setMessages([]);
    setError(null);
    try {
      const res = await fetch(`${API}/api/ai/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippets: snippets.split("\n").filter(Boolean),
          stats: { emojisPer100: 4.2, topics: "sci-fi, shipping" },
          locale: "en",
          provider: "gemini",
          recipientHandle: "alex",
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to generate persona" }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPersona(data.persona || "");
    } catch (err: any) {
      console.error("Error generating persona:", err);
      setError(err?.message || "Failed to generate persona. Please check your API keys.");
    } finally {
      setLoading(false);
    }
  }

  async function generateMessages() {
    if (!persona) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/ai/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          relationship: { senderName: "Deborah", recipientHandle: "alex", relationship: "coworker" },
          constraints: { tone: "heartfelt", maxChars: 220, variants: 2, locale: "en" },
          provider: "groq",
          giftId: "demo-gift-1",
          recipientHandle: "alex",
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to generate messages" }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("Error generating messages:", err);
      setError(err?.message || "Failed to generate messages. Please check your API keys.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-4 text-center">✍️ Compose a Gift Message</h2>
      {error && (
        <div className="tg-card p-3 mb-4 bg-red-50 border border-red-200">
          <p className="text-xs text-red-800">⚠️ {error}</p>
        </div>
      )}
      <div className="tg-card p-4 mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">Snippets about recipient</label>
        <textarea className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" rows={5} value={snippets} onChange={(e) => setSnippets(e.target.value)} />
        <div className="flex flex-col gap-2 mt-4">
          <button className="tg-button-primary text-sm" onClick={generatePersona} disabled={loading}>Generate Persona</button>
          <button className="tg-button-secondary text-sm" onClick={generateMessages} disabled={!persona || loading}>Generate Messages</button>
        </div>
      </div>
      {persona && (
        <div className="tg-card p-4 mb-4">
          <strong className="text-sm font-semibold block mb-2">Persona</strong>
          <p className="text-xs text-gray-700">{persona}</p>
        </div>
      )}
      {messages.length > 0 && (
        <div className="tg-card p-4 mb-4">
          <strong className="text-sm font-semibold block mb-2">Message Variants</strong>
          <ul className="space-y-2 mb-4">
            {messages.map((m: string, i: number) => (
              <li
                key={i}
                className={`py-2 border-b last:border-0 text-xs cursor-pointer rounded p-2 ${
                  selectedMessage === m ? "bg-blue-50 border-blue-300" : "text-gray-700"
                }`}
                onClick={() => setSelectedMessage(m)}
              >
                {m}
              </li>
            ))}
          </ul>
          {selectedMessage && (
            <div className="border-t pt-4">
              <label className="block text-xs font-medium text-gray-700 mb-2">Recipients (comma-separated)</label>
              <input
                type="text"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="@username or email"
                className="w-full p-2 border border-gray-300 rounded-lg text-xs mb-2"
              />
              <label className="block text-xs font-medium text-gray-700 mb-2">Amount (USDC)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg text-xs mb-4"
              />
              {!isConnected && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-yellow-800 mb-2">Connect your wallet to fund the escrow</p>
                  <Link href="/" className="tg-button-primary text-center block text-xs">Connect Wallet</Link>
                </div>
              )}
              <button
                onClick={async () => {
                  if (!isConnected || !address) {
                    alert("Please connect your wallet first to fund the escrow");
                    return;
                  }
                  if (!recipients || !amount || parseFloat(amount) <= 0) {
                    alert("Please enter recipients and amount");
                    return;
                  }
                  setSending(true);
                  try {
                    const res = await fetch(`${API}/api/gifts/create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        recipientHandle: recipients.split(",")[0],
                        amountUsdc: amount,
                        message: selectedMessage,
                        senderWalletAddress: address, // Required for escrow funding
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.claimUrl) {
                      alert(`Gift created and escrowed! Share this link: ${data.claimUrl}\n\nFunds are locked in escrow and ready to claim.`);
                    } else {
                      alert(data.error || "Failed to create gift");
                    }
                  } catch (err: any) {
                    alert(err?.message || "Failed to create gift");
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={sending || !isConnected}
                className="tg-button-primary w-full text-sm"
              >
                {sending ? "Creating & Escrowing..." : "🎁 Create Gift & Escrow"}
              </button>
            </div>
          )}
        </div>
      )}

      <Link href="/" className="tg-button-secondary text-center block text-sm">← Go home</Link>
    </div>
  );
}

