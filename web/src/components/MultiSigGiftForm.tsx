"use client";
import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { parseEther } from "viem";

interface MultiSigGiftFormData {
  proposalId: string;
  recipientAddress: string;
  amountUsdc: string;
  requiredSignatures: number;
  signers: string[];
  deadline?: string;
  message?: string;
}

export function MultiSigGiftForm({ onSuccess }: { onSuccess?: () => void }) {
  const { primaryWallet } = useDynamicContext();
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signerInput, setSignerInput] = useState("");
  const [formData, setFormData] = useState<MultiSigGiftFormData>({
    proposalId: "",
    recipientAddress: "",
    amountUsdc: "",
    requiredSignatures: 2,
    signers: [],
    message: "",
  });

  const addSigner = () => {
    if (signerInput.trim() && !formData.signers.includes(signerInput.trim())) {
      setFormData({
        ...formData,
        signers: [...formData.signers, signerInput.trim()],
      });
      setSignerInput("");
    }
  };

  const removeSigner = (index: number) => {
    setFormData({
      ...formData,
      signers: formData.signers.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryWallet || !walletClient) {
      setError("Please connect your wallet");
      return;
    }

    if (formData.signers.length < formData.requiredSignatures) {
      setError(`Need at least ${formData.requiredSignatures} signers`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call backend API to get transaction data
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/api/smart-contracts/multisig-gift/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: formData.proposalId || `multisig-${Date.now()}`,
          recipientAddress: formData.recipientAddress,
          amountUsdc: formData.amountUsdc,
          requiredSignatures: formData.requiredSignatures,
          signers: formData.signers,
          deadline: formData.deadline 
            ? Math.floor(new Date(formData.deadline).getTime() / 1000) * 1000
            : undefined,
          message: formData.message,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create multi-sig gift");
      }

      const { transactionData, contractAddress } = await response.json();

      // Send transaction
      const hash = await walletClient.sendTransaction({
        to: contractAddress as `0x${string}`,
        data: transactionData as `0x${string}`,
        value: parseEther(formData.amountUsdc),
      });

      console.log("Transaction sent:", hash);
      alert(`Multi-sig gift proposal created! Transaction: ${hash}`);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error creating multi-sig gift:", err);
      setError(err.message || "Failed to create multi-sig gift");
    } finally {
      setLoading(false);
    }
  };

  if (!primaryWallet) {
    return (
      <div className="tg-card p-6">
        <p className="text-sm text-gray-600 text-center">
          Connect your wallet to create multi-signature gifts
        </p>
      </div>
    );
  }

  return (
    <div className="tg-card p-6">
      <h2 className="text-xl font-bold mb-4">✍️ Create Multi-Signature Gift</h2>
      <p className="text-sm text-gray-600 mb-4">
        Create a gift that requires multiple signatures to approve (perfect for corporate/team gifts)
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
            placeholder="1000"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Required Signatures (e.g., 2 of 3)
          </label>
          <input
            type="number"
            min="1"
            required
            value={formData.requiredSignatures}
            onChange={(e) => setFormData({ ...formData, requiredSignatures: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Signers (Addresses)</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={signerInput}
              onChange={(e) => setSignerInput(e.target.value)}
              placeholder="0x..."
              className="flex-1 px-3 py-2 border rounded-lg"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSigner();
                }
              }}
            />
            <button
              type="button"
              onClick={addSigner}
              className="tg-button-secondary px-4"
            >
              Add
            </button>
          </div>
          <div className="space-y-2">
            {formData.signers.map((signer, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-xs font-mono">{signer.slice(0, 10)}...{signer.slice(-8)}</span>
                <button
                  type="button"
                  onClick={() => removeSigner(index)}
                  className="text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {formData.signers.length} signer(s) added (need at least {formData.requiredSignatures})
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Deadline (Optional)</label>
          <input
            type="datetime-local"
            value={formData.deadline || ""}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message (Optional)</label>
          <textarea
            value={formData.message || ""}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Team appreciation gift"
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
          disabled={loading || formData.signers.length < formData.requiredSignatures}
          className="tg-button-primary w-full"
        >
          {loading ? "Creating..." : "Create Multi-Sig Gift Proposal"}
        </button>
      </form>
    </div>
  );
}

