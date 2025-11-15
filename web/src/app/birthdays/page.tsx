"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegram } from "../../hooks/useTelegram";

// Force dynamic rendering to avoid static generation issues
export const dynamic = 'force-dynamic';

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Birthday {
  id: string;
  userId?: string;
  telegramHandle?: string;
  email?: string;
  month: number;
  day: number;
  year?: number;
  visibility: string;
  source: string;
  createdAt: string;
}

interface User {
  id: string;
  walletAddress?: string;
  telegramHandle?: string;
  email?: string;
  telegramUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function BirthdaysPage() {
  const router = useRouter();
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const { isTelegram, user: tgUser } = useTelegram();
  const address = primaryWallet?.address;
  const isConnected = !!primaryWallet && !!dynamicUser;
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState({
    telegramHandle: tgUser?.username || "",
    email: "",
    emailVerified: false,
  });
  const [saving, setSaving] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);

  useEffect(() => {
    // Auto-populate Telegram handle if in Telegram
    if (tgUser?.username && onboardingData.telegramHandle !== tgUser.username) {
      setOnboardingData((prev) => ({ ...prev, telegramHandle: tgUser.username || "" }));
    }
  }, [tgUser, onboardingData.telegramHandle]);

  async function handleSendEmailCode() {
    if (!onboardingData.email || !onboardingData.email.includes("@")) {
      alert("Please enter a valid email address");
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch(`${API}/api/email/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: onboardingData.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowEmailVerification(true);
        alert(data.message || "Verification code sent! Check your email.");
      } else {
        alert(data.error || "Failed to send code");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyEmailCode() {
    if (!emailCode || emailCode.length !== 6) {
      alert("Please enter the 6-digit code");
      return;
    }
    setVerifyingCode(true);
    try {
      const res = await fetch(`${API}/api/email/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: onboardingData.email, code: emailCode }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setOnboardingData((prev) => ({ ...prev, emailVerified: true }));
        setShowEmailVerification(false);
        alert("Email verified! ✓");
      } else {
        alert(data.error || "Invalid code");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to verify code");
    } finally {
      setVerifyingCode(false);
    }
  }

  useEffect(() => {
    if (isConnected && address) {
      // Build query params with Telegram info if available
      const queryParams = new URLSearchParams({
        walletAddress: address,
      });
      
      if (isTelegram && tgUser) {
        if (tgUser.username) {
          queryParams.set("telegramHandle", tgUser.username);
        }
        if (tgUser.id) {
          queryParams.set("telegramUserId", tgUser.id.toString());
        }
      }
      
      // Include Dynamic user email if available (for auto-verification)
      if (dynamicUser?.email) {
        queryParams.set("email", dynamicUser.email);
      }
      
      fetch(`${API}/api/users/me?${queryParams.toString()}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          setUser(data.user);
          // Only show onboarding if user exists but has no handle/email
          // (account was auto-created but needs profile completion)
          if (data.user && (!data.user.telegramHandle && !data.user.email)) {
            setShowOnboarding(true);
          } else if (!data.user) {
            // This shouldn't happen since we auto-create, but handle it
            setShowOnboarding(true);
          }
        })
        .catch((err) => {
          console.error("Error fetching user:", err);
          // Don't show onboarding on error - account might have been created
        });
    } else if (isTelegram && tgUser) {
      // In Telegram but wallet not connected - show onboarding
      setShowOnboarding(true);
    }
  }, [isConnected, address, isTelegram, tgUser, API]);

  useEffect(() => {
    if (user && (user.telegramHandle || user.email) && !showOnboarding) {
      // Fetch upcoming birthdays (next 30 days)
      const queryParams = new URLSearchParams();
      if (address) queryParams.set("walletAddress", address);
      if (user.telegramUserId) queryParams.set("userId", user.telegramUserId);
      if (user.telegramHandle) queryParams.set("telegramHandle", user.telegramHandle);
      
      fetch(`${API}/api/birthdays/upcoming?days=30&${queryParams.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setBirthdays(data.birthdays || []);
        })
        .catch((err) => {
          console.error("Error fetching birthdays:", err);
          setBirthdays([]);
        })
        .finally(() => setLoading(false));
    } else if (!showOnboarding) {
      setLoading(false);
    }
  }, [user, showOnboarding, address]);

  async function handleOnboarding() {
    if (!isConnected || !address) {
      alert("Please connect your wallet first");
      return;
    }
    
    // Telegram handle is auto-detected, so we only need email if provided
    if (!onboardingData.telegramHandle && !onboardingData.email) {
      alert("Please provide at least your Telegram handle or email");
      return;
    }

    // If email is provided but not verified, prompt verification
    if (onboardingData.email && !onboardingData.emailVerified) {
      if (!confirm("Please verify your email first. Would you like to send a verification code?")) {
        return;
      }
      await handleSendEmailCode();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          telegramHandle: onboardingData.telegramHandle.trim() || undefined,
          email: onboardingData.email.trim() || undefined,
          telegramUserId: tgUser?.id?.toString(),
          emailVerified: onboardingData.emailVerified,
        }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || `HTTP ${res.status}`);
        } catch {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
        }
      }
      
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setShowOnboarding(false);
        // Auto-fetch birthdays after onboarding
        fetch(`${API}/api/birthdays/upcoming?days=30`)
          .then((res) => res.json())
          .then((data) => {
            setBirthdays(data.birthdays || []);
            setLoading(false);
          })
          .catch(() => {
            setBirthdays([]);
            setLoading(false);
          });
      } else {
        throw new Error(data.error || "Failed to save profile");
      }
    } catch (err: any) {
      console.error("Onboarding error:", err);
      alert(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  }

  function handleCompose() {
    if (selected.size === 0) return;
    const selectedBdays = birthdays.filter((b) => selected.has(b.id));
    const handles = selectedBdays.map((b) => b.telegramHandle || b.email || "friend").join(",");
    router.push(`/compose?recipients=${handles}`);
  }

  function formatDate(month: number, day: number): string {
    const date = new Date(2024, month - 1, day);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getDaysUntil(month: number, day: number): number {
    const today = new Date();
    const thisYear = today.getFullYear();
    const bday = new Date(thisYear, month - 1, day);
    if (bday < today) {
      bday.setFullYear(thisYear + 1);
    }
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.ceil((bday.getTime() - today.getTime()) / msPerDay);
  }

  if (!isConnected) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <h2 className="text-2xl font-bold mb-4 text-center">🎂 Birthdays</h2>
        <div className="tg-card p-6 text-center">
          <p className="text-sm text-gray-700 mb-4">
            Connect your wallet to view upcoming birthdays and receive reminders.
          </p>
          <Link href="/" className="tg-button-primary text-center block">Connect Wallet</Link>
        </div>
        <Link href="/" className="tg-button-secondary text-center block text-sm mt-4">← Go home</Link>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <h2 className="text-2xl font-bold mb-4 text-center">🎂 Welcome to Gifties!</h2>
        <div className="tg-card p-6 mb-4">
          <p className="text-sm text-gray-700 mb-4 text-center">
            {isTelegram && tgUser
              ? "We detected your Telegram account. Connect your wallet and optionally add your email to get started."
              : "Connect your wallet and add your details to receive birthday reminders and notifications."}
          </p>
          
          {!isConnected && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800 mb-2">Step 1: Connect your wallet</p>
              <Link href="/" className="tg-button-primary text-center block text-sm">
                Connect Wallet
              </Link>
            </div>
          )}

          {isConnected && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Telegram Handle {isTelegram && tgUser?.username && "(auto-detected)"}
                </label>
                <input
                  type="text"
                  value={onboardingData.telegramHandle}
                  onChange={(e) => setOnboardingData({ ...onboardingData, telegramHandle: e.target.value })}
                  placeholder="@username"
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                  disabled={!!(isTelegram && tgUser?.username)}
                />
                {isTelegram && tgUser?.username && (
                  <p className="text-xs text-green-600 mt-1">✓ Detected from Telegram</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Email (optional)
                  {onboardingData.emailVerified && <span className="text-green-600 ml-2">✓ Verified</span>}
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={onboardingData.email}
                    onChange={(e) => {
                      setOnboardingData({ ...onboardingData, email: e.target.value, emailVerified: false });
                      setShowEmailVerification(false);
                    }}
                    placeholder="your@email.com"
                    className="flex-1 p-3 border border-gray-300 rounded-lg text-sm"
                    disabled={showEmailVerification}
                  />
                  {onboardingData.email && !onboardingData.emailVerified && !showEmailVerification && (
                    <button
                      onClick={handleSendEmailCode}
                      disabled={sendingCode}
                      className="tg-button-secondary text-xs px-3 whitespace-nowrap"
                    >
                      {sendingCode ? "..." : "Verify"}
                    </button>
                  )}
                </div>
                {showEmailVerification && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800 mb-2">Enter the 6-digit code sent to {onboardingData.email}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        className="flex-1 p-2 border border-blue-300 rounded-lg text-sm text-center font-mono"
                        maxLength={6}
                      />
                      <button
                        onClick={handleVerifyEmailCode}
                        disabled={verifyingCode || emailCode.length !== 6}
                        className="tg-button-primary text-xs px-4"
                      >
                        {verifyingCode ? "..." : "Submit"}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowEmailVerification(false);
                        setEmailCode("");
                      }}
                      className="text-xs text-blue-600 mt-2 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">For birthday reminders and notifications</p>
              </div>
              <button onClick={handleOnboarding} disabled={saving || (!onboardingData.telegramHandle && !onboardingData.email)} className="tg-button-primary w-full">
                {saving ? "Saving..." : "Complete Setup"}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 text-center mb-4">
          We'll use this to fetch your contacts' birthdays and send you reminders.
        </p>
        {isConnected && (
          <button 
            onClick={() => {
              setShowOnboarding(false);
              setLoading(false);
            }} 
            className="tg-button-secondary text-center block text-sm w-full"
          >
            Skip for now - I'll do this later
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-4 text-center">🎂 Upcoming Birthdays</h2>

      {selected.size > 0 && (
        <div className="tg-card p-4 mb-4 bg-blue-50 border-blue-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-blue-900">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-600 hover:underline">
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCompose} className="tg-button-primary flex-1 text-sm">
              ✍️ Compose Message
            </button>
            <button
              onClick={() => {
                const selectedBdays = birthdays.filter((b) => selected.has(b.id));
                const handles = selectedBdays.map((b) => b.telegramHandle || b.email || "friend").join(",");
                router.push(`/gifts?recipients=${handles}&from=birthdays`);
              }}
              className="tg-button-secondary flex-1 text-sm"
            >
              🎁 Send Gift
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="tg-card p-6 text-center">
          <p className="text-gray-600 text-sm">Loading birthdays...</p>
        </div>
      ) : birthdays.length === 0 ? (
        <div className="tg-card p-6 text-center">
          <p className="text-sm text-gray-500 mb-4">No upcoming birthdays found</p>
          <p className="text-xs text-gray-400 mb-4">
            {user?.telegramHandle || user?.email
              ? "Add birthdays to see them here, or we'll fetch them from your contacts."
              : "Add your Telegram handle or email in your profile to see birthdays from your contacts."}
          </p>
          <div className="flex flex-col gap-2 mb-4">
            <button 
              onClick={() => router.push("/birthdays/add")} 
              className="tg-button-primary text-sm"
            >
              ➕ Add Birthday
            </button>
            <button 
              onClick={() => router.push("/gifts")} 
              className="tg-button-secondary text-sm"
            >
              🎁 Send Gift
            </button>
          </div>
          {(!user?.telegramHandle && !user?.email) && (
            <button onClick={() => setShowOnboarding(true)} className="tg-button-secondary text-xs mb-2">
              Complete Profile (Optional)
            </button>
          )}
          <p className="text-xs text-gray-400 mt-2">You can still send gifts without completing your profile.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {birthdays.map((b) => {
            const daysUntil = getDaysUntil(b.month, b.day);
            const isSelected = selected.has(b.id);
            return (
              <div
                key={b.id}
                className={`tg-card p-4 transition-colors ${isSelected ? "bg-blue-50 border-blue-300" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {b.telegramHandle ? `@${b.telegramHandle}` : b.email || "Friend"}
                      </span>
                      {isSelected && <span className="text-blue-600 text-xs">✓</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{formatDate(b.month, b.day)}</span>
                      {daysUntil === 0 && <span className="text-orange-600 font-semibold">🎂 Today!</span>}
                      {daysUntil > 0 && daysUntil <= 7 && <span className="text-orange-500">in {daysUntil} days</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(b.id);
                      }}
                      className={`text-xs px-3 py-1 rounded ${
                        isSelected
                          ? "bg-blue-100 text-blue-700 border border-blue-300"
                          : "bg-gray-100 text-gray-700 border border-gray-300"
                      }`}
                    >
                      {isSelected ? "✓" : "Select"}
                    </button>
                  </div>
                </div>
                {/* Send Gift CTA below each birthday entry */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const handle = b.telegramHandle || b.email || "";
                      const name = b.telegramHandle ? `@${b.telegramHandle}` : b.email || "Friend";
                      router.push(`/gifts?recipients=${encodeURIComponent(handle)}&from=birthday&birthdayId=${b.id}&name=${encodeURIComponent(name)}`);
                    }}
                    className="tg-button-primary w-full text-sm"
                  >
                    🎁 Send Gift to {b.telegramHandle ? `@${b.telegramHandle}` : b.email || "Friend"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Link href="/" className="tg-button-secondary text-center flex-1 text-sm">← Home</Link>
        <Link href="/gifts" className="tg-button-primary text-center flex-1 text-sm">🎁 Claim Gift</Link>
      </div>
    </div>
  );
}
