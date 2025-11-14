"use client";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl"></div>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <div className="text-xs font-semibold text-green-700">Wallet Connected</div>
        </div>
        <div className="font-mono text-xs mb-3 p-2 bg-gray-50 rounded-lg text-gray-900 break-all">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </div>
        <button className="tg-button-secondary w-full text-sm" onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      <button className="tg-button-primary w-full" onClick={() => connect({ connector: injected() })} disabled={isPending}>
        {isPending ? "Connecting..." : "🔗 Connect Wallet"}
      </button>
      <p className="text-xs text-gray-500 mt-2 text-center">Connect MetaMask or another wallet</p>
    </div>
  );
}
