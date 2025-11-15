"use client";
import { useState } from "react";
import { RecurringGiftForm } from "../../components/RecurringGiftForm";
import { MultiSigGiftForm } from "../../components/MultiSigGiftForm";
import Link from "next/link";

type TabType = "recurring" | "multisig" | "status";

export default function ProgrammableGiftsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("recurring");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="tg-viewport max-w-md mx-auto px-4 py-4 md:py-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">⚡ Programmable Gifts</h1>
        <p className="text-sm text-gray-600">
          Advanced gift features beyond basic transfers
        </p>
      </div>

      <div className="mb-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to Home
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab("recurring")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "recurring"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600"
          }`}
        >
          🔄 Recurring
        </button>
        <button
          onClick={() => setActiveTab("multisig")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "multisig"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600"
          }`}
        >
          ✍️ Multi-Sig
        </button>
        <button
          onClick={() => setActiveTab("status")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "status"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600"
          }`}
        >
          📊 Status
        </button>
      </div>

      {/* Content */}
      {activeTab === "recurring" && (
        <div>
          <RecurringGiftForm key={refreshKey} onSuccess={handleSuccess} />
          <div className="mt-4 tg-card p-4 bg-blue-50">
            <h3 className="font-semibold mb-2">💡 Use Cases:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Monthly allowance for family members</li>
              <li>• Weekly payments for services</li>
              <li>• Recurring gifts for special occasions</li>
              <li>• Automated payroll for contractors</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "multisig" && (
        <div>
          <MultiSigGiftForm key={refreshKey} onSuccess={handleSuccess} />
          <div className="mt-4 tg-card p-4 bg-purple-50">
            <h3 className="font-semibold mb-2">💡 Use Cases:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Corporate team gifts (requires manager approval)</li>
              <li>• Family group gifts (requires multiple family members)</li>
              <li>• DAO treasury gifts (requires governance approval)</li>
              <li>• High-value gifts (requires multiple signatures)</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "status" && (
        <div className="tg-card p-6">
          <h2 className="text-xl font-bold mb-4">📊 Gift Status Dashboard</h2>
          <p className="text-sm text-gray-600 mb-4">
            View status of your programmable gifts
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Status dashboard coming soon. Check your gifts on-chain using the contract addresses.
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold mb-2">Contract Addresses:</h3>
              <p className="text-xs font-mono break-all">
                Check your .env.local for contract addresses after deployment.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

