import { getSupabase } from "../db/supabase";
import { randomBytes, createHash } from "node:crypto";

export interface Gift {
  id: string;
  claimCode: string;
  claimSecret?: string; // Only returned when creating gift, never in queries
  senderUserId?: string;
  recipientHandle?: string;
  recipientEmail?: string;
  amountUsdc: string;
  srcChain: string;
  dstChain: string;
  message?: string;
  status: "pending" | "claimed" | "expired";
  expiresAt?: string;
  createdAt: string;
  circleWalletId?: string;
  circleTransferId?: string;
  transferStatus?: "pending" | "escrow_pending" | "escrow_funded" | "transferring" | "completed" | "failed";
  senderWalletAddress?: string;
}

export async function createGift(data: {
  senderUserId?: string;
  recipientHandle?: string;
  recipientEmail?: string;
  amountUsdc: string;
  srcChain?: string;
  dstChain?: string;
  message?: string;
  expiresInDays?: number;
  senderWalletAddress?: string;
}): Promise<Gift> {
  const sb = getSupabase();
  if (!sb) {
    // Fallback: in-memory for development
    const claimCode = randomBytes(16).toString("hex");
    const gift: Gift = {
      id: `gift_${Date.now()}`,
      claimCode,
      senderUserId: data.senderUserId,
      recipientHandle: data.recipientHandle,
      recipientEmail: data.recipientEmail,
      amountUsdc: data.amountUsdc,
      srcChain: data.srcChain || "ethereum",
      dstChain: data.dstChain || "arc",
      message: data.message,
      status: "pending",
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };
    return gift;
  }

  const claimCode = randomBytes(16).toString("hex");
  // Generate a secret (4-6 word phrase or random string) for secure claiming
  const claimSecret = randomBytes(8).toString("base64url").slice(0, 12); // 12 character secret
  const claimSecretHash = createHash("sha256").update(claimSecret).digest("hex");
  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Insert gift into database
  const { data: gift, error } = await sb
    .from("gifts")
    .insert({
      sender_user_id: data.senderUserId,
      recipient_handle: data.recipientHandle,
      recipient_email: data.recipientEmail,
      amount_usdc: data.amountUsdc,
      src_chain: data.srcChain || "ethereum",
      dst_chain: data.dstChain || "arc",
      message: data.message,
      claim_code: claimCode,
      claim_secret_hash: claimSecretHash,
      status: "pending",
      expires_at: expiresAt,
      sender_wallet_address: data.senderWalletAddress,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase error creating gift:", error);
    throw new Error(`Failed to create gift: ${error.message}. Details: ${JSON.stringify(error)}`);
  }

  return {
    id: gift.id,
    claimCode: gift.claim_code,
    claimSecret, // Include secret only when creating (not in queries)
    senderUserId: gift.sender_user_id,
    recipientHandle: gift.recipient_handle,
    recipientEmail: gift.recipient_email,
    amountUsdc: gift.amount_usdc,
    srcChain: gift.src_chain,
    dstChain: gift.dst_chain,
    message: gift.message,
    status: gift.status,
    expiresAt: gift.expires_at,
    createdAt: gift.created_at,
  };
}

export async function getGiftByClaimCode(claimCode: string, secret?: string): Promise<Gift | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: gift, error } = await sb.from("gifts").select("*").eq("claim_code", claimCode).single();

  if (error || !gift) {
    if (error) console.error("Supabase error fetching gift:", error);
    return null;
  }

  // Check if expired
  if (gift.expires_at && new Date(gift.expires_at) < new Date()) {
    await sb.from("gifts").update({ status: "expired" }).eq("id", gift.id);
    return null;
  }

  // Check if already claimed
  if (gift.status === "claimed") return null;

  // Verify secret if provided
  if (gift.claim_secret_hash && secret) {
    const secretHash = createHash("sha256").update(secret).digest("hex");
    if (secretHash !== gift.claim_secret_hash) {
      return null; // Invalid secret
    }
  }

  return {
    id: gift.id,
    claimCode: gift.claim_code,
    senderUserId: gift.sender_user_id,
    recipientHandle: gift.recipient_handle,
    recipientEmail: gift.recipient_email,
    amountUsdc: gift.amount_usdc,
    srcChain: gift.src_chain,
    dstChain: gift.dst_chain,
    message: gift.message,
    status: gift.status,
    expiresAt: gift.expires_at,
    createdAt: gift.created_at,
    circleWalletId: gift.circle_wallet_id,
    circleTransferId: gift.circle_transfer_id,
    transferStatus: gift.transfer_status,
    senderWalletAddress: gift.sender_wallet_address,
  };
}

export async function markGiftAsClaimed(giftId: string, claimerWalletAddress: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await sb
    .from("gifts")
    .update({ status: "claimed", claimer_wallet_address: claimerWalletAddress, claimed_at: new Date().toISOString() })
    .eq("id", giftId);
}

/**
 * Get pending gifts for a recipient by Telegram user ID or handle
 */
export async function getGiftsForRecipient(telegramUserId?: string, telegramHandle?: string): Promise<Gift[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb.from("gifts").select("*").eq("status", "pending");
  
  // Filter by recipient handle if provided
  if (telegramHandle) {
    const handle = telegramHandle.replace("@", "");
    query = query.eq("recipient_handle", handle);
  }
  
  // If we have telegramUserId, we might need to join with users table to find by user ID
  // For now, we'll rely on handle matching
  // TODO: Add recipient_user_id to gifts table for better matching
  
  const { data: gifts, error } = await query.order("created_at", { ascending: false });
  
  if (error || !gifts) return [];
  
  // Filter out expired gifts
  const now = new Date();
  const validGifts = gifts.filter((gift: any) => {
    if (gift.expires_at && new Date(gift.expires_at) < now) {
      // Mark as expired in background (don't wait)
      sb.from("gifts").update({ status: "expired" }).eq("id", gift.id).then(() => {});
      return false;
    }
    return true;
  });
  
  return validGifts.map((gift: any) => ({
    id: gift.id,
    claimCode: gift.claim_code,
    senderUserId: gift.sender_user_id,
    recipientHandle: gift.recipient_handle,
    recipientEmail: gift.recipient_email,
    amountUsdc: gift.amount_usdc,
    srcChain: gift.src_chain,
    dstChain: gift.dst_chain,
    message: gift.message,
    status: gift.status,
    expiresAt: gift.expires_at,
    createdAt: gift.created_at,
    circleWalletId: gift.circle_wallet_id,
    circleTransferId: gift.circle_transfer_id,
    transferStatus: gift.transfer_status,
    senderWalletAddress: gift.sender_wallet_address,
  }));
}

