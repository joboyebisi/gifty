import { getSupabase } from "../db/supabase";

export interface Birthday {
  id: string;
  userId?: string;
  telegramHandle?: string;
  email?: string;
  month: number;
  day: number;
  year?: number;
  visibility: string;
  source: string;
  createdAt: string;
  daysUntil?: number;
}

export async function getUpcomingBirthdays(
  days: number = 30, // Default to 30 days to show more birthdays
  userId?: string,
  walletAddress?: string,
  telegramHandle?: string
): Promise<Birthday[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentDay = today.getDate();

  // Build query - filter by user if provided
  let query = sb.from("birthdays").select("*");
  
  // Filter by user identifier
  if (userId) {
    query = query.eq("user_id", userId);
  } else if (walletAddress) {
    // Get user by wallet address first, then filter birthdays
    const { getUserByWallet } = await import("../users/users");
    const user = await getUserByWallet(walletAddress);
    if (user?.telegramUserId) {
      query = query.eq("user_id", user.telegramUserId);
      console.log(`🔍 [BIRTHDAYS] Filtering by user_id: ${user.telegramUserId} (from wallet ${walletAddress.slice(0, 10)}...)`);
    } else if (user?.telegramHandle) {
      query = query.eq("telegram_handle", user.telegramHandle);
      console.log(`🔍 [BIRTHDAYS] Filtering by telegram_handle: ${user.telegramHandle} (from wallet ${walletAddress.slice(0, 10)}...)`);
    } else {
      // No user found - this shouldn't happen if user was auto-created when birthday was added
      // But handle gracefully - try to create user now if we have wallet address
      console.warn(`⚠️ [BIRTHDAYS] No user found for wallet ${walletAddress.slice(0, 10)}...`);
      console.warn(`   This might mean the user wasn't created when the birthday was added.`);
      console.warn(`   Returning empty array - user needs to be created first.`);
      // Return empty - user will be created on next birthday creation
      return [];
    }
  } else if (telegramHandle) {
    query = query.eq("telegram_handle", telegramHandle.replace("@", ""));
  }
  
  // Also include birthdays where user is the recipient (for contacts)
  // For now, we'll show all birthdays linked to the user
  
  const { data, error } = await query
    .order("month", { ascending: true })
    .order("day", { ascending: true })
    .limit(200); // Get more to handle year boundaries

  if (error || !data) {
    console.error("Error fetching birthdays:", error);
    return [];
  }

  // Calculate days until each birthday (handles year boundaries) and optionally filter by days
  const includeAll = !days || days <= 0;
  const upcoming: Birthday[] = [];
  const todayTime = today.getTime();

  for (const b of data) {
    // Calculate birthday date for this year
    let bdayDate = new Date(currentYear, b.month - 1, b.day);

    // If birthday already passed this year, use next year
    if (bdayDate.getTime() < todayTime) {
      bdayDate = new Date(currentYear + 1, b.month - 1, b.day);
    }

    const daysUntil = Math.ceil((bdayDate.getTime() - todayTime) / (1000 * 60 * 60 * 24));

    if (includeAll || (daysUntil >= 0 && daysUntil <= days)) {
      upcoming.push({
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
        daysUntil,
      });
    }
  }

  // Sort by days until (closest first)
  upcoming.sort((a, b) => {
    const aDays = a.daysUntil ?? 0;
    const bDays = b.daysUntil ?? 0;
    return aDays - bDays;
  });

  return upcoming;
}

export async function createBirthday(data: {
  userId?: string;
  telegramHandle?: string;
  email?: string;
  month: number;
  day: number;
  year?: number;
  visibility?: string;
}): Promise<Birthday> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: birthday, error } = await sb
    .from("birthdays")
    .insert({
      user_id: data.userId,
      telegram_handle: data.telegramHandle,
      email: data.email,
      month: data.month,
      day: data.day,
      year: data.year,
      visibility: data.visibility || "public",
      source: "user",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create birthday: ${error.message}`);

  return {
    id: birthday.id,
    userId: birthday.user_id,
    telegramHandle: birthday.telegram_handle,
    email: birthday.email,
    month: birthday.month,
    day: birthday.day,
    year: birthday.year,
    visibility: birthday.visibility,
    source: birthday.source,
    createdAt: birthday.created_at,
    daysUntil: 0,
  };
}

export async function getBirthdayById(birthdayId: string): Promise<Birthday | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.from("birthdays").select("*").eq("id", birthdayId).single();
  if (error || !data) return null;

  const today = new Date();
  const currentYear = today.getFullYear();
  let bdayDate = new Date(currentYear, data.month - 1, data.day);
  if (bdayDate.getTime() < today.getTime()) {
    bdayDate = new Date(currentYear + 1, data.month - 1, data.day);
  }
  const daysUntil = Math.ceil((bdayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return {
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
    daysUntil,
  };
}

