"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useTelegram } from "../../../hooks/useTelegram";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Birthday {
  id: string;
  telegramHandle?: string;
  email?: string;
  month: number;
  day: number;
  year?: number;
  createdAt: string;
}

export default function AddBirthdayPage() {
  const router = useRouter();
  const { primaryWallet, user: dynamicUser } = useDynamicContext();
  const { isTelegram, user: tgUser } = useTelegram();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBirthday, setCreatedBirthday] = useState<Birthday | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    telegramHandle: "",
    email: "",
    phoneNumber: "",
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    year: undefined as number | undefined,
    relationship: "friend" as "friend" | "family" | "coworker" | "partner" | "acquaintance",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.name && !formData.telegramHandle && !formData.email && !formData.phoneNumber) {
      setError("Please enter a name, Telegram handle, email, or phone number");
      return;
    }

    if (!formData.month || !formData.day) {
      setError("Please enter a valid date");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/birthdays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramHandle: formData.telegramHandle.replace("@", "") || undefined,
          email: formData.email || undefined,
          phoneNumber: formData.phoneNumber || undefined,
          month: formData.month,
          day: formData.day,
          year: formData.year || undefined,
          visibility: "private", // User's own birthdays are private
        }),
      });

      const data = await res.json();

      if (res.ok && data.birthday) {
        setCreatedBirthday(data.birthday);
        // Don't redirect - show success state with CTA
      } else {
        setError(data.error || "Failed to add birthday");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to add birthday");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(month: number, day: number, year?: number): string {
    const date = new Date(year || 2024, month - 1, day);
    return date.toLocaleDateString("en-US", { 
      month: "long", 
      day: "numeric",
      ...(year ? { year: "numeric" } : {})
    });
  }

  function getBirthdayName(): string {
    if (formData.name) return formData.name;
    if (formData.telegramHandle) return `@${formData.telegramHandle}`;
    if (formData.email) return formData.email;
    return "Friend";
  }

  // Show success state with CTA
  if (createdBirthday) {
    const birthdayName = getBirthdayName();
    const recipientHandle = formData.telegramHandle || formData.email || "";
    
    return (
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="tg-card p-6 text-center mb-4">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold mb-2">Birthday Added!</h2>
          <div className="text-sm text-gray-700 mb-4">
            <p className="font-semibold">{birthdayName}</p>
            <p className="text-gray-600">
              {formatDate(createdBirthday.month, createdBirthday.day, createdBirthday.year)}
            </p>
          </div>
        </div>

        <div className="tg-card p-4 mb-4 bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-900 mb-3">
            <strong>🎁 Send a gift to {birthdayName}?</strong>
          </p>
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (recipientHandle) params.set("recipients", recipientHandle);
              if (formData.email) params.set("recipients", formData.email);
              if (formData.phoneNumber) params.set("phoneNumber", formData.phoneNumber);
              params.set("from", "birthday");
              params.set("birthdayId", createdBirthday.id);
              params.set("name", birthdayName);
              router.push(`/gifts?${params.toString()}`);
            }}
            className="tg-button-primary w-full text-sm"
          >
            🎁 Send Gift to {birthdayName}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => router.push("/birthdays")}
            className="tg-button-secondary flex-1 text-sm"
          >
            ← Back to Birthdays
          </button>
          <button
            onClick={() => {
              setCreatedBirthday(null);
              setFormData({
                name: "",
                telegramHandle: "",
                email: "",
                phoneNumber: "",
                month: new Date().getMonth() + 1,
                day: new Date().getDate(),
                year: undefined,
                relationship: "friend",
              });
            }}
            className="tg-button-secondary flex-1 text-sm"
          >
            ➕ Add Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4">
      <h2 className="text-2xl font-bold mb-4 text-center">➕ Add Birthday</h2>

      {error && (
        <div className="tg-card p-3 mb-4 bg-red-50 border border-red-200">
          <p className="text-xs text-red-800">⚠️ {error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="tg-card p-4 mb-4">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Telegram Handle (optional)
            </label>
            <input
              type="text"
              value={formData.telegramHandle}
              onChange={(e) => setFormData({ ...formData, telegramHandle: e.target.value })}
              placeholder="@username"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Email (optional)
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Phone Number (optional)
            </label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              placeholder="+1234567890"
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Month *
              </label>
              <select
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                required
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2024, m - 1, 1).toLocaleDateString("en-US", { month: "short" })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Day *
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={formData.day}
                onChange={(e) => setFormData({ ...formData, day: parseInt(e.target.value) })}
                className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Year (optional)
              </label>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                value={formData.year || ""}
                onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="YYYY"
                className="w-full p-3 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Relationship (optional)
            </label>
            <select
              value={formData.relationship}
              onChange={(e) => setFormData({ ...formData, relationship: e.target.value as any })}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm"
            >
              <option value="friend">Friend</option>
              <option value="family">Family</option>
              <option value="coworker">Coworker</option>
              <option value="partner">Partner</option>
              <option value="acquaintance">Acquaintance</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="submit"
            disabled={saving}
            className="tg-button-primary flex-1 text-sm"
          >
            {saving ? "Saving..." : "💾 Save Birthday"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="tg-button-secondary flex-1 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>

      <Link href="/birthdays" className="tg-button-secondary text-center block text-sm">
        ← Back to Birthdays
      </Link>
    </div>
  );
}

