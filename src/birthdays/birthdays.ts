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
}

export async function getUpcomingBirthdays(
  days: number = 7,
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
    } else if (user?.telegramHandle) {
      query = query.eq("telegram_handle", user.telegramHandle);
    } else {
      // No user found - return empty (user hasn't created account yet)
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

  // Filter to next N days, handling year boundaries
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
    
    if (daysUntil >= 0 && daysUntil <= days) {
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
      });
    }
  }

  // Sort by days until (closest first)
  upcoming.sort((a, b) => {
    const aDate = new Date(currentYear, a.month - 1, a.day);
    if (aDate.getTime() < todayTime) {
      aDate.setFullYear(currentYear + 1);
    }
    const bDate = new Date(currentYear, b.month - 1, b.day);
    if (bDate.getTime() < todayTime) {
      bDate.setFullYear(currentYear + 1);
    }
    return aDate.getTime() - bDate.getTime();
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
  };
}

export async function getBirthdayById(birthdayId: string): Promise<Birthday | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.from("birthdays").select("*").eq("id", birthdayId).single();
  if (error || !data) return null;

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
  };
}

