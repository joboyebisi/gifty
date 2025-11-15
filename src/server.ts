import express from "express";
import cors from "cors";
import { loadEnv } from "./config/env";
import { generatePersona, generateBirthdayMessages } from "./ai/adapter";
import { saveGeneratedMessages, savePersonaSnapshot } from "./ai/store";
import { createGift, getGiftByClaimCode, markGiftAsClaimed } from "./gifts/gifts";
import { getSupabase } from "./db/supabase";
import { getUpcomingBirthdays, createBirthday } from "./birthdays/birthdays";
import { getUserByWallet, createOrUpdateUser } from "./users/users";
import { sendVerificationCode, verifyEmailCode } from "./email/verification";
import { CircleWalletClient } from "./circle/wallet";
import { CCTPClient } from "./circle/cctp";
import { EscrowManager } from "./circle/escrow";
import { CircleOnrampClient } from "./circle/onramp";
import { CircleOfframpClient } from "./circle/offramp";

// Load environment variables
const env = loadEnv();

const app = express();

// CORS configuration - allow frontend URL in production
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      env.FRONTEND_URL,
      "http://localhost:3000",
      "https://localhost:3000",
    ].filter(Boolean);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, allow all origins
      if (env.NODE_ENV === "development") {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Root route
app.get("/", (_req: any, res: any) => {
  res.json({ 
    message: "Gifty API", 
    status: "running",
    endpoints: {
      health: "/healthz",
      api: "/api"
    }
  });
});

app.get("/healthz", (_req: any, res: any) => {
  const env = loadEnv();
  res.json({ ok: true, provider: env.DEFAULT_LLM_PROVIDER });
});

app.post("/api/ai/persona", async (req: any, res: any) => {
  try {
    const { snippets, stats, locale, provider, recipientHandle } = (req as any).body || {};
    if (!Array.isArray(snippets) || snippets.length === 0) {
      return res.status(400).json({ error: "snippets required" });
    }
    
    console.log(`🤖 Generating persona with provider: ${provider || "default"}`);
    const persona = await generatePersona({ snippets, stats: stats || {}, locale }, { provider });
    
    if (!persona || !persona.trim()) {
      console.error("⚠️ Persona generation returned empty result");
      return res.status(500).json({ error: "Persona generation returned empty result. Please check API keys." });
    }
    
    if (recipientHandle) {
      try {
        await savePersonaSnapshot(recipientHandle, persona, provider || "auto");
      } catch (saveErr) {
        console.warn("Failed to save persona snapshot:", saveErr);
        // Don't fail the request if saving fails
      }
    }
    
    res.json({ persona });
  } catch (err: any) {
    console.error("❌ Error generating persona:", err);
    const errorMessage = err?.message || "failed";
    
    // Provide helpful error messages
    if (errorMessage.includes("API_KEY") || errorMessage.includes("missing")) {
      return res.status(500).json({ 
        error: `API key missing. Please configure ${err.message.includes("GEMINI") ? "GEMINI_API_KEY" : err.message.includes("GROQ") ? "GROQ_API_KEY" : "AI provider API key"} in environment variables.` 
      });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

app.post("/api/ai/messages", async (req: any, res: any) => {
  try {
    const { persona, relationship, constraints, provider, giftId, recipientHandle } = (req as any).body || {};
    if (typeof persona !== "string" || !persona.trim()) {
      return res.status(400).json({ error: "persona required" });
    }
    
    const rel = relationship || {};
    const cons = constraints || {};
    
    console.log(`🤖 Generating messages with provider: ${provider || "default"}`);
    const out = await generateBirthdayMessages(persona, rel, cons, { provider });
    
    if (!out.messages || out.messages.length === 0) {
      console.error("⚠️ Message generation returned no messages");
      return res.status(500).json({ 
        error: "Message generation returned no messages. Please check API keys and try again." 
      });
    }
    
    // Save messages if giftId provided
    if (giftId) {
      try {
        await saveGeneratedMessages(giftId, out.messages, provider || "auto");
      } catch (saveErr) {
        console.warn("Failed to save generated messages:", saveErr);
        // Don't fail the request if saving fails
      }
    }
    
    // Save persona snapshot if recipientHandle provided
    if (recipientHandle) {
      try {
        await savePersonaSnapshot(recipientHandle, out.personaSummary || persona, provider || "auto");
      } catch (saveErr) {
        console.warn("Failed to save persona snapshot:", saveErr);
        // Don't fail the request if saving fails
      }
    }
    
    res.json(out);
  } catch (err: any) {
    console.error("❌ Error generating messages:", err);
    const errorMessage = err?.message || "failed";
    
    // Provide helpful error messages
    if (errorMessage.includes("API_KEY") || errorMessage.includes("missing")) {
      return res.status(500).json({ 
        error: `API key missing. Please configure ${err.message.includes("GEMINI") ? "GEMINI_API_KEY" : err.message.includes("GROQ") ? "GROQ_API_KEY" : "AI provider API key"} in environment variables.` 
      });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Gift creation endpoint with escrow
app.post("/api/gifts/create", async (req: any, res: any) => {
  try {
    const { senderUserId, recipientHandle, recipientEmail, amountUsdc, srcChain, dstChain, message, expiresInDays, senderWalletAddress } = (req as any).body || {};
    if (!amountUsdc || parseFloat(amountUsdc) <= 0) {
      return res.status(400).json({ error: "Valid amountUsdc required" });
    }
    if (!senderWalletAddress) {
      return res.status(400).json({ error: "senderWalletAddress required to fund escrow" });
    }

    // Create gift first
    const gift = await createGift({
      senderUserId,
      recipientHandle,
      recipientEmail,
      amountUsdc,
      srcChain,
      dstChain,
      message,
      expiresInDays: expiresInDays || 90,
      senderWalletAddress,
    });

    // Fund escrow: Create escrow wallet and lock funds
    try {
      const escrowManager = new EscrowManager();
      
      // Create escrow wallet for this gift
      const escrowWallet = await escrowManager.createEscrowWallet();
      
      // Fund escrow from sender
      // Note: In production, this requires sender's wallet approval
      // For now, we create the escrow wallet and mark it as ready
      // The actual funding should happen via a separate approval flow
      const fundResult = await escrowManager.fundEscrow(
        escrowWallet.id,
        senderWalletAddress,
        amountUsdc,
        srcChain || "ethereum"
      );
      
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("gifts").update({
          circle_wallet_id: escrowWallet.id,
          transfer_status: fundResult.success ? "escrow_funded" : "escrow_pending",
        }).eq("id", gift.id);
      }
      
      if (!fundResult.success) {
        throw new Error(fundResult.error || "Failed to fund escrow");
      }

      // Generate deeplinks
      const { generateSmartGiftLink } = await import("./utils/telegram-deeplink");
      const env = loadEnv();
      const links = generateSmartGiftLink({
        claimCode: gift.claimCode,
        secret: gift.claimSecret,
        botUsername: env.TELEGRAM_BOT_USERNAME,
        frontendUrl: env.FRONTEND_URL || "https://gifties-w3yr.vercel.app",
      });

      res.json({
        gift: { ...gift, circleWalletId: escrowWallet.id, transferStatus: "escrow_funded" },
        claimUrl: links.webLink,
        telegramLink: links.telegramLink,
        universalLink: links.universalLink,
        escrowWalletId: escrowWallet.id,
        message: "Gift created and funds escrowed. Recipient can claim when ready.",
      });
    } catch (escrowError: any) {
      console.error("Escrow funding error:", escrowError);
      // Gift created but escrow failed - mark as pending funding
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("gifts").update({
          transfer_status: "escrow_pending",
        }).eq("id", gift.id);
      }
      
      // Generate deeplinks even if escrow failed
      const { generateSmartGiftLink } = await import("./utils/telegram-deeplink");
      const env = loadEnv();
      const links = generateSmartGiftLink({
        claimCode: gift.claimCode,
        secret: gift.claimSecret,
        botUsername: env.TELEGRAM_BOT_USERNAME,
        frontendUrl: env.FRONTEND_URL || "https://gifties-w3yr.vercel.app",
      });
      
      res.status(500).json({
        error: "Gift created but escrow funding failed",
        details: escrowError.message,
        gift,
        claimUrl: links.webLink,
        telegramLink: links.telegramLink,
        universalLink: links.universalLink,
        claimCode: gift.claimCode,
        claimSecret: gift.claimSecret,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Get gifts for a recipient (by Telegram user ID or handle)
app.get("/api/gifts/recipient", async (req: any, res: any) => {
  try {
    const { telegramUserId, telegramHandle } = req.query;
    
    if (!telegramUserId && !telegramHandle) {
      return res.status(400).json({ error: "telegramUserId or telegramHandle required" });
    }
    
    const { getGiftsForRecipient } = await import("./gifts/gifts");
    const gifts = await getGiftsForRecipient(
      telegramUserId as string | undefined,
      telegramHandle as string | undefined
    );
    
    res.json({ gifts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Get gift by claim code (optionally verify secret)
app.get("/api/gifts/claim/:code", async (req: any, res: any) => {
  try {
    const { code } = req.params;
    const { secret } = req.query || {};
    const gift = await getGiftByClaimCode(code, secret);
    if (!gift) {
      return res.status(404).json({ error: "Gift not found, already claimed, expired, or invalid secret" });
    }
    // Check if gift requires secret (has secret hash in DB)
    const sb = getSupabase();
    let requiresSecret = false;
    if (sb) {
      const { data: dbGift } = await sb.from("gifts").select("claim_secret_hash").eq("claim_code", code).single();
      requiresSecret = !!dbGift?.claim_secret_hash;
    }
    
    // Don't return secret or secret hash
    const { claimSecret, ...giftWithoutSecret } = gift as any;
    res.json({ gift: giftWithoutSecret, requiresSecret });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Alternative endpoint: Get gift by claim code (for claim page)
app.get("/api/gifts/:claimCode", async (req: any, res: any) => {
  try {
    const { claimCode } = req.params;
    const { secret } = req.query || {};
    const gift = await getGiftByClaimCode(claimCode, secret);
    if (!gift) {
      return res.status(404).json({ error: "Gift not found, already claimed, expired, or invalid secret" });
    }
    // Don't return secret
    const { claimSecret, ...giftWithoutSecret } = gift as any;
    res.json({ gift: giftWithoutSecret });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Alternative endpoint: Claim gift by ID (for claim page)
// Appreciate a gift (send thank you message and award points)
app.post("/api/gifts/:id/appreciate", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { message, walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    // Get recipient user by wallet address
    const { getUserByWallet } = await import("./users/users");
    const recipientUser = await getUserByWallet(walletAddress);
    
    if (!recipientUser || !recipientUser.id) {
      return res.status(404).json({ error: "Recipient user not found. Please ensure you've claimed the gift first." });
    }

    const { createAppreciation } = await import("./gifts/appreciation");
    const appreciation = await createAppreciation(id, recipientUser.id, message);

    res.json({
      success: true,
      appreciation,
      message: "Thank you sent! Sender received 10 points.",
    });
  } catch (err: any) {
    console.error("Appreciation error:", err);
    res.status(500).json({ error: err?.message || "Failed to send appreciation" });
  }
});

// Get user points
app.get("/api/users/:userId/points", async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    const { getUserPoints } = await import("./gifts/appreciation");
    const points = await getUserPoints(userId);

    res.json({ success: true, points });
  } catch (err: any) {
    console.error("Get points error:", err);
    res.status(500).json({ error: err?.message || "Failed to get points" });
  }
});

app.post("/api/gifts/:id/claim", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { walletAddress, claimSecret } = (req as any).body || {};
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    // Get gift by ID
    const sb = getSupabase();
    if (!sb) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const { data: dbGift, error: fetchError } = await sb
      .from("gifts")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !dbGift) {
      return res.status(404).json({ error: "Gift not found" });
    }

    // Verify secret if required
    if (dbGift.claim_secret_hash && claimSecret) {
      const { createHash } = await import("node:crypto");
      const secretHash = createHash("sha256").update(claimSecret).digest("hex");
      if (secretHash !== dbGift.claim_secret_hash) {
        return res.status(400).json({ error: "Invalid secret code" });
      }
    } else if (dbGift.claim_secret_hash && !claimSecret) {
      return res.status(400).json({ error: "Secret code required" });
    }

    // Check if already claimed
    if (dbGift.status === "claimed") {
      return res.status(400).json({ error: "Gift already claimed" });
    }

    // Check if expired
    if (dbGift.expires_at && new Date(dbGift.expires_at) < new Date()) {
      await sb.from("gifts").update({ status: "expired" }).eq("id", id);
      return res.status(400).json({ error: "Gift has expired" });
    }

    // Verify escrow is funded
    if (!dbGift.circle_wallet_id) {
      return res.status(400).json({ error: "Gift escrow not funded. Please contact the sender." });
    }

    if (dbGift.transfer_status !== "escrow_funded") {
      return res.status(400).json({
        error: `Gift escrow status: ${dbGift.transfer_status}. Funds may not be available.`,
        status: dbGift.transfer_status,
      });
    }

    // Transfer from escrow to recipient
    try {
      const escrowManager = new EscrowManager();

      // Release funds from escrow to recipient
      const transfer = await escrowManager.releaseFromEscrow(
        dbGift.circle_wallet_id,
        walletAddress,
        dbGift.amount_usdc,
        dbGift.src_chain || "ethereum",
        dbGift.dst_chain || "arc"
      );

      // Update gift with transfer info
      await sb.from("gifts").update({
        circle_transfer_id: transfer.transferId,
        transfer_status: transfer.status,
        status: "claimed",
        claimer_wallet_address: walletAddress,
        claimed_at: new Date().toISOString(),
      }).eq("id", id);

      res.json({
        success: true,
        message: "Gift claimed! USDC is being transferred from escrow to your wallet.",
        transfer: {
          id: transfer.transferId,
          status: transfer.status,
          messageHash: transfer.messageHash,
        },
      });
    } catch (circleError: any) {
      console.error("Circle transfer error:", circleError);
      res.status(500).json({
        error: "Failed to transfer from escrow",
        details: circleError.message,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Execute claim - transfer from escrow to recipient
app.post("/api/gifts/claim/:code/execute", async (req: any, res: any) => {
  try {
    const { code } = req.params;
    const { walletAddress, secret } = (req as any).body || {};
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }
    // Verify gift and secret
    const gift = await getGiftByClaimCode(code, secret);
    if (!gift) {
      return res.status(404).json({ error: "Gift not found, already claimed, or invalid secret" });
    }

    // Verify escrow is funded
    if (!gift.circleWalletId) {
      return res.status(400).json({ error: "Gift escrow not funded. Please contact the sender." });
    }

    if (gift.transferStatus !== "escrow_funded") {
      return res.status(400).json({ 
        error: `Gift escrow status: ${gift.transferStatus}. Funds may not be available.`,
        status: gift.transferStatus,
      });
    }

    // Transfer from escrow to recipient
    try {
      const escrowManager = new EscrowManager();

      // Release funds from escrow to recipient
      const transfer = await escrowManager.releaseFromEscrow(
        gift.circleWalletId!, // Escrow wallet (already funded)
        walletAddress, // Recipient's wallet
        gift.amountUsdc,
        gift.srcChain || "ethereum",
        gift.dstChain || "arc"
      );

      // Update gift with transfer info
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("gifts").update({
          circle_transfer_id: transfer.transferId,
          transfer_status: transfer.status,
          status: "claimed",
          claimer_wallet_address: walletAddress,
          claimed_at: new Date().toISOString(),
        }).eq("id", gift.id);
      }

      res.json({
        success: true,
        gift: { ...gift, status: "claimed", transferId: transfer.transferId, transferStatus: transfer.status },
        transfer: {
          id: transfer.transferId,
          status: transfer.status,
          messageHash: transfer.messageHash,
          fromEscrow: true,
        },
        message: "Gift claimed! USDC is being transferred from escrow to your wallet.",
      });
    } catch (circleError: any) {
      console.error("Circle transfer error:", circleError);
      res.status(500).json({
        error: "Failed to transfer from escrow",
        details: circleError.message,
        gift,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Get upcoming birthdays
app.get("/api/birthdays/upcoming", async (req: any, res: any) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    const birthdays = await getUpcomingBirthdays(days);
    res.json({ birthdays });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Get user's birthdays (all, not just upcoming)
app.get("/api/birthdays", async (req: any, res: any) => {
  try {
    const { userId, telegramHandle, walletAddress } = req.query;
    
    const sb = getSupabase();
    if (!sb) {
      return res.status(500).json({ error: "Database not configured" });
    }

    let query = sb.from("birthdays").select("*");
    
    // Filter by user identifier
    if (userId) {
      query = query.eq("user_id", userId);
    } else if (telegramHandle) {
      query = query.eq("telegram_handle", telegramHandle.replace("@", ""));
    } else if (walletAddress) {
      // Get user first, then their birthdays
      const { getUserByWallet } = await import("./users/users");
      const user = await getUserByWallet(walletAddress);
      if (user?.telegramUserId) {
        query = query.eq("user_id", user.telegramUserId);
      } else if (user?.telegramHandle) {
        query = query.eq("telegram_handle", user.telegramHandle);
      } else {
        return res.json({ birthdays: [] });
      }
    } else {
      return res.status(400).json({ error: "userId, telegramHandle, or walletAddress required" });
    }

    const { data, error } = await query.order("month", { ascending: true }).order("day", { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const birthdays = (data || []).map((b: any) => ({
      id: b.id,
      userId: b.user_id,
      telegramHandle: b.telegram_handle,
      email: b.email,
      month: b.month,
      day: b.day,
      year: b.year,
      visibility: b.visibility,
      source: b.source,
      createdAt: b.created_at,
    }));

    res.json({ birthdays });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Create birthday
app.post("/api/birthdays", async (req: any, res: any) => {
  try {
    const { userId, telegramHandle, email, name, month, day, year, visibility, relationship } = (req as any).body || {};
    if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      return res.status(400).json({ error: "Valid month (1-12) and day (1-31) required" });
    }
    if (!telegramHandle && !email && !name) {
      return res.status(400).json({ error: "telegramHandle, email, or name required" });
    }
    
    const birthday = await createBirthday({ userId, telegramHandle, email, month, day, year, visibility });
    res.json({ birthday });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Update birthday
app.put("/api/birthdays/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { month, day, year, telegramHandle, email, name, visibility } = (req as any).body || {};
    
    const sb = getSupabase();
    if (!sb) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    if (month !== undefined) updateData.month = month;
    if (day !== undefined) updateData.day = day;
    if (year !== undefined) updateData.year = year;
    if (telegramHandle !== undefined) updateData.telegram_handle = telegramHandle;
    if (email !== undefined) updateData.email = email;
    if (visibility !== undefined) updateData.visibility = visibility;

    const { data, error } = await sb
      .from("birthdays")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Birthday not found" });
    }

    res.json({
      birthday: {
        id: data.id,
        userId: data.user_id,
        telegramHandle: data.telegram_handle,
        email: data.email,
        month: data.month,
        day: data.day,
        year: data.year,
        visibility: data.visibility,
        source: data.source,
        createdAt: data.created_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Delete birthday
app.delete("/api/birthdays/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    const sb = getSupabase();
    if (!sb) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const { error } = await sb.from("birthdays").delete().eq("id", id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, message: "Birthday deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Generate birthday gift link - allows people to send gifts to the birthday person
app.post("/api/birthdays/gift-link", async (req: any, res: any) => {
  try {
    const { userId, telegramHandle, email, walletAddress } = (req as any).body || {};
    
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    // Check if user has a birthday today
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Get user's birthday
    const sb = getSupabase();
    if (!sb) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const { data: birthday } = await sb
      .from("birthdays")
      .select("*")
      .or(
        userId ? `user_id.eq.${userId}` : 
        telegramHandle ? `telegram_handle.eq.${telegramHandle}` :
        email ? `email.eq.${email}` : "id.eq.null"
      )
      .eq("month", month)
      .eq("day", day)
      .maybeSingle();

    if (!birthday) {
      return res.status(404).json({ 
        error: "No birthday found for today. Gift links are only available on your birthday!" 
      });
    }

    // Create a special "birthday gift" that can be claimed by the wallet address
    // This creates a gift where the recipient is the birthday person
    const giftLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/gifts/birthday/${walletAddress}`;

    res.json({
      success: true,
      giftLink,
      birthday: {
        month: birthday.month,
        day: birthday.day,
      },
      message: "Share this link so friends can send you birthday gifts!",
    });
  } catch (err: any) {
    console.error("Error generating birthday gift link:", err);
    res.status(500).json({ error: err?.message || "Failed to generate gift link" });
  }
});

// Get or create user (auto-creates account if doesn't exist)
app.get("/api/users/me", async (req: any, res: any) => {
  try {
    const walletAddress = req.query.walletAddress;
    const telegramHandle = req.query.telegramHandle;
    const telegramUserId = req.query.telegramUserId;
    
    if (!walletAddress) {
      return res.json({ user: null });
    }
    
    let user = await getUserByWallet(walletAddress);
    
    // Auto-create account if user doesn't exist
    if (!user) {
      console.log(`📝 Auto-creating account for wallet: ${walletAddress.slice(0, 6)}...`);
      user = await createOrUpdateUser({
        walletAddress,
        telegramHandle,
        telegramUserId,
      });
    } else {
      // Update handle if provided and not already set
      if ((telegramHandle || telegramUserId) && (!user.telegramHandle || !user.telegramUserId)) {
        user = await createOrUpdateUser({
          walletAddress,
          telegramHandle: telegramHandle || user.telegramHandle,
          telegramUserId: telegramUserId || user.telegramUserId,
        });
      }
    }
    
    res.json({ user: user || null });
  } catch (err: any) {
    console.error("Error in /api/users/me:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Sync user data (for handle persistence when wallet connects)
app.post("/api/users/sync", async (req: any, res: any) => {
  try {
    const { walletAddress, telegramHandle, telegramUserId, email } = (req as any).body || {};
    
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    // Create or update user with handle and telegram info
    const user = await createOrUpdateUser({
      walletAddress,
      telegramHandle,
      telegramUserId,
      email,
    });

    res.json({ user, success: true });
  } catch (err: any) {
    console.error("Error syncing user:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Send email verification code
app.post("/api/email/send-code", async (req: any, res: any) => {
  try {
    const { email } = (req as any).body || {};
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }
    const code = await sendVerificationCode(email);
    // In development, return code for testing
    const isDev = process.env.NODE_ENV !== "production";
    res.json({ success: true, code: isDev ? code : undefined, message: isDev ? `Code: ${code}` : "Verification code sent" });
  } catch (err: any) {
    console.error("Error sending verification code:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Verify email code
app.post("/api/email/verify-code", async (req: any, res: any) => {
  try {
    const { email, code } = (req as any).body || {};
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code required" });
    }
    const verified = await verifyEmailCode(email, code);
    if (!verified) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }
    res.json({ success: true, verified: true });
  } catch (err: any) {
    console.error("Error verifying code:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Create or update user
app.post("/api/users", async (req: any, res: any) => {
  try {
    const { walletAddress, telegramHandle, email, telegramUserId, emailVerified, circleWalletId } = (req as any).body || {};
    if (!walletAddress && !telegramHandle && !email) {
      return res.status(400).json({ error: "At least one identifier required" });
    }
    
    // Only save email if verified
    const emailToSave = emailVerified === true ? email : undefined;
    
    const user = await createOrUpdateUser({ walletAddress, telegramHandle, email: emailToSave, telegramUserId, circleWalletId });
    res.json({ user });
  } catch (err: any) {
    console.error("Error in /api/users:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Get wallet balance
app.get("/api/wallet/balance", async (req: any, res: any) => {
  try {
    const { telegramUserId, walletAddress, chainId, telegramHandle } = req.query;
    if (!telegramUserId && !walletAddress) {
      return res.status(400).json({ error: "telegramUserId or walletAddress required" });
    }

    const { getUserByTelegramId, getUserByWallet, createOrUpdateUser } = await import("./users/users");
    let user = telegramUserId 
      ? await getUserByTelegramId(telegramUserId as string)
      : await getUserByWallet(walletAddress as string);
    
    // Auto-create user if doesn't exist (similar to /api/users/me)
    if (!user && walletAddress) {
      console.log(`📝 Auto-creating account for wallet balance check: ${walletAddress.slice(0, 6)}...`);
      user = await createOrUpdateUser({
        walletAddress: walletAddress as string,
        telegramHandle: telegramHandle as string | undefined,
        telegramUserId: telegramUserId as string | undefined,
      });
    }
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If chainId is specified, get balances for that chain
    const chainIdStr = typeof chainId === 'string' ? chainId : undefined;
    if (chainIdStr && user.walletAddress) {
      const { getChainBalances } = await import("./blockchain/balance");
      const chainBalances = await getChainBalances(user.walletAddress, chainIdStr);
      
      return res.json({
        chainId: chainBalances.chainId,
        chainName: chainBalances.chainName,
        native: {
          balance: chainBalances.native.balance,
          balanceFormatted: chainBalances.native.balanceFormatted,
          error: chainBalances.native.error,
        },
        usdc: {
          balance: chainBalances.usdc.balance,
          balanceFormatted: chainBalances.usdc.balanceFormatted,
          error: chainBalances.usdc.error,
        },
        walletAddress: user.walletAddress,
      });
    }

    // Default: Get Sepolia balances (ETH and USDC)
    let sepoliaBalances: any = null;
    let arcBalance: any = null;
    let error: string | undefined;

    if (user.walletAddress) {
      try {
        const { getChainBalances, getWalletBalance } = await import("./blockchain/balance");
        
        // Get Sepolia balances (ETH and USDC)
        try {
          sepoliaBalances = await getChainBalances(user.walletAddress, "11155111"); // Sepolia
          console.log(`✅ Sepolia balances: ETH=${sepoliaBalances.native.balanceFormatted}, USDC=${sepoliaBalances.usdc.balanceFormatted}`);
        } catch (sepoliaError: any) {
          console.error("Error fetching Sepolia balances:", sepoliaError);
          error = `Sepolia: ${sepoliaError.message}`;
        }
        
        // Also get Arc Testnet balance for backwards compatibility
        try {
          arcBalance = await getWalletBalance(user.walletAddress, "117000"); // Arc Testnet
          console.log(`✅ Arc balance: ${arcBalance.balanceFormatted} USDC`);
        } catch (arcError: any) {
          console.error("Error fetching Arc balance:", arcError);
          // Non-critical error
        }
      } catch (onChainError: any) {
        console.log(`⚠️ On-chain balance error: ${onChainError.message}`);
        error = onChainError.message;
      }
    }

    // Try Circle API as fallback (if Circle wallet ID exists)
    if (user.circleWalletId && (!sepoliaBalances || (!sepoliaBalances.usdc.balance || sepoliaBalances.usdc.balance === "0"))) {
      try {
        const { CircleWalletClient } = await import("./circle/wallet");
        const circleClient = new CircleWalletClient();
        const circleBalance = await circleClient.getWalletBalance(user.circleWalletId);
        const circleBalanceNum = parseFloat(circleBalance);
        
        if (circleBalanceNum > 0) {
          // Update or create USDC balance from Circle
          if (!sepoliaBalances) {
            sepoliaBalances = {
              native: { balance: "0", balanceFormatted: "0.000000", error: undefined },
              usdc: { balance: circleBalance, balanceFormatted: circleBalanceNum.toFixed(2), error: undefined },
              chainId: "circle",
              chainName: "Circle Wallet",
            };
          } else if (circleBalanceNum > parseFloat(sepoliaBalances.usdc.balance || "0")) {
            sepoliaBalances.usdc.balance = circleBalance;
            sepoliaBalances.usdc.balanceFormatted = circleBalanceNum.toFixed(2);
          }
          console.log(`✅ Circle API balance: ${circleBalance} USDC`);
        }
      } catch (circleError: any) {
        console.error("Error getting Circle wallet balance:", circleError);
        if (!error) {
          error = circleError.message;
        }
      }
    }

    // Return response with Sepolia balances (primary) and Arc balance (if available)
    const response: any = {
      sepolia: sepoliaBalances ? {
        chainId: sepoliaBalances.chainId,
        chainName: sepoliaBalances.chainName,
        eth: {
          balance: sepoliaBalances.native.balance,
          balanceFormatted: sepoliaBalances.native.balanceFormatted,
          error: sepoliaBalances.native.error,
        },
        usdc: {
          balance: sepoliaBalances.usdc.balance,
          balanceFormatted: sepoliaBalances.usdc.balanceFormatted,
          error: sepoliaBalances.usdc.error,
        },
      } : null,
      arc: arcBalance && !arcBalance.error ? {
        chainId: "117000",
        chainName: "Arc Testnet",
        usdc: {
          balance: arcBalance.balance,
          balanceFormatted: arcBalance.balanceFormatted,
          error: arcBalance.error,
        },
      } : null,
      walletId: user.circleWalletId || null,
      walletAddress: user.walletAddress,
      error,
    };

    // For backwards compatibility, also include top-level balance fields (using USDC from Sepolia or Circle)
    if (sepoliaBalances && sepoliaBalances.usdc) {
      response.balance = sepoliaBalances.usdc.balanceFormatted;
      response.balanceRaw = sepoliaBalances.usdc.balance;
      response.balanceSource = "on-chain-sepolia";
    } else if (arcBalance && !arcBalance.error) {
      response.balance = arcBalance.balanceFormatted;
      response.balanceRaw = arcBalance.balance;
      response.balanceSource = "on-chain-arc";
    } else {
      response.balance = "0.00";
      response.balanceRaw = "0";
      response.balanceSource = "unknown";
    }

    res.json(response);
  } catch (err: any) {
    console.error("Error in /api/wallet/balance:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Update Circle wallet ID for user
app.post("/api/wallet/circle-id", async (req: any, res: any) => {
  try {
    const { telegramUserId, walletAddress, circleWalletId } = (req as any).body || {};
    if (!circleWalletId) {
      return res.status(400).json({ error: "circleWalletId required" });
    }
    if (!telegramUserId && !walletAddress) {
      return res.status(400).json({ error: "telegramUserId or walletAddress required" });
    }

    const { getUserByTelegramId, getUserByWallet, createOrUpdateUser } = await import("./users/users");
    const existing = telegramUserId 
      ? await getUserByTelegramId(telegramUserId)
      : await getUserByWallet(walletAddress);
    
    if (!existing) {
      return res.status(404).json({ error: "User not found. Create user first." });
    }

    const user = await createOrUpdateUser({
      walletAddress: existing.walletAddress,
      telegramHandle: existing.telegramHandle,
      email: existing.email,
      telegramUserId: existing.telegramUserId,
      circleWalletId,
    });

    res.json({ user, message: "Circle wallet ID updated" });
  } catch (err: any) {
    console.error("Error in /api/wallet/circle-id:", err);
    res.status(500).json({ error: err?.message || "failed" });
  }
});

// Create Circle wallet for user (auto-creation)
// NOTE: Circle developer-controlled wallets are NOT needed for fiat funding
// Circle onramp works directly with Dynamic wallet addresses
// This endpoint is kept for future use cases (e.g., escrow wallets)
app.post("/api/wallet/create-circle-wallet", async (req: any, res: any) => {
  try {
    const { walletAddress, telegramUserId, telegramHandle } = (req as any).body || {};
    
    if (!walletAddress && !telegramUserId) {
      return res.status(400).json({ error: "walletAddress or telegramUserId required" });
    }

    const { getUserByWallet, getUserByTelegramId, createOrUpdateUser } = await import("./users/users");
    
    // Find user
    let user = walletAddress 
      ? await getUserByWallet(walletAddress)
      : await getUserByTelegramId(telegramUserId);
    
    // Create user if doesn't exist
    if (!user) {
      console.log(`📝 Auto-creating user: ${walletAddress?.slice(0, 6) || telegramUserId}...`);
      user = await createOrUpdateUser({
        walletAddress,
        telegramUserId,
        telegramHandle,
      });
    }

    // IMPORTANT: Circle developer-controlled wallets are NOT required for fiat funding
    // Circle onramp can fund any wallet address directly (including Dynamic wallets)
    // Circle Smart Accounts (for gasless transactions) are separate and use Circle Client Key
    
    // For now, return success without creating Circle wallet
    // Circle wallets are only needed for specific use cases (escrow, etc.)
    res.json({ 
      message: "User account ready. Your Dynamic wallet can receive funds directly.",
      note: "Circle developer-controlled wallets are not needed for fiat funding. Circle onramp works with any wallet address.",
      user,
      walletAddress: user.walletAddress,
    });
  } catch (err: any) {
    console.error("Error in wallet setup:", err);
    res.status(500).json({ error: err?.message || "Failed to set up wallet" });
  }
});

// Telegram webhook endpoint
app.post("/api/telegram/webhook", async (req: any, res: any) => {
  // Always respond to Telegram immediately to avoid timeout
  res.json({ ok: true });
  
  // Process asynchronously (don't await)
  (async () => {
  try {
    const update = req.body;
      if (!update) {
        console.error("❌ No update body received");
        return;
      }
      
      console.log("📩 Telegram webhook received - Update ID:", update.update_id);
      console.log("📩 Update type:", update.message ? "message" : update.callback_query ? "callback_query" : "other");
      
    // Handle bot commands
    if (update.message?.text?.startsWith("/")) {
        const command = update.message.text;
        console.log("🔧 Processing command:", command);
        console.log("👤 From user:", update.message.from?.first_name, "(ID:", update.message.from?.id, ")");
        console.log("💬 Chat ID:", update.message.chat?.id);
        
        try {
      const { handleBotCommand } = await import("./telegram/bot");
      await handleBotCommand(update);
          console.log("✅ Command handled successfully:", command);
        } catch (cmdError: any) {
          console.error("❌ Error handling command:", command);
          console.error("Error message:", cmdError?.message);
          console.error("Error stack:", cmdError?.stack);
          
          // Try to send error message to user
          try {
            const env = await import("./config/env").then(m => m.loadEnv());
            if (env.TELEGRAM_BOT_TOKEN && update.message?.chat?.id) {
              const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: update.message.chat.id,
                  text: "❌ Sorry, I encountered an error. Please try again later."
                })
              });
              if (!response.ok) {
                console.error("Failed to send error message to user");
              }
            }
          } catch (errMsgError) {
            console.error("Failed to send error message:", errMsgError);
          }
        }
      } else if (update.callback_query) {
        console.log("🔘 Callback query received:", update.callback_query.data);
        try {
          const { handleCallbackQuery } = await import("./telegram/handlers");
          await handleCallbackQuery(update);
          console.log("✅ Callback query handled successfully");
        } catch (callbackError: any) {
          console.error("❌ Error handling callback query:", callbackError);
          console.error("Error message:", callbackError?.message);
          console.error("Error stack:", callbackError?.stack);
        }
      } else if (update.message) {
        const messageText = update.message.text;
        const chatType = update.message.chat?.type;
        const isGroup = chatType === "group" || chatType === "supergroup";
        
        console.log("ℹ️ Regular message received (not a command):", messageText?.substring(0, 50));
        
        // Store group messages for AI analysis
        if (isGroup && update.message.from && messageText) {
          try {
            const sb = getSupabase();
            if (sb) {
              await sb.from("group_messages").upsert({
                chat_id: update.message.chat.id.toString(),
                message_id: update.message.message_id,
                user_id: update.message.from.id.toString(),
                username: update.message.from.username,
                first_name: update.message.from.first_name,
                last_name: update.message.from.last_name,
                message_text: messageText,
                message_date: new Date(update.message.date * 1000).toISOString(),
              }, {
                onConflict: "chat_id,message_id",
                ignoreDuplicates: true,
              });
            }
          } catch (storageError: any) {
            console.error("Error storing group message:", storageError);
            // Non-critical error, continue
          }
        }
        
        // Handle @bot mentions in group chats
        if (isGroup && messageText && messageText.includes("@")) {
          try {
            const { handleGroupMention } = await import("./telegram/group-handler");
            await handleGroupMention(update);
            console.log("✅ Group mention handled successfully");
          } catch (groupError: any) {
            console.error("❌ Error handling group mention:", groupError);
            console.error("Error message:", groupError?.message);
            console.error("Error stack:", groupError?.stack);
          }
        }
      } else {
        console.log("ℹ️ Other update type received:", Object.keys(update));
      }
    } catch (err: any) {
      console.error("❌ Telegram webhook processing error:");
      console.error("Error:", err?.message);
      console.error("Stack:", err?.stack);
    }
  })();
});

// Goody webhook endpoint with signature verification
app.post("/api/goody/webhook", async (req: any, res: any) => {
  try {
    const env = await import("./config/env").then(m => m.loadEnv());
    const webhookSecret = env.GOODY_WEBHOOK_SECRET;
    
    // Get Svix headers for signature verification
    const svixHeaders = {
      "svix-id": req.headers["svix-id"] as string,
      "svix-timestamp": req.headers["svix-timestamp"] as string,
      "svix-signature": req.headers["svix-signature"] as string,
    };

    // Verify webhook signature if secret is provided
    if (webhookSecret) {
      try {
        const { verifySvixSignature } = await import("./goody/webhook");
        const payload = JSON.stringify(req.body);
        
        const isValid = verifySvixSignature(payload, svixHeaders, webhookSecret);
        
        if (!isValid) {
          console.warn("⚠️ Invalid webhook signature - rejecting");
          return res.status(401).json({ error: "Invalid signature" });
        }
        
        console.log("🔐 Webhook signature verified");
      } catch (sigError: any) {
        console.warn("⚠️ Signature verification error:", sigError.message);
        // In production, you might want to reject invalid signatures
        // For now, we'll continue but log the warning
      }
    } else {
      console.warn("⚠️ GOODY_WEBHOOK_SECRET not set - skipping signature verification");
    }
    
    const event = req.body;
    console.log("🎁 Goody webhook received:", JSON.stringify(event, null, 2));
    
    // Handle webhook event using dedicated handler
    try {
      const { handleGoodyWebhook } = await import("./goody/webhook");
      await handleGoodyWebhook(event);
    } catch (handlerError: any) {
      console.error("❌ Error handling webhook:", handlerError);
      // Still return success to Goody to prevent retries
      // Log error for investigation
    }
    
    // Always return success to Goody (200 OK)
    // This prevents Goody from retrying the webhook
    res.json({ received: true, processed: true });
  } catch (err: any) {
    console.error("❌ Goody webhook error:", err);
    // Return 200 to prevent Goody from retrying
    // Log error for investigation
    res.status(200).json({ received: true, error: err?.message || "processing failed" });
  }
});

// CCTP Transfer endpoint for cross-chain swaps
app.post("/api/cctp/transfer", async (req: any, res: any) => {
  try {
    const { amount, sourceChain, destinationChain, recipientAddress, senderWalletAddress, currency = "USDC" } = req.body || {};
    
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }
    if (!sourceChain || !destinationChain) {
      return res.status(400).json({ error: "sourceChain and destinationChain required" });
    }
    if (!recipientAddress) {
      return res.status(400).json({ error: "recipientAddress required" });
    }

    // For swaps, we need to use Circle's wallet system
    // First, get or create a Circle wallet for the sender
    const circleWalletClient = new CircleWalletClient();
    const cctpClient = new CCTPClient();

    // In production, you'd get the Circle wallet ID from the database
    // For now, we'll create a wallet (this should be cached/stored)
    let walletId: string;
    try {
      const wallet = await circleWalletClient.createWallet();
      walletId = wallet.id;
    } catch (error: any) {
      // If wallet creation fails, try to get existing wallet from database
      // This is a simplified version - in production, store wallet mappings
      return res.status(500).json({ error: "Failed to get or create Circle wallet" });
    }

    // Initiate CCTP transfer
    const transfer = await cctpClient.initiateCCTPTransfer(
      walletId,
      sourceChain,
      destinationChain,
      recipientAddress,
      amount
    );

    res.json({
      success: true,
      transferId: transfer.id,
      messageHash: transfer.messageHash,
      status: transfer.status,
      sourceChain: transfer.sourceChain,
      destinationChain: transfer.destinationChain,
    });
  } catch (err: any) {
    console.error("CCTP transfer error:", err);
    res.status(500).json({ error: err?.message || "Failed to initiate CCTP transfer" });
  }
});

// Get CCTP transfer status
app.get("/api/cctp/status/:transferId", async (req: any, res: any) => {
  try {
    const { transferId } = req.params;
    if (!transferId) {
      return res.status(400).json({ error: "transferId required" });
    }

    const cctpClient = new CCTPClient();
    const status = await cctpClient.getCCTPStatus(transferId);

    res.json({
      transferId: status.id,
      status: status.status,
      messageHash: status.messageHash,
      sourceChain: status.sourceChain,
      destinationChain: status.destinationChain,
      amount: status.amount,
      recipientAddress: status.recipientAddress,
    });
  } catch (err: any) {
    console.error("CCTP status error:", err);
    res.status(500).json({ error: err?.message || "Failed to get CCTP transfer status" });
  }
});

// Onramp: Get wire instructions for funding wallet (fiat to crypto)
// Note: Circle onramp can work directly with any wallet address (Dynamic wallet is fine)
app.post("/api/onramp/wire-instructions", async (req: any, res: any) => {
  try {
    const { walletAddress, currency = "USD" } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    // For fiat funding, we can use Circle's onramp API directly with the Dynamic wallet address
    // No need for Circle developer-controlled wallets - that's a different use case
    
    // In production, this would use Circle's onramp widget or API
    // For now, return instructions for on-chain funding (testnet)
    res.json({
      message: "Fund your wallet:",
      instructions: [
        "💵 Fiat Funding (Coming Soon):",
        "  • Circle onramp will support direct funding to your Dynamic wallet",
        "  • No Circle wallet needed - your Dynamic wallet works!",
        "",
        "🪙 On-Chain Funding (Available Now):",
        "  • Sepolia Testnet: Use faucets to get ETH and USDC",
        "  • Arc Testnet: Use faucets to get USDC",
        "  • Send USDC directly to your wallet address above",
      ],
      note: "Your Dynamic wallet address can receive funds directly. Circle Smart Accounts (for gasless transactions) are separate and optional.",
      walletAddress,
      onChainFunding: {
        sepolia: {
          ethFaucet: "https://sepoliafaucet.com",
          usdcFaucet: "https://app.uniswap.org/faucet/sepolia",
        },
        arc: {
          usdcFaucet: "https://faucet.arc.network",
        },
      },
    });
  } catch (err: any) {
    console.error("Onramp wire instructions error:", err);
    res.status(500).json({ error: err?.message || "Failed to get wire instructions" });
  }
});

// Offramp: Withdraw USDC to bank account (crypto to fiat)
app.post("/api/offramp/withdraw", async (req: any, res: any) => {
  try {
    const { walletAddress, bankAccountId, amount, currency = "USD" } = req.body;
    if (!walletAddress || !bankAccountId || !amount) {
      return res.status(400).json({ 
        error: "walletAddress, bankAccountId, and amount are required" 
      });
    }

    // Get user to find their Circle wallet ID
    const user = await getUserByWallet(walletAddress);
    if (!user?.circleWalletId) {
      return res.status(400).json({ 
        error: "Circle wallet not found. Please set up your Circle wallet first.",
        requiresCircleWallet: true,
      });
    }

    // Check balance
    const circleClient = new CircleWalletClient();
    const balance = await circleClient.getWalletBalance(user.circleWalletId);
    const balanceNum = parseFloat(balance);
    const amountNum = parseFloat(amount);

    if (balanceNum < amountNum) {
      return res.status(400).json({ 
        error: "Insufficient balance",
        balance: balance,
        required: amount,
      });
    }

    // Create payout
    const offrampClient = new CircleOfframpClient();
    const payout = await offrampClient.createPayout({
      sourceWalletId: user.circleWalletId,
      bankAccountId,
      amount: amountNum.toFixed(2),
      currency,
    });

    res.json({
      success: true,
      payoutId: payout.id,
      status: payout.status,
      amount: payout.amount,
      message: "Withdrawal initiated. Funds will be transferred to your bank account.",
    });
  } catch (err: any) {
    console.error("Offramp withdraw error:", err);
    res.status(500).json({ error: err?.message || "Failed to initiate withdrawal" });
  }
});

// Link bank account for onramp/offramp
app.post("/api/bank/link", async (req: any, res: any) => {
  try {
    const bankDetails = req.body;
    
    // Validate required fields
    if (!bankDetails.accountNumber || !bankDetails.routingNumber || !bankDetails.billingDetails) {
      return res.status(400).json({ 
        error: "accountNumber, routingNumber, and billingDetails are required" 
      });
    }

    const onrampClient = new CircleOnrampClient();
    const bankAccount = await onrampClient.linkBankAccount(bankDetails);

    res.json({
      success: true,
      bankAccountId: bankAccount.id,
      status: bankAccount.status,
      description: bankAccount.description,
      message: "Bank account linked successfully. You can now use it for deposits and withdrawals.",
    });
  } catch (err: any) {
    console.error("Link bank account error:", err);
    res.status(500).json({ error: err?.message || "Failed to link bank account" });
  }
});

// ==================== BULK GIFT ENDPOINTS ====================

// Create bulk gift campaign (for HR/CEO)
app.post("/api/bulk-gifts/create", async (req: any, res: any) => {
  try {
    const {
      senderUserId,
      senderWalletAddress,
      companyName,
      senderName,
      giftType,
      productId,
      amountUsdc,
      message,
      recipients,
      expiresInDays,
    } = req.body;

    if (!senderUserId || !senderWalletAddress || !senderName || !giftType || !recipients || recipients.length === 0) {
      return res.status(400).json({
        error: "senderUserId, senderWalletAddress, senderName, giftType, and recipients are required",
      });
    }

    if (giftType === "goody" && !productId) {
      return res.status(400).json({ error: "productId is required for Goody gifts" });
    }

    if ((giftType === "usdc" || giftType === "mixed") && !amountUsdc) {
      return res.status(400).json({ error: "amountUsdc is required for USDC gifts" });
    }

    const { createBulkGift } = await import("./gifts/bulk-gifts");
    const bulkGift = await createBulkGift({
      senderUserId,
      senderWalletAddress,
      companyName,
      senderName,
      giftType,
      productId,
      amountUsdc,
      message,
      recipients,
      expiresInDays: expiresInDays || 90,
    });

    // Process bulk gift (create individual gifts/orders)
    const { processBulkGift } = await import("./gifts/bulk-gifts");
    await processBulkGift(bulkGift.id);

    // If Goody gift, create Goody order batch
    if (giftType === "goody" || giftType === "mixed") {
      try {
        const { GoodyClient } = await import("./goody/client");
        const goodyClient = new GoodyClient();

        const goodyRecipients = recipients.map((r: any) => ({
          first_name: r.firstName,
          last_name: r.lastName,
          email: r.email,
        }));

        const orderBatch = await goodyClient.createOrderBatch({
          from_name: senderName,
          send_method: "link_multiple_custom_list",
          recipients: goodyRecipients,
          cart: {
            items: [
              {
                product_id: productId!,
                quantity: 1,
              },
            ],
          },
          message: message || `Holiday gift from ${companyName || senderName}`,
        });

        // Update bulk gift with Goody batch ID
        const sb = getSupabase();
        if (sb) {
          await sb
            .from("bulk_gifts")
            .update({ goody_batch_id: orderBatch.id })
            .eq("id", bulkGift.id);

          // Update recipients with Goody order IDs
          if (orderBatch.orders_preview) {
            for (let i = 0; i < Math.min(orderBatch.orders_preview.length, recipients.length); i++) {
              const order = orderBatch.orders_preview[i];
              const recipient = recipients[i];
              await sb
                .from("bulk_gift_recipients")
                .update({ goody_order_id: order.id })
                .eq("bulk_gift_id", bulkGift.id)
                .eq("email", recipient.email)
                .eq("first_name", recipient.firstName);
            }
          }
        }
      } catch (goodyError: any) {
        console.error("Goody order batch creation error:", goodyError);
        // Continue even if Goody fails - USDC gifts can still work
      }
    }

    const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";
    const teamClaimUrl = `${frontendUrl}/team/claim/${bulkGift.bulkGiftCode}`;

    res.json({
      success: true,
      bulkGift,
      teamClaimUrl,
      message: `Bulk gift created! Share this link with your team: ${teamClaimUrl}`,
    });
  } catch (err: any) {
    console.error("Bulk gift creation error:", err);
    res.status(500).json({ error: err?.message || "Failed to create bulk gift" });
  }
});

// Get bulk gift by code (for team members)
app.get("/api/bulk-gifts/:code", async (req: any, res: any) => {
  try {
    const { code } = req.params;
    const { findBulkGiftRecipient } = await import("./gifts/bulk-gifts");
    const { getBulkGiftByCode } = await import("./gifts/bulk-gifts");

    const bulkGift = await getBulkGiftByCode(code);
    if (!bulkGift) {
      return res.status(404).json({ error: "Bulk gift not found or expired" });
    }

    res.json({ bulkGift });
  } catch (err: any) {
    console.error("Get bulk gift error:", err);
    res.status(500).json({ error: err?.message || "Failed to get bulk gift" });
  }
});

// Find recipient in bulk gift (for team member claim)
app.post("/api/bulk-gifts/:code/find-recipient", async (req: any, res: any) => {
  try {
    const { code } = req.params;
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({ error: "email or phoneNumber is required" });
    }

    const { findBulkGiftRecipient } = await import("./gifts/bulk-gifts");
    const recipient = await findBulkGiftRecipient(code, email, phoneNumber);

    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found in this bulk gift" });
    }

    if (recipient.status === "claimed") {
      return res.status(400).json({ error: "Gift already claimed" });
    }

    res.json({ recipient });
  } catch (err: any) {
    console.error("Find recipient error:", err);
    res.status(500).json({ error: err?.message || "Failed to find recipient" });
  }
});

// Claim bulk gift (team member)
app.post("/api/bulk-gifts/:code/claim", async (req: any, res: any) => {
  try {
    const { code } = req.params;
    const { email, phoneNumber, walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const { findBulkGiftRecipient, markBulkGiftRecipientClaimed, getBulkGiftByCode } = await import("./gifts/bulk-gifts");
    
    const recipient = await findBulkGiftRecipient(code, email, phoneNumber);
    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found in this bulk gift" });
    }

    if (recipient.status === "claimed") {
      return res.status(400).json({ error: "Gift already claimed" });
    }

    const bulkGift = await getBulkGiftByCode(code);
    if (!bulkGift) {
      return res.status(404).json({ error: "Bulk gift not found" });
    }

    // If USDC gift, claim the individual gift
    if (bulkGift.giftType === "usdc" || bulkGift.giftType === "mixed") {
      if (recipient.claimCode) {
        // Claim the individual USDC gift
        const { getGiftByClaimCode } = await import("./gifts/gifts");
        const gift = await getGiftByClaimCode(recipient.claimCode, recipient.claimSecret);
        
        if (gift) {
          // Execute claim
          const escrowManager = new EscrowManager();
          const transfer = await escrowManager.releaseFromEscrow(
            gift.circleWalletId!,
            walletAddress,
            gift.amountUsdc,
            gift.srcChain || "ethereum",
            gift.dstChain || "arc"
          );

          // Mark gift as claimed
          const { markGiftAsClaimed } = await import("./gifts/gifts");
          await markGiftAsClaimed(gift.id, walletAddress);
        }
      }
    }

    // Mark bulk gift recipient as claimed
    await markBulkGiftRecipientClaimed(recipient.id, walletAddress, recipient.giftId);

    res.json({
      success: true,
      message: "Gift claimed successfully!",
      giftType: bulkGift.giftType,
      goodyOrderId: recipient.goodyOrderId,
    });
  } catch (err: any) {
    console.error("Claim bulk gift error:", err);
    res.status(500).json({ error: err?.message || "Failed to claim bulk gift" });
  }
});

// Get bulk gifts for sender (dashboard)
app.get("/api/bulk-gifts/sender/:userId", async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    const { getBulkGiftsForSender } = await import("./gifts/bulk-gifts");
    const bulkGifts = await getBulkGiftsForSender(userId);

    res.json({ bulkGifts });
  } catch (err: any) {
    console.error("Get bulk gifts for sender error:", err);
    res.status(500).json({ error: err?.message || "Failed to get bulk gifts" });
  }
});

// ==================== AI GROUP ANALYSIS ENDPOINTS ====================

// Analyze Telegram group and generate gift suggestions
app.post("/api/ai/analyze-group", async (req: any, res: any) => {
  try {
    const { chatId, days = 30, giftType = "mixed" } = req.body;

    if (!chatId) {
      return res.status(400).json({ error: "chatId is required" });
    }

    // Fetch group message history
    const { GroupMessageFetcher } = await import("./telegram/group-messages");
    const fetcher = new GroupMessageFetcher();
    const history = await fetcher.getGroupMessageHistory(chatId, days, 1000);

    if (history.members.size === 0) {
      return res.status(404).json({ 
        error: "No group message history found. Make sure the bot has access to group messages.",
        suggestion: "The bot needs to receive messages in the group to analyze them. Send some messages and try again."
      });
    }

    // Convert to analyzer format
    const members = GroupMessageFetcher.toAnalyzerFormat(history);

    // Analyze group members
    const { analyzeGroupMembers, generateGiftSuggestions } = await import("./ai/group-analyzer");
    const profiles = await analyzeGroupMembers(members);

    // Generate gift suggestions
    const suggestions = await generateGiftSuggestions(profiles, giftType);

    res.json({
      success: true,
      chatId,
      memberCount: members.length,
      profiles,
      suggestions,
      message: `Analyzed ${members.length} group members and generated personalized gift suggestions.`,
    });
  } catch (err: any) {
    console.error("Group analysis error:", err);
    res.status(500).json({ error: err?.message || "Failed to analyze group" });
  }
});

// Analyze group from stored messages (alternative endpoint)
app.post("/api/ai/analyze-group-messages", async (req: any, res: any) => {
  try {
    const { messages, giftType = "mixed" } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Group messages by user
    const memberMap = new Map<number, {
      userId: number;
      username?: string;
      firstName: string;
      lastName?: string;
      messageCount: number;
      messages: Array<{ text: string; timestamp: number }>;
    }>();

    for (const msg of messages) {
      if (!msg.from || !msg.from.id) continue;

      const userId = msg.from.id;
      if (!memberMap.has(userId)) {
        memberMap.set(userId, {
          userId,
          username: msg.from.username,
          firstName: msg.from.first_name || "User",
          lastName: msg.from.last_name,
          messageCount: 0,
          messages: [],
        });
      }

      const member = memberMap.get(userId)!;
      if (msg.text) {
        member.messages.push({
          text: msg.text,
          timestamp: msg.date || Date.now() / 1000,
        });
        member.messageCount++;
      }
    }

    const members = Array.from(memberMap.values());

    // Analyze group members
    const { analyzeGroupMembers, generateGiftSuggestions } = await import("./ai/group-analyzer");
    const profiles = await analyzeGroupMembers(members);

    // Generate gift suggestions
    const suggestions = await generateGiftSuggestions(profiles, giftType);

    res.json({
      success: true,
      memberCount: members.length,
      profiles,
      suggestions,
      message: `Analyzed ${members.length} group members and generated personalized gift suggestions.`,
    });
  } catch (err: any) {
    console.error("Group message analysis error:", err);
    res.status(500).json({ error: err?.message || "Failed to analyze group messages" });
  }
});

// Smart Contract API endpoints
import smartContractRoutes from "./server-smart-contracts";
app.use("/api/smart-contracts", smartContractRoutes);

// Health check endpoint for Railway/Docker
app.get("/health", (req: any, res: any) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Gifty API listening on http://localhost:${PORT} (provider=${env.DEFAULT_LLM_PROVIDER || "gemini"})`);
});


