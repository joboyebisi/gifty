import { getSupabase } from "../db/supabase";

export interface Appreciation {
  id: string;
  giftId: string;
  senderUserId: string;
  recipientUserId: string;
  message?: string;
  pointsAwarded: number;
  createdAt: Date;
}

/**
 * Create an appreciation message for a gift
 */
export async function createAppreciation(
  giftId: string,
  recipientUserId: string,
  message?: string
): Promise<Appreciation> {
  const sb = getSupabase();
  if (!sb) {
    throw new Error("Supabase client not initialized");
  }

  // Get gift to find sender
  const { data: gift, error: giftError } = await sb
    .from("gifts")
    .select("sender_user_id")
    .eq("id", giftId)
    .single();

  if (giftError || !gift) {
    throw new Error("Gift not found");
  }

  const senderUserId = gift.sender_user_id;
  if (!senderUserId) {
    throw new Error("Gift has no sender");
  }

  // Points awarded to sender (10 points for appreciation)
  const pointsAwarded = 10;

  // Create appreciation
  const { data: appreciation, error } = await sb
    .from("gift_appreciations")
    .insert({
      gift_id: giftId,
      sender_user_id: senderUserId,
      recipient_user_id: recipientUserId,
      message: message || "Thank you for the gift!",
      points_awarded: pointsAwarded,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating appreciation:", error);
    throw new Error(`Failed to create appreciation: ${error.message}`);
  }

  // Award points to sender
  await awardPoints(senderUserId, pointsAwarded, "gift_appreciated", {
    giftId,
    recipientUserId,
  });

  return {
    id: appreciation.id,
    giftId: appreciation.gift_id,
    senderUserId: appreciation.sender_user_id,
    recipientUserId: appreciation.recipient_user_id,
    message: appreciation.message || undefined,
    pointsAwarded: appreciation.points_awarded,
    createdAt: new Date(appreciation.created_at),
  };
}

/**
 * Award points to a user
 */
export async function awardPoints(
  userId: string,
  points: number,
  reason: string,
  metadata?: Record<string, any>
): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    throw new Error("Supabase client not initialized");
  }

  // Create points transaction
  const { error: txError } = await sb.from("points_transactions").insert({
    user_id: userId,
    points,
    reason,
    metadata: metadata || {},
  });

  if (txError) {
    console.error("Error creating points transaction:", txError);
    throw new Error(`Failed to award points: ${txError.message}`);
  }

  // Update or create user_points record
  const { error: upsertError } = await sb
    .from("user_points")
    .upsert(
      {
        user_id: userId,
        points,
      },
      {
        onConflict: "user_id",
        ignoreDuplicates: false,
      }
    );

  if (upsertError) {
    console.error("Error upserting user points:", upsertError);
    // Don't throw - transaction was created, points will be updated by trigger
  }
}

/**
 * Get user points
 */
export async function getUserPoints(userId: string): Promise<{
  points: number;
  totalSent: number;
  totalReceived: number;
  totalAppreciated: number;
}> {
  const sb = getSupabase();
  if (!sb) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await sb
    .from("user_points")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    // Return defaults if no points record exists
    return {
      points: 0,
      totalSent: 0,
      totalReceived: 0,
      totalAppreciated: 0,
    };
  }

  return {
    points: data.points || 0,
    totalSent: data.total_sent || 0,
    totalReceived: data.total_received || 0,
    totalAppreciated: data.total_appreciated || 0,
  };
}

/**
 * Get appreciation for a gift
 */
export async function getAppreciationForGift(
  giftId: string
): Promise<Appreciation | null> {
  const sb = getSupabase();
  if (!sb) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await sb
    .from("gift_appreciations")
    .select("*")
    .eq("gift_id", giftId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    giftId: data.gift_id,
    senderUserId: data.sender_user_id,
    recipientUserId: data.recipient_user_id,
    message: data.message || undefined,
    pointsAwarded: data.points_awarded,
    createdAt: new Date(data.created_at),
  };
}

