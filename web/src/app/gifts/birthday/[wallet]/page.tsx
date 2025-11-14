"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function BirthdayGiftPage() {
  const params = useParams();
  const router = useRouter();
  const walletAddress = params.wallet as string;
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const [recipientInfo, setRecipientInfo] = useState<{ name?: string; telegramHandle?: string } | null>(null);
  const [amount, setAmount] = useState("10.00");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [giftCreated, setGiftCreated] = useState(false);
  const [claimUrl, setClaimUrl] = useState("");

  useEffect(() => {
    // Fetch recipient info by wallet address
    if (walletAddress) {
      fetch(`${API}/api/users/me?walletAddress=${encodeURIComponent(walletAddress)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            setRecipientInfo({
              name: data.user.telegramHandle ? `@${data.user.telegramHandle}` : data.user.email || "Friend",
              telegramHandle: data.user.telegramHandle,
            });
          }
        })
        .catch(() => {
          setRecipientInfo({ name: "Friend" });
        });
    }
  }, [walletAddress]);

  async function handleSendGift() {
    if (!primaryWallet?.address || !walletAddress) {
      alert("Please connect your wallet first");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API}/api/gifts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: recipientInfo?.telegramHandle ? undefined : undefined, // Will use wallet address
          recipientHandle: recipientInfo?.telegramHandle,
          amountUsdc: amount,
          message: message || `🎂 Happy Birthday!`,
          dstChain: "arc", // Always settle on Arc
          senderWalletAddress: primaryWallet.address,
        }),
      });

      const data = await res.json();
      if (res.ok && data.claimUrl) {
        setGiftCreated(true);
        setClaimUrl(data.claimUrl);
        
        // Auto-claim to recipient's wallet if it's a birthday gift
        // In this case, we can directly send to their wallet
        try {
          const claimRes = await fetch(`${data.claimUrl.replace("/claim/", "/api/gifts/claim/").replace("/gifts/birthday/", "/api/gifts/claim/")}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress }),
          });
          
          if (claimRes.ok) {
            alert(`🎉 Gift sent! ${amount} USDC has been sent to ${recipientInfo?.name || "the birthday person"} on Arc network!`);
          }
        } catch (err) {
          console.log("Auto-claim not available, gift link created");
        }
      } else {
        throw new Error(data.error || "Failed to create gift");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to send gift");
    } finally {
      setSending(false);
    }
  }

  if (giftCreated) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 text-center border-green-200 bg-green-50">
          <h2 className="text-2xl font-bold mb-4 text-green-800">🎉 Gift Sent!</h2>
          <p className="text-gray-700 mb-2">
            <span className="font-semibold">{amount} USDC</span> has been sent to {recipientInfo?.name || "the birthday person"}!
          </p>
          <p className="text-xs text-gray-600 mb-4">
            The gift will settle in their wallet on Arc network.
          </p>
          <Link href="/gifts" className="tg-button-primary text-center block text-sm">
            Send Another Gift
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-4 text-center">🎂 Send Birthday Gift</h2>

      <div className="tg-card p-6 mb-4">
        <div className="text-center mb-4">
          <p className="text-sm text-gray-700 mb-2">
            {recipientInfo?.name ? `Sending to: ${recipientInfo.name}` : "Birthday Gift Recipient"}
          </p>
          <p className="text-xs text-gray-500 font-mono break-all">
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gift Amount (USDC)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10.00"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Gift will settle on Arc network</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Birthday Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="🎂 Happy Birthday! Wishing you an amazing year ahead!"
              rows={3}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {!primaryWallet && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800 mb-2">Connect your wallet to send the gift</p>
              <Link href="/" className="tg-button-primary text-center block text-xs">
                Connect Wallet
              </Link>
            </div>
          )}

          {primaryWallet && (
            <button
              onClick={handleSendGift}
              disabled={sending || !amount || parseFloat(amount) <= 0}
              className="tg-button-primary w-full"
            >
              {sending ? "Sending Gift..." : `🎁 Send ${amount} USDC Gift`}
            </button>
          )}
        </div>
      </div>

      <Link href="/gifts" className="tg-button-secondary text-center block text-sm">
        ← Back to Gifts
      </Link>
    </div>
  );
}

