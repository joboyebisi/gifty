"use client";

import { useEffect, useRef, useState } from "react";
import { setCookie, getCookie } from "cookies-next";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string;
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;

// Icons
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const BotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5A2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5a2.5 2.5 0 0 0 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5a2.5 2.5 0 0 0-2.5-2.5" />
  </svg>
);

type LoginResult = {
  userToken: string;
  encryptionKey: string;
};

type Wallet = {
  id: string;
  address: string;
  blockchain: string;
  [key: string]: unknown;
};

type Message = {
  role: "user" | "agent";
  text: string;
};

export default function WalletPage() {
  // SDK & State
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<string>("Initializing secure environment...");

  // Auth State
  const [deviceId, setDeviceId] = useState<string>("");
  const [deviceToken, setDeviceToken] = useState<string>("");
  const [deviceEncryptionKey, setDeviceEncryptionKey] = useState<string>("");
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);

  // Wallet State
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", text: "Hi! I'm Gifty Agent. I can help you find gifts or answer questions." }
  ]);
  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // 1. Initialize SDK
  useEffect(() => {
    let mounted = true;

    const initSdk = async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

        const onLoginComplete = (error: unknown, result: any) => {
          if (!mounted) return;
          if (error) {
            console.error("Login failed:", error);
            setStatus("Login failed. Please try again.");
            return;
          }
          console.log("Login Success");
          setLoginResult({ userToken: result.userToken, encryptionKey: result.encryptionKey });
          setStatus("Login successful! Loading wallet...");
        };

        // Restore session from cookies/local
        const restoredDeviceToken = (getCookie("deviceToken") as string) || "";
        const restoredEncryptionKey = (getCookie("deviceEncryptionKey") as string) || "";

        if (restoredDeviceToken) {
          setDeviceToken(restoredDeviceToken);
          setDeviceEncryptionKey(restoredEncryptionKey);
        }

        const sdk = new W3SSdk({
          appSettings: { appId },
          loginConfigs: {
            deviceToken: restoredDeviceToken,
            deviceEncryptionKey: restoredEncryptionKey,
            google: {
              clientId: googleClientId,
              redirectUri: typeof window !== "undefined" ? window.location.origin : "",
              selectAccountPrompt: true,
            },
          }
        }, onLoginComplete);

        sdkRef.current = sdk;
        setSdkReady(true);

        if (restoredDeviceToken) {
          setStatus("Session restored. Ready to login.");
        } else {
          setStatus("Ready. Please secure this device.");
        }

      } catch (err) {
        console.error("SDK Init Error:", err);
        setStatus("Failed to initialize security SDK.");
      }
    };

    void initSdk();
    return () => { mounted = false; };
  }, []);

  // 2. Fetch Device ID (Auto)
  useEffect(() => {
    if (!sdkReady || !sdkRef.current) return;
    const getDeviceId = async () => {
      const id = await sdkRef.current?.getDeviceId();
      setDeviceId(id || "");
    };
    void getDeviceId();
  }, [sdkReady]);

  // 3. Load Wallet if Logged In
  useEffect(() => {
    if (loginResult?.userToken && wallets.length === 0) {
      loadWallets(loginResult.userToken);
    }
  }, [loginResult]);

  // Actions
  const handleCreateDeviceToken = async () => {
    if (!deviceId) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");

      setDeviceToken(data.deviceToken);
      setDeviceEncryptionKey(data.deviceEncryptionKey);
      setCookie("deviceToken", data.deviceToken);
      setCookie("deviceEncryptionKey", data.deviceEncryptionKey);
      setStatus("Device secured. Please login.");
    } catch (err: any) {
      setStatus("Error securing device: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    if (!sdkRef.current || !deviceToken) return;
    // Update config with latest tokens just in case
    sdkRef.current.updateConfigs({
      appSettings: { appId },
      loginConfigs: {
        deviceToken,
        deviceEncryptionKey,
        google: {
          clientId: googleClientId,
          redirectUri: window.location.origin,
          selectAccountPrompt: true,
        }
      }
    });
    sdkRef.current.performLogin(SocialLoginProvider.GOOGLE);
  };

  const handleCreateWallet = async () => {
    if (!loginResult) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initializeUser", userToken: loginResult.userToken }),
      });
      const data = await res.json();

      if (res.ok) {
        setChallengeId(data.challengeId);
        setStatus("Please verify your identity (PIN/Passkey)...");
      } else if (data.code === 155106) {
        loadWallets(loginResult.userToken);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      setStatus(err.message || "Failed to create wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteChallenge = () => {
    if (!sdkRef.current || !challengeId || !loginResult) return;

    sdkRef.current.setAuthentication({
      userToken: loginResult.userToken,
      encryptionKey: loginResult.encryptionKey,
    });

    sdkRef.current.execute(challengeId, (error, result) => {
      if (error) {
        setStatus("Verification failed: " + (error as any).message);
        return;
      }
      setStatus("Wallet created successfully!");
      setChallengeId(null);
      setTimeout(() => loadWallets(loginResult.userToken), 2000);
    });
  };

  const loadWallets = async (userToken: string) => {
    setIsLoading(true);
    setStatus("Loading wallet data...");
    try {
      const res = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken }),
      });
      const data = await res.json();

      if (res.ok && data.wallets?.length > 0) {
        setWallets(data.wallets);
        setStatus("Wallet ready.");
        loadBalance(userToken, data.wallets[0].id);
      } else {
        setStatus("No wallet found. Please create one.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBalance = async (userToken: string, walletId: string) => {
    try {
      const res = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getTokenBalance", userToken, walletId }),
      });
      const data = await res.json();
      if (res.ok) {
        const bals = (data.tokenBalances as any[]) || [];
        const usdc = bals.find(b => b.token?.symbol === "USDC");
        setUsdcBalance(usdc?.amount || "0.00");
      }
    } catch (err) {
      console.error("Balance load error", err);
    }
  };

  const handleCopy = () => {
    if (!wallets[0]?.address) return;
    navigator.clipboard.writeText(wallets[0].address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isChatLoading) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setIsChatLoading(true);

    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      // Use current session ID or random
      const chatId = Date.now();

      const res = await fetch(`${API}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          userId: "web-user",
          chatId // Naive chat ID for session
        }),
      });
      const data = await res.json();

      if (data.success && data.response?.payload?.text) {
        // Agent Replied (Coordinator -> User)
        // Remove formatting like "RESULT: user_reply -> Chat 123: "
        let reply = data.response.payload.text;
        // Simple cleanup if needed, but agent should return clean text
        setMessages(prev => [...prev, { role: "agent", text: reply }]);
      } else if (data.response?.type === 'timeout') {
        setMessages(prev => [...prev, { role: "agent", text: "The agent is taking a while to think. Please check back." }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "agent", text: "Sorry, I couldn't reach the agent network." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Render
  const primaryWallet = wallets[0];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 font-sans gap-6">

      {/* Header */}
      <div className="text-center mt-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Gifty Wallet</h1>
        <p className="text-gray-500 mt-2">Powered by Circle & Arc</p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left Column: Wallet Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 h-fit">
          {/* Wallet Display (If Loaded) */}
          {primaryWallet ? (
            <div className="p-8">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Total Balance</p>
                <div className="mt-2 flex items-baseline justify-center">
                  <span className="text-5xl font-extrabold text-gray-900">{usdcBalance}</span>
                  <span className="ml-2 text-xl font-medium text-gray-500">USDC</span>
                </div>
              </div>

              <div className="mt-8 bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Wallet Address (Arc)</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${primaryWallet.blockchain === 'ARC-TESTNET' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-700'}`}>
                    {primaryWallet.blockchain || "Testnet"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono text-gray-800 break-all mr-2">
                    {primaryWallet.address}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="p-2 hover:bg-white rounded-lg transition-colors text-gray-500 hover:text-indigo-600 focus:outline-none"
                    title="Copy Address"
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-gray-400">
                Send USDC (Testnet) to this address to top up your gift balance.
              </p>

              {/* Refresh Balance */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => loadBalance(loginResult?.userToken!, primaryWallet.id)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  Refresh Balance
                </button>
              </div>
            </div>
          ) : (
            /* Login Flow */
            <div className="p-8 space-y-6">

              {/* Step 1: Secure Device */}
              {!deviceToken && (
                <div className="text-center">
                  <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 text-indigo-600">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Secure This Device</h3>
                  <p className="mt-2 text-sm text-gray-500">First, create a secure session key.</p>
                  <button
                    onClick={handleCreateDeviceToken}
                    disabled={!sdkReady || isLoading}
                    className="mt-6 w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? "Securing..." : "Secure Device"}
                  </button>
                </div>
              )}

              {/* Step 2: Google Login */}
              {deviceToken && !loginResult && (
                <div className="text-center">
                  <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600">
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Sign In</h3>
                  <p className="mt-2 text-sm text-gray-500">Connect Google to access wallet.</p>
                  <button
                    onClick={handleLogin}
                    className="mt-6 w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all"
                  >
                    Continue with Google
                  </button>
                </div>
              )}

              {/* Step 3: Create Wallet / PIN */}
              {loginResult && !wallets.length && !challengeId && (
                <div className="text-center">
                  <h3 className="text-lg font-medium text-gray-900">Create Wallet</h3>
                  <p className="mt-2 text-sm text-gray-500">Initialize your Circle Programmable Wallet.</p>
                  <button
                    onClick={handleCreateWallet}
                    disabled={isLoading}
                    className="mt-6 w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-all"
                  >
                    {isLoading ? "Creating..." : "Create Wallet"}
                  </button>
                </div>
              )}

              {/* Step 4: Challenge */}
              {challengeId && (
                <div className="text-center bg-yellow-50 p-6 rounded-xl border border-yellow-200">
                  <h3 className="text-lg font-medium text-yellow-800">Security Check</h3>
                  <p className="mt-2 text-sm text-yellow-600">Please complete the PIN setup in the popup.</p>
                  <button
                    onClick={handleExecuteChallenge}
                    className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 transition-all"
                  >
                    Open Security Popup
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
            <span>{status}</span>
          </div>
        </div>

        {/* Right Column: Agent Chat */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 flex flex-col h-[600px] md:h-auto">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-pink-50 to-white">
            <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
              <BotIcon />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Gifty Agent</h3>
              <p className="text-xs text-green-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Online
              </p>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user'
                    ? 'bg-pink-600 text-white rounded-br-none'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none shadow-sm'
                  }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-100"></span>
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-200"></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Find a gift for @alice..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:border-pink-500 text-sm"
                disabled={isChatLoading || !loginResult} // Require login? Maybe not for chat, but for context yes
              />
              <button
                onClick={handleSendMessage}
                disabled={isChatLoading || !input.trim()}
                className="bg-pink-600 text-white p-2 rounded-xl hover:bg-pink-700 disabled:opacity-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
            {!loginResult && (
              <p className="text-xs text-center text-gray-400 mt-2">Login to make purchases</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
