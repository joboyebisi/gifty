"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useAccount } from "wagmi";
import Link from "next/link";

interface BulkGift {
  id: string;
  bulkGiftCode: string;
  companyName?: string;
  senderName: string;
  giftType: "goody" | "usdc" | "mixed";
  message?: string;
  recipients: Array<{
    id: string;
    firstName: string;
    lastName?: string;
    email?: string;
    status: string;
  }>;
}

interface Recipient {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  status: string;
  claimCode?: string;
  goodyOrderId?: string;
}

export default function TeamClaimPage() {
  const params = useParams();
  const code = params.code as string;
  const { primaryWallet } = useDynamicContext();
  const { address, isConnected } = useAccount();
  const [bulkGift, setBulkGift] = useState<BulkGift | null>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [step, setStep] = useState<"lookup" | "found" | "claiming" | "success">("lookup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    if (code) {
      fetchBulkGift();
    }
  }, [code]);

  async function fetchBulkGift() {
    try {
      const res = await fetch(`${API}/api/bulk-gifts/${code}`);
      const data = await res.json();
      if (res.ok) {
        setBulkGift(data.bulkGift);
      } else {
        setError(data.error || "Bulk gift not found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load bulk gift");
    }
  }

  async function findRecipient() {
    if (!email && !phoneNumber) {
      setError("Please enter your email or phone number");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/bulk-gifts/${code}/find-recipient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phoneNumber }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Recipient not found");
        return;
      }

      setRecipient(data.recipient);
      setStep("found");
    } catch (err: any) {
      setError(err.message || "Failed to find recipient");
    } finally {
      setLoading(false);
    }
  }

  async function claimGift() {
    if (!isConnected || !address) {
      setError("Please connect your wallet first");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/bulk-gifts/${code}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phoneNumber,
          walletAddress: address,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to claim gift");
        return;
      }

      setStep("success");
    } catch (err: any) {
      setError(err.message || "Failed to claim gift");
    } finally {
      setLoading(false);
    }
  }

  if (!bulkGift && !error) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !bulkGift) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-8">
        <div className="tg-card p-6 text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">Gift Not Found</h2>
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <Link href="/" className="tg-button-primary inline-block">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-8">
      {step === "lookup" && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-6xl mb-4">🎁</div>
            <h2 className="text-2xl font-bold mb-2">You Have a Gift!</h2>
            {bulkGift?.companyName && (
              <p className="text-sm text-gray-600 mb-1">
                From <strong>{bulkGift.companyName}</strong>
              </p>
            )}
            <p className="text-sm text-gray-600">
              {bulkGift?.senderName} has sent you a holiday gift
            </p>
          </div>

          <div className="tg-card p-6">
            <h3 className="font-semibold mb-4">Claim Your Gift</h3>
            <p className="text-xs text-gray-600 mb-4">
              Enter your email or phone number to find your gift
            </p>

            <div className="space-y-3">
              <input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border rounded"
              />
              <div className="text-center text-sm text-gray-500">OR</div>
              <input
                type="tel"
                placeholder="Your phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full p-3 border rounded"
              />
            </div>

            {error && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            <button
              onClick={findRecipient}
              disabled={loading}
              className="tg-button-primary w-full mt-4"
            >
              {loading ? "Looking up..." : "Find My Gift"}
            </button>
          </div>
        </div>
      )}

      {step === "found" && recipient && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">Found Your Gift!</h2>
            <p className="text-sm text-gray-600">
              Hello, {recipient.firstName} {recipient.lastName || ""}
            </p>
          </div>

          <div className="tg-card p-6">
            <div className="space-y-4">
              {bulkGift?.message && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">{bulkGift.message}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Gift Type:</span>
                  <span className="font-semibold">
                    {bulkGift?.giftType === "usdc" && "💰 USDC"}
                    {bulkGift?.giftType === "goody" && "🎁 Physical Gift"}
                    {bulkGift?.giftType === "mixed" && "🎁 Mixed Gift"}
                  </span>
                </div>
                {bulkGift?.giftType === "usdc" && bulkGift && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-semibold">
                      {(parseFloat(bulkGift.recipients[0]?.email || "0") / 1000000).toFixed(2)} USDC
                    </span>
                  </div>
                )}
              </div>

              {!isConnected && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 mb-2">
                    Connect your wallet to claim your gift
                  </p>
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  {error}
                </div>
              )}

              <button
                onClick={claimGift}
                disabled={loading || !isConnected}
                className="tg-button-primary w-full"
              >
                {loading ? "Claiming..." : "Claim My Gift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-4">
          <div className="tg-card p-6 text-center">
            <div className="text-6xl mb-4">🎊</div>
            <h2 className="text-2xl font-bold mb-2">Gift Claimed!</h2>
            <p className="text-sm text-gray-700 mb-4">
              Your gift has been successfully claimed!
            </p>
            {bulkGift?.giftType === "usdc" && (
              <p className="text-sm text-green-600 font-semibold">
                Funds have been transferred to your wallet
              </p>
            )}
            {bulkGift?.giftType === "goody" && (
              <p className="text-sm text-green-600 font-semibold">
                Your physical gift will be shipped soon!
              </p>
            )}
          </div>

          <Link href="/" className="tg-button-primary w-full text-center block">
            Go Home
          </Link>
        </div>
      )}
    </div>
  );
}

