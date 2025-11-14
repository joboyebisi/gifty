import { TelegramBot } from "./bot";
import { loadEnv } from "../config/env";

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name: string;
    last_name?: string;
  };
  text?: string;
  date: number;
}

export interface GroupMessageHistory {
  chatId: number;
  members: Map<number, {
    userId: number;
    username?: string;
    firstName: string;
    lastName?: string;
    messages: Array<{
      text: string;
      timestamp: number;
    }>;
  }>;
}

/**
 * Fetch recent messages from a Telegram group
 * Note: Telegram Bot API doesn't provide direct access to group message history
 * This would need to be implemented via:
 * 1. Webhook storage (store messages as they come in)
 * 2. Bot admin commands to export messages
 * 3. Integration with Telegram Client API (requires user's session)
 * 
 * For now, we'll create a structure that can work with stored messages
 */
export class GroupMessageFetcher {
  private bot: TelegramBot;

  constructor() {
    this.bot = new TelegramBot();
  }

  /**
   * Get message history for a group (from stored messages in database)
   * This assumes messages are stored when received via webhook
   */
  async getGroupMessageHistory(
    chatId: number,
    days: number = 30,
    limit: number = 1000
  ): Promise<GroupMessageHistory> {
    const { getSupabase } = await import("../db/supabase");
    const sb = getSupabase();
    
    if (!sb) {
      return { chatId, members: new Map() };
    }

    const members = new Map<number, {
      userId: number;
      username?: string;
      firstName: string;
      lastName?: string;
      messages: Array<{ text: string; timestamp: number }>;
    }>();

    try {
      // Calculate date threshold
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);

      // Query stored group messages
      const { data: messages, error } = await sb
        .from("group_messages")
        .select("*")
        .eq("chat_id", chatId.toString())
        .gte("message_date", dateThreshold.toISOString())
        .order("message_date", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching group messages:", error);
        return { chatId, members };
      }

      // Group messages by user
      for (const msg of messages || []) {
        const userId = parseInt(msg.user_id);
        if (!members.has(userId)) {
          members.set(userId, {
            userId,
            username: msg.username,
            firstName: msg.first_name || "User",
            lastName: msg.last_name,
            messages: [],
          });
        }

        const member = members.get(userId)!;
        if (msg.message_text) {
          member.messages.push({
            text: msg.message_text,
            timestamp: new Date(msg.message_date).getTime() / 1000,
          });
        }
      }
    } catch (error: any) {
      console.error("Error processing group message history:", error);
    }

    return {
      chatId,
      members,
    };
  }

  /**
   * Process Telegram update to extract group message
   * This should be called from webhook handler to store messages
   */
  static extractGroupMessage(update: any): TelegramMessage | null {
    if (!update.message) return null;
    
    const chat = update.message.chat;
    const isGroup = chat.type === "group" || chat.type === "supergroup";
    
    if (!isGroup) return null;

    return {
      message_id: update.message.message_id,
      from: {
        id: update.message.from.id,
        username: update.message.from.username,
        first_name: update.message.from.first_name,
        last_name: update.message.from.last_name,
      },
      text: update.message.text,
      date: update.message.date,
    };
  }

  /**
   * Convert GroupMessageHistory to format expected by analyzer
   */
  static toAnalyzerFormat(history: GroupMessageHistory): Array<{
    userId: number;
    username?: string;
    firstName: string;
    lastName?: string;
    messageCount: number;
    messages: Array<{ text: string; timestamp: number }>;
  }> {
    return Array.from(history.members.values()).map((member) => ({
      userId: member.userId,
      username: member.username,
      firstName: member.firstName,
      lastName: member.lastName,
      messageCount: member.messages.length,
      messages: member.messages,
    }));
  }
}

