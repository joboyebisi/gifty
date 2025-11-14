import { getSupabase } from "../db/supabase";

export async function savePersonaSnapshot(recipientHandle: string, persona: string, provider: string) {
  const sb = getSupabase();
  if (!sb) return; // Supabase not configured, skip persist
  await sb.from("persona_snapshots").insert({
    recipient_handle: recipientHandle,
    provider,
    persona_summary: persona,
  });
}

export async function saveGeneratedMessages(giftId: string, messages: string[], provider: string) {
  const sb = getSupabase();
  if (!sb) return;
  const rows = messages.map((m, idx) => ({ gift_id: giftId, idx, message: m, provider }));
  await sb.from("generated_messages").insert(rows);
}


