"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { GiftOpeningAnimation, Confetti } from "./GiftOpeningAnimation";

interface Gift {
  id: string;
  amountUsdc: string;
  message?: string;
  senderUserId?: string;
}

export function GiftSuccessView({ gift, walletAddress }: { gift: Gift | null; walletAddress?: string }) {
  const [showAnimation, setShowAnimation] = useState(true);
  const [showAppreciation, setShowAppreciation] = useState(false);
  const [appreciationMessage, setAppreciationMessage] = useState("");
  const [sendingAppreciation, setSendingAppreciation] = useState(false);
  const [appreciationSent, setAppreciationSent] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  async function handleAppreciation() {
    if (!gift?.id) return;

    setSendingAppreciation(true);
    try {
      if (!walletAddress) {
        alert("Wallet address required to send appreciation");
        return;
      }

      const res = await fetch(`${API}/api/gifts/${gift.id}/appreciate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: appreciationMessage || "Thank you for the gift!",
          walletAddress,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAppreciationSent(true);
      }
    } catch (err) {
      console.error("Error sending appreciation:", err);
    } finally {
      setSendingAppreciation(false);
    }
  }

  if (showAnimation) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <Confetti />
        <div className="tg-card p-6 text-center">
          <GiftOpeningAnimation onComplete={() => setShowAnimation(false)} />
          <p className="text-sm text-gray-600 mt-4">Opening your gift...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-8">
      <Confetti />
      <div className="tg-card p-6 text-center">
        <div className="text-6xl mb-4 animate-bounce">🎉</div>
        <h2 className="text-2xl font-bold mb-2 text-green-600">Congratulations!</h2>
        <p className="text-lg font-semibold mb-2">
          You've received <span className="text-green-600 font-bold text-xl">{gift?.amountUsdc} USDC</span>
        </p>
        
        {gift?.message && (
          <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg p-4 my-4 text-left border border-pink-200">
            <div className="text-xs text-gray-600 mb-1 font-medium">💌 Message from sender:</div>
            <p className="text-sm text-gray-800 italic">"{gift.message}"</p>
          </div>
        )}

        <div className="bg-green-50 border border-green-200 rounded-lg p-3 my-4">
          <p className="text-xs text-green-800">
            ✅ Funds transferred to: <code className="text-xs">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code>
          </p>
        </div>

        {!appreciationSent && !showAppreciation && (
          <button
            onClick={() => setShowAppreciation(true)}
            className="tg-button-secondary w-full mb-3"
          >
            💝 Thank the Sender
          </button>
        )}

        {showAppreciation && !appreciationSent && (
          <div className="mt-4 space-y-3">
            <textarea
              value={appreciationMessage}
              onChange={(e) => setAppreciationMessage(e.target.value)}
              placeholder="Say thank you... (optional)"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAppreciation}
                disabled={sendingAppreciation}
                className="tg-button-primary flex-1"
              >
                {sendingAppreciation ? "Sending..." : "💝 Send Appreciation"}
              </button>
              <button
                onClick={() => setShowAppreciation(false)}
                className="tg-button-secondary"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500">
              💡 Sender will receive 10 points when you appreciate!
            </p>
          </div>
        )}

        {appreciationSent && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 my-4">
            <p className="text-sm text-green-800">✅ Thank you sent! Sender received 10 points 🎁</p>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <Link href="/" className="tg-button-primary w-full inline-block">
            🏠 Go Home
          </Link>
          <Link href="/gifts" className="text-xs text-gray-500 hover:underline block">
            Send a Gift
          </Link>
        </div>
      </div>
    </div>
  );
}

