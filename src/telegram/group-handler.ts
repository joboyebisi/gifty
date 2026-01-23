import { Context } from "grammy";

/**
 * Helper to extract mentioned users from a Grammy context
 */
export function extractMentionedUser(ctx: Context): string | null {
  const entities = ctx.message?.entities;
  const text = ctx.message?.text;

  if (!entities || !text) return null;

  for (const entity of entities) {
    if (entity.type === "mention") {
      // Extract from text using offset and length
      return text.substring(entity.offset, entity.offset + entity.length).replace("@", "");
    }
    if (entity.type === "text_mention" && entity.user) {
      // User without username
      return entity.user.username || null;
    }
  }

  // Fallback: extract from text regex if no entities found (sometimes happens)
  const mentionMatch = text.match(/@(\w+)/);
  if (mentionMatch && mentionMatch[1]) {
    return mentionMatch[1];
  }

  return null;
}

/**
 * Helper to determine if the message is directed at the bot
 */
export async function isMentioned(ctx: Context): Promise<boolean> {
  if (!ctx.message?.text) return false;

  const botInfo = await ctx.api.getMe();
  const botUsername = botInfo.username;

  const entities = ctx.message.entities;
  if (entities) {
    for (const entity of entities) {
      if (entity.type === "mention") {
        const mentionText = ctx.message.text.substring(entity.offset, entity.offset + entity.length);
        if (mentionText === `@${botUsername}`) {
          return true;
        }
      }
    }
  }

  return false;
}
