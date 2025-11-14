"use client";
import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useWalletClient } from "wagmi";
import { DeFiAgent, AgentAction } from "../lib/agent/defi-agent";
import { SwapService } from "../lib/defi/swap";
import { arcTestnet, arcMainnet } from "../config/chains";

export function DeFiAgentPanel() {
  const { primaryWallet } = useDynamicContext();
  const { data: wagmiWalletClient } = useWalletClient();
  const [agent, setAgent] = useState<DeFiAgent | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  useEffect(() => {
    if (primaryWallet?.address) {
      // Ensure chainId is a number
      const chainId = typeof primaryWallet.chain === 'number' 
        ? primaryWallet.chain 
        : (typeof primaryWallet.chain === 'string' 
          ? parseInt(primaryWallet.chain, 10) 
          : arcTestnet.id);
      const newAgent = new DeFiAgent(primaryWallet.address as `0x${string}`, chainId);
      setAgent(newAgent);
      
      // Analyze and get recommended actions
      newAgent.analyze().then(setActions);
    }
  }, [primaryWallet]);

  const executeAction = async (action: AgentAction) => {
    if (!agent || !primaryWallet) return;

    setLoading(true);
    try {
      // Get wallet client from wagmi (works with Dynamic SDK)
      if (!wagmiWalletClient) {
        throw new Error("Wallet client not available. Please ensure your wallet is connected.");
      }
      
      const walletClient = wagmiWalletClient;
      
      if (action.type === "swap") {
        await agent.executeSwapAction(walletClient, action);
      }

      // Update state
      agent.updateState({
        executedActions: [...agent.getState().executedActions, action],
        pendingActions: agent.getState().pendingActions.filter(a => a !== action),
      });

      // Re-analyze
      const newActions = await agent.analyze();
      setActions(newActions);
    } catch (error: any) {
      console.error("Error executing action:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!primaryWallet) {
    return (
      <div className="tg-card p-6">
        <p className="text-sm text-gray-600 text-center">
          Connect your wallet to enable DeFi agent
        </p>
      </div>
    );
  }

  return (
    <div className="tg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">🤖 DeFi Agent</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs">Auto Mode</span>
        </label>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <strong>Agent Mode:</strong> {autoMode ? "Autonomous" : "Manual"}
        </p>
        <p className="text-xs text-blue-700 mt-1">
          {autoMode
            ? "Agent will automatically execute beneficial swaps and optimize your portfolio"
            : "Review and approve actions manually"}
        </p>
      </div>

      {actions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recommended Actions:</p>
          {actions.map((action, idx) => (
            <div
              key={idx}
              className="border border-gray-200 rounded-lg p-3 bg-gray-50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {action.type === "swap" ? "🔄 Swap" : action.type}
                </span>
                <span className="text-xs text-gray-500">
                  Priority: {action.priority}/10
                </span>
              </div>
              {action.type === "swap" && (
                <div className="text-xs text-gray-600 mb-2">
                  Swap {action.params.amountIn} tokens
                </div>
              )}
              {!autoMode && (
                <button
                  onClick={() => executeAction(action)}
                  disabled={loading}
                  className="tg-button-primary w-full text-xs mt-2"
                >
                  {loading ? "Executing..." : "Execute"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">
            No actions recommended at this time
          </p>
        </div>
      )}

      {autoMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            ⚠️ Auto mode will execute actions automatically. Monitor your wallet
            for transactions.
          </p>
        </div>
      )}
    </div>
  );
}

