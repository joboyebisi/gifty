/**
 * Generate Telegram deeplinks for opening Mini Apps and bot commands
 */

export interface DeeplinkOptions {
  claimCode: string;
  secret?: string;
  botUsername?: string;
  frontendUrl?: string;
}

/**
 * Generate a Telegram deeplink that opens the Mini App directly
 * Format: https://t.me/[bot_username]/[app_name]?startapp=[params]
 * 
 * Note: This requires the Mini App to be set up in BotFather
 */
export function generateTelegramMiniAppLink(options: DeeplinkOptions): string {
  const { claimCode, secret, botUsername, frontendUrl } = options;
  
  if (!botUsername) {
    // Fallback to web link if bot username not available
    return generateWebLink(options);
  }

  // Encode claim code and secret as base64 for cleaner URLs
  const params = secret 
    ? Buffer.from(`${claimCode}:${secret}`).toString("base64url")
    : Buffer.from(claimCode).toString("base64url");
  
  // Telegram Mini App deeplink format
  // This opens the Mini App directly with the claim code
  return `https://t.me/${botUsername}?start=claim_${params}`;
}

/**
 * Generate a web link (works everywhere, opens in browser)
 */
export function generateWebLink(options: DeeplinkOptions): string {
  const { claimCode, secret, frontendUrl = "https://gifties-w3yr.vercel.app" } = options;
  
  const url = new URL(`${frontendUrl}/gifts/claim/${claimCode}`);
  if (secret) {
    url.searchParams.set("secret", secret);
  }
  
  return url.toString();
}

/**
 * Generate a smart link that detects the environment
 * - If opened in Telegram: uses Telegram deeplink
 * - If opened in browser: uses web link
 */
export function generateSmartGiftLink(options: DeeplinkOptions): {
  telegramLink: string;
  webLink: string;
  universalLink: string; // Works in both Telegram and web
} {
  const telegramLink = generateTelegramMiniAppLink(options);
  const webLink = generateWebLink(options);
  
  // Universal link that works in both contexts
  // When clicked in Telegram, it will open the Mini App
  // When clicked in browser, it will open the web page
  const universalLink = options.botUsername 
    ? `https://t.me/${options.botUsername}?start=claim_${Buffer.from(options.secret ? `${options.claimCode}:${options.secret}` : options.claimCode).toString("base64url")}`
    : webLink;
  
  return {
    telegramLink,
    webLink,
    universalLink,
  };
}

/**
 * Parse claim parameters from Telegram start parameter
 * Format: claim_[base64_encoded_claimCode:secret]
 */
export function parseTelegramStartParam(startParam: string): { claimCode?: string; secret?: string } | null {
  if (!startParam.startsWith("claim_")) {
    return null;
  }
  
  try {
    const encoded = startParam.replace("claim_", "");
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    
    if (parts.length === 2) {
      return { claimCode: parts[0], secret: parts[1] };
    } else if (parts.length === 1) {
      return { claimCode: parts[0] };
    }
  } catch (error) {
    console.error("Failed to parse Telegram start param:", error);
  }
  
  return null;
}

