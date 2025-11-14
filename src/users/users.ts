import { getSupabase } from "../db/supabase";

export interface User {
  id: string;
  walletAddress?: string;
  telegramHandle?: string;
  email?: string;
  telegramUserId?: string;
  circleWalletId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getUserByWallet(walletAddress: string): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.from("users").select("*").eq("wallet_address", walletAddress).single();
  if (error || !data) return null;

  return {
    id: data.id,
    walletAddress: data.wallet_address,
    telegramHandle: data.telegram_handle,
    email: data.email,
    telegramUserId: data.telegram_user_id,
    circleWalletId: data.circle_wallet_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getUserByTelegramId(telegramUserId: string): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.from("users").select("*").eq("telegram_user_id", telegramUserId).single();
  if (error || !data) return null;

  return {
    id: data.id,
    walletAddress: data.wallet_address,
    telegramHandle: data.telegram_handle,
    email: data.email,
    telegramUserId: data.telegram_user_id,
    circleWalletId: data.circle_wallet_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getUserByTelegramHandle(telegramHandle: string): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // Remove @ if present
  const handle = telegramHandle.replace("@", "");
  
  const { data, error } = await sb.from("users").select("*").eq("telegram_handle", handle).single();
  if (error || !data) return null;

  return {
    id: data.id,
    walletAddress: data.wallet_address,
    telegramHandle: data.telegram_handle,
    email: data.email,
    telegramUserId: data.telegram_user_id,
    circleWalletId: data.circle_wallet_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function createOrUpdateUser(data: {
  walletAddress?: string;
  telegramHandle?: string;
  email?: string;
  telegramUserId?: string;
  circleWalletId?: string;
}): Promise<User> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  // Try to find existing user by wallet or telegram ID
  let existing: User | null = null;
  if (data.walletAddress) {
    existing = await getUserByWallet(data.walletAddress);
  }
  if (!existing && data.telegramUserId) {
    existing = await getUserByTelegramId(data.telegramUserId);
  }

  if (existing) {
    // Update existing user
    const updateData: any = {
      wallet_address: data.walletAddress || existing.walletAddress,
      telegram_handle: data.telegramHandle || existing.telegramHandle,
      email: data.email || existing.email,
      telegram_user_id: data.telegramUserId || existing.telegramUserId,
      updated_at: new Date().toISOString(),
    };
    if (data.circleWalletId) {
      updateData.circle_wallet_id = data.circleWalletId;
    }
    
    const { data: updated, error } = await sb
      .from("users")
      .update(updateData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update user: ${error.message}`);
    return {
      id: updated.id,
      walletAddress: updated.wallet_address,
      telegramHandle: updated.telegram_handle,
      email: updated.email,
      telegramUserId: updated.telegram_user_id,
      circleWalletId: updated.circle_wallet_id,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  // Create new user
  const { data: user, error } = await sb
    .from("users")
    .insert({
      wallet_address: data.walletAddress,
      telegram_handle: data.telegramHandle,
      email: data.email,
      telegram_user_id: data.telegramUserId,
      circle_wallet_id: data.circleWalletId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);

  return {
    id: user.id,
    walletAddress: user.wallet_address,
    telegramHandle: user.telegram_handle,
    email: user.email,
    telegramUserId: user.telegram_user_id,
    circleWalletId: user.circle_wallet_id,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

