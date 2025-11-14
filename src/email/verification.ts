import { getSupabase } from "../db/supabase";

export async function sendVerificationCode(email: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  // Generate 6-digit code
  const code = (100000 + Math.floor(Math.random() * 900000)).toString();

  // Store code in database (expires in 10 minutes)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const { error } = await sb.from("email_verifications").insert({
    email,
    code,
    expires_at: expiresAt.toISOString(),
    verified: false,
  });

  if (error) throw new Error(`Failed to create verification: ${error.message}`);

  // TODO: Send email via SendGrid, Resend, or similar
  // For now, log it (in production, use a real email service)
  console.log(`[EMAIL VERIFICATION] Code for ${email}: ${code}`);

  return code;
}

export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data, error } = await sb
    .from("email_verifications")
    .select("*")
    .eq("email", email)
    .eq("code", code)
    .eq("verified", false)
    .single();

  if (error || !data) return false;

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    return false;
  }

  // Mark as verified
  await sb.from("email_verifications").update({ verified: true }).eq("id", data.id);

  return true;
}

