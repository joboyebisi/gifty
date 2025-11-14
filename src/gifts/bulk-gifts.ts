import { getSupabase } from "../db/supabase";
import { randomBytes, createHash } from "node:crypto";
import { createGift } from "./gifts";

export interface BulkGift {
  id: string;
  bulkGiftCode: string; // Special code for team members to claim
  senderUserId: string;
  senderWalletAddress: string;
  companyName?: string;
  senderName: string;
  giftType: "goody" | "usdc" | "mixed";
  productId?: string; // For Goody gifts
  amountUsdc?: string; // For USDC gifts
  message?: string;
  recipients: BulkGiftRecipient[];
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  expiresAt?: string;
  goodyBatchId?: string; // Goody order batch ID
}

export interface BulkGiftRecipient {
  id: string;
  bulkGiftId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  telegramHandle?: string;
  phoneNumber?: string;
  country?: string;
  giftId?: string; // Individual gift ID (if USDC)
  goodyOrderId?: string; // Goody order ID (if Goody gift)
  claimCode?: string; // Individual claim code
  claimSecret?: string; // Individual secret
  status: "pending" | "claimed" | "expired";
  claimedAt?: string;
  claimerWalletAddress?: string;
}

/**
 * Create a bulk gift campaign
 */
export async function createBulkGift(data: {
  senderUserId: string;
  senderWalletAddress: string;
  companyName?: string;
  senderName: string;
  giftType: "goody" | "usdc" | "mixed";
  productId?: string;
  amountUsdc?: string;
  message?: string;
  recipients: Array<{
    firstName: string;
    lastName?: string;
    email?: string;
    telegramHandle?: string;
    phoneNumber?: string;
    country?: string;
  }>;
  expiresInDays?: number;
}): Promise<BulkGift> {
  const sb = getSupabase();
  if (!sb) {
    throw new Error("Supabase not available");
  }

  // Generate bulk gift code (shorter, memorable code for team)
  const bulkGiftCode = generateBulkGiftCode();
  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Create bulk gift record
  const { data: bulkGift, error: bulkError } = await sb
    .from("bulk_gifts")
    .insert({
      bulk_gift_code: bulkGiftCode,
      sender_user_id: data.senderUserId,
      sender_wallet_address: data.senderWalletAddress,
      company_name: data.companyName,
      sender_name: data.senderName,
      gift_type: data.giftType,
      product_id: data.productId,
      amount_usdc: data.amountUsdc,
      message: data.message,
      status: "pending",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (bulkError) {
    console.error("Error creating bulk gift:", bulkError);
    throw new Error(`Failed to create bulk gift: ${bulkError.message}`);
  }

  // Create recipient records
  const recipientInserts = data.recipients.map((recipient) => ({
    bulk_gift_id: bulkGift.id,
    first_name: recipient.firstName,
    last_name: recipient.lastName,
    email: recipient.email,
    telegram_handle: recipient.telegramHandle?.replace("@", ""),
    phone_number: recipient.phoneNumber,
    country: recipient.country,
    status: "pending",
  }));

  const { data: recipients, error: recipientsError } = await sb
    .from("bulk_gift_recipients")
    .insert(recipientInserts)
    .select();

  if (recipientsError) {
    console.error("Error creating bulk gift recipients:", recipientsError);
    throw new Error(`Failed to create recipients: ${recipientsError.message}`);
  }

  return {
    id: bulkGift.id,
    bulkGiftCode: bulkGift.bulk_gift_code,
    senderUserId: bulkGift.sender_user_id,
    senderWalletAddress: bulkGift.sender_wallet_address,
    companyName: bulkGift.company_name,
    senderName: bulkGift.sender_name,
    giftType: bulkGift.gift_type,
    productId: bulkGift.product_id,
    amountUsdc: bulkGift.amount_usdc,
    message: bulkGift.message,
    recipients: recipients.map((r: any) => ({
      id: r.id,
      bulkGiftId: r.bulk_gift_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      telegramHandle: r.telegram_handle,
      phoneNumber: r.phone_number,
      country: r.country,
      status: r.status,
    })),
    status: bulkGift.status,
    createdAt: bulkGift.created_at,
    expiresAt: bulkGift.expires_at,
    goodyBatchId: bulkGift.goody_batch_id,
  };
}

/**
 * Get bulk gift by code (for team members to claim)
 */
export async function getBulkGiftByCode(bulkGiftCode: string): Promise<BulkGift | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: bulkGift, error } = await sb
    .from("bulk_gifts")
    .select("*")
    .eq("bulk_gift_code", bulkGiftCode)
    .single();

  if (error || !bulkGift) {
    return null;
  }

  // Check if expired
  if (bulkGift.expires_at && new Date(bulkGift.expires_at) < new Date()) {
    await sb.from("bulk_gifts").update({ status: "expired" }).eq("id", bulkGift.id);
    return null;
  }

  // Get recipients
  const { data: recipients } = await sb
    .from("bulk_gift_recipients")
    .select("*")
    .eq("bulk_gift_id", bulkGift.id);

  return {
    id: bulkGift.id,
    bulkGiftCode: bulkGift.bulk_gift_code,
    senderUserId: bulkGift.sender_user_id,
    senderWalletAddress: bulkGift.sender_wallet_address,
    companyName: bulkGift.company_name,
    senderName: bulkGift.sender_name,
    giftType: bulkGift.gift_type,
    productId: bulkGift.product_id,
    amountUsdc: bulkGift.amount_usdc,
    message: bulkGift.message,
    recipients: (recipients || []).map((r: any) => ({
      id: r.id,
      bulkGiftId: r.bulk_gift_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      telegramHandle: r.telegram_handle,
      phoneNumber: r.phone_number,
      country: r.country,
      giftId: r.gift_id,
      goodyOrderId: r.goody_order_id,
      claimCode: r.claim_code,
      claimSecret: r.claim_secret,
      status: r.status,
      claimedAt: r.claimed_at,
      claimerWalletAddress: r.claimer_wallet_address,
    })),
    status: bulkGift.status,
    createdAt: bulkGift.created_at,
    expiresAt: bulkGift.expires_at,
    goodyBatchId: bulkGift.goody_batch_id,
  };
}

/**
 * Find recipient in bulk gift by email or phone
 */
export async function findBulkGiftRecipient(
  bulkGiftCode: string,
  email?: string,
  phoneNumber?: string
): Promise<BulkGiftRecipient | null> {
  const bulkGift = await getBulkGiftByCode(bulkGiftCode);
  if (!bulkGift) return null;

  const recipient = bulkGift.recipients.find(
    (r) =>
      (email && r.email?.toLowerCase() === email.toLowerCase()) ||
      (phoneNumber && r.phoneNumber === phoneNumber)
  );

  return recipient || null;
}

/**
 * Mark bulk gift recipient as claimed
 */
export async function markBulkGiftRecipientClaimed(
  recipientId: string,
  claimerWalletAddress: string,
  giftId?: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      claimer_wallet_address: claimerWalletAddress,
      gift_id: giftId,
    })
    .eq("id", recipientId);
}

/**
 * Get bulk gifts for sender (dashboard)
 */
export async function getBulkGiftsForSender(senderUserId: string): Promise<BulkGift[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: bulkGifts, error } = await sb
    .from("bulk_gifts")
    .select("*")
    .eq("sender_user_id", senderUserId)
    .order("created_at", { ascending: false });

  if (error || !bulkGifts) return [];

  // Get recipients for each bulk gift
  const bulkGiftsWithRecipients = await Promise.all(
    bulkGifts.map(async (bg: any) => {
      const { data: recipients } = await sb
        .from("bulk_gift_recipients")
        .select("*")
        .eq("bulk_gift_id", bg.id);

      return {
        id: bg.id,
        bulkGiftCode: bg.bulk_gift_code,
        senderUserId: bg.sender_user_id,
        senderWalletAddress: bg.sender_wallet_address,
        companyName: bg.company_name,
        senderName: bg.sender_name,
        giftType: bg.gift_type,
        productId: bg.product_id,
        amountUsdc: bg.amount_usdc,
        message: bg.message,
        recipients: (recipients || []).map((r: any) => ({
          id: r.id,
          bulkGiftId: r.bulk_gift_id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          telegramHandle: r.telegram_handle,
          phoneNumber: r.phone_number,
          country: r.country,
          giftId: r.gift_id,
          goodyOrderId: r.goody_order_id,
          claimCode: r.claim_code,
          claimSecret: r.claim_secret,
          status: r.status,
          claimedAt: r.claimed_at,
          claimerWalletAddress: r.claimer_wallet_address,
        })),
        status: bg.status,
        createdAt: bg.created_at,
        expiresAt: bg.expires_at,
        goodyBatchId: bg.goody_batch_id,
      };
    })
  );

  return bulkGiftsWithRecipients;
}

/**
 * Generate a memorable bulk gift code (e.g., "HOLIDAY2024")
 */
function generateBulkGiftCode(): string {
  const adjectives = ["HOLIDAY", "TEAM", "CELEBRATE", "JOY", "GIFT", "THANKS", "APPRECIATE"];
  const numbers = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${adjective}${numbers}`;
}

/**
 * Process bulk gift - create individual gifts or Goody orders
 */
export async function processBulkGift(bulkGiftId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not available");

  // Get bulk gift
  const { data: bulkGift } = await sb
    .from("bulk_gifts")
    .select("*")
    .eq("id", bulkGiftId)
    .single();

  if (!bulkGift) throw new Error("Bulk gift not found");

  // Get recipients
  const { data: recipients } = await sb
    .from("bulk_gift_recipients")
    .select("*")
    .eq("bulk_gift_id", bulkGiftId)
    .eq("status", "pending");

  if (!recipients || recipients.length === 0) {
    throw new Error("No pending recipients found");
  }

  // Update status to processing
  await sb.from("bulk_gifts").update({ status: "processing" }).eq("id", bulkGiftId);

  try {
    if (bulkGift.gift_type === "usdc" || bulkGift.gift_type === "mixed") {
      // Create individual USDC gifts
      for (const recipient of recipients) {
        const claimCode = randomBytes(16).toString("hex");
        const claimSecret = randomBytes(8).toString("base64url").slice(0, 12);
        const claimSecretHash = createHash("sha256").update(claimSecret).digest("hex");

        const gift = await createGift({
          senderUserId: bulkGift.sender_user_id,
          recipientHandle: recipient.telegram_handle,
          recipientEmail: recipient.email,
          amountUsdc: bulkGift.amount_usdc || "0",
          srcChain: "ethereum",
          dstChain: "arc",
          message: bulkGift.message,
          senderWalletAddress: bulkGift.sender_wallet_address,
        });

        // Update recipient with gift info
        await sb
          .from("bulk_gift_recipients")
          .update({
            gift_id: gift.id,
            claim_code: gift.claimCode,
            claim_secret: claimSecret, // Store secret for team member claim
          })
          .eq("id", recipient.id);
      }
    }

    // Goody orders will be created separately via API endpoint
    // (handled in server.ts)

    // Update status to completed
    await sb.from("bulk_gifts").update({ status: "completed" }).eq("id", bulkGiftId);
  } catch (error: any) {
    // Update status to failed
    await sb.from("bulk_gifts").update({ status: "failed" }).eq("id", bulkGiftId);
    throw error;
  }
}

