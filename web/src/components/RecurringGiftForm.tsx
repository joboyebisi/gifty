"use client";
import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { parseEther, encodeFunctionData } from "viem";

interface RecurringGiftFormData {
  scheduleId: string;
  recipientAddress: string;
  amountUsdc: string;
  interval: string; // "daily" | "weekly" | "monthly" | "custom"
  customIntervalDays?: number;
  startDate: string;
  endDate?: string;
  maxPayments?: number;
  message?: string;
}

const INTERVAL_SECONDS = {
  daily: 86400,
  weekly: 604800,
  monthly: 2592000, // 30 days
};

export function RecurringGiftForm({ onSuccess }: { onSuccess?: () => void }) {
  const { primaryWallet } = useDynamicContext();
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<RecurringGiftFormData>({
    scheduleId: "",
    recipientAddress: "",
    amountUsdc: "",
    interval: "monthly",
    startDate: new Date().toISOString().split("T")[0],
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryWallet || !walletClient) {
      setError("Please connect your wallet");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Calculate interval in seconds
      let intervalSeconds = INTERVAL_SECONDS[formData.interval as keyof typeof INTERVAL_SECONDS];
      if (formData.interval === "custom" && formData.customIntervalDays) {
        intervalSeconds = formData.customIntervalDays * 86400;
      }

      // Convert dates to Unix timestamps
      const startTime = Math.floor(new Date(formData.startDate).getTime() / 1000);
      const endTime = formData.endDate 
        ? Math.floor(new Date(formData.endDate).getTime() / 1000)
        : undefined;

      // Call backend API to get transaction data
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/api/smart-contracts/recurring-gift/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: formData.scheduleId || `recurring-${Date.now()}`,
          recipientAddress: formData.recipientAddress,
          amountUsdc: formData.amountUsdc,
          interval: intervalSeconds,
          startTime: startTime * 1000, // Backend expects milliseconds
          endTime: endTime ? endTime * 1000 : undefined,
          maxPayments: formData.maxPayments ? parseInt(formData.maxPayments.toString()) : undefined,
          message: formData.message,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create recurring gift");
      }

      const { transactionData, contractAddress } = await response.json();

      // Send transaction
      const hash = await walletClient.sendTransaction({
        to: contractAddress as `0x${string}`,
        data: transactionData as `0x${string}`,
        value: parseEther(formData.amountUsdc),
      });

      console.log("Transaction sent:", hash);
      alert(`Recurring gift created! Transaction: ${hash}`);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error creating recurring gift:", err);
      setError(err.message || "Failed to create recurring gift");
    } finally {
      setLoading(false);
    }
  };

  if (!primaryWallet) {
    return (
      <div className="tg-card p-6">
        <p className="text-sm text-gray-600 text-center">
          Connect your wallet to create recurring gifts
        </p>
      </div>
    );
  }

  return (
    <div className="tg-card p-6">
      <h2 className="text-xl font-bold mb-4">🔄 Create Recurring Gift</h2>
      <p className="text-sm text-gray-600 mb-4">
        Set up automatic recurring payments (monthly allowance, weekly payments, etc.)
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Recipient Address</label>
          <input
            type="text"
            required
            value={formData.recipientAddress}
            onChange={(e) => setFormData({ ...formData, recipientAddress: e.target.value })}
            placeholder="0x..."
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Amount (USDC)</label>
          <input
            type="number"
            step="0.01"
            required
            value={formData.amountUsdc}
            onChange={(e) => setFormData({ ...formData, amountUsdc: e.target.value })}
            placeholder="100"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Payment Interval</label>
          <select
            value={formData.interval}
            onChange={(e) => setFormData({ ...formData, interval: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom (days)</option>
          </select>
        </div>

        {formData.interval === "custom" && (
          <div>
            <label className="block text-sm font-medium mb-1">Days Between Payments</label>
            <input
              type="number"
              min="1"
              required
              value={formData.customIntervalDays || ""}
              onChange={(e) => setFormData({ ...formData, customIntervalDays: parseInt(e.target.value) })}
              placeholder="30"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Start Date</label>
          <input
            type="date"
            required
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">End Date (Optional)</label>
          <input
            type="date"
            value={formData.endDate || ""}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Payments (Optional)</label>
          <input
            type="number"
            min="1"
            value={formData.maxPayments || ""}
            onChange={(e) => setFormData({ ...formData, maxPayments: parseInt(e.target.value) || undefined })}
            placeholder="12"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message (Optional)</label>
          <textarea
            value={formData.message || ""}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Happy monthly allowance!"
            rows={3}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="tg-button-primary w-full"
        >
          {loading ? "Creating..." : "Create Recurring Gift"}
        </button>
      </form>
    </div>
  );
}

