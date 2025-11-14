import { loadEnv } from "../config/env";
import { generatePersona } from "./adapter";

export interface GroupMember {
  userId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  messageCount: number;
  messages: Array<{
    text: string;
    timestamp: number;
  }>;
}

export interface PersonalityProfile {
  userId: number;
  username?: string;
  traits: string[];
  interests: string[];
  communicationStyle: string;
  sentiment: "positive" | "neutral" | "negative";
  activityLevel: "high" | "medium" | "low";
  summary: string;
}

export interface GiftSuggestion {
  userId: number;
  username?: string;
  suggestedAmountUsdc?: number;
  suggestedProductIds?: string[]; // Goody product IDs
  reasoning: string;
  personalizedMessage?: string;
}

/**
 * Analyze group messages to extract personality profiles for each member
 */
export async function analyzeGroupMembers(members: GroupMember[]): Promise<PersonalityProfile[]> {
  const profiles: PersonalityProfile[] = [];

  for (const member of members) {
    if (member.messages.length === 0) {
      // Skip members with no messages
      profiles.push({
        userId: member.userId,
        username: member.username,
        traits: [],
        interests: [],
        communicationStyle: "unknown",
        sentiment: "neutral",
        activityLevel: "low",
        summary: "No message history available",
      });
      continue;
    }

    // Combine recent messages (last 50 messages or last 30 days)
    const recentMessages = member.messages
      .slice(-50)
      .map((m) => m.text)
      .join("\n");

    // Generate personality profile using AI
    try {
      const snippets = [
        `User: ${member.firstName} ${member.lastName || ""}`,
        `Username: ${member.username || "N/A"}`,
        `Message count: ${member.messageCount}`,
        `Recent messages:\n${recentMessages}`,
      ];

      const persona = await generatePersona(
        {
          snippets,
          stats: {
            messageCount: member.messageCount,
            avgMessageLength: member.messages.reduce((sum, m) => sum + m.text.length, 0) / member.messages.length,
          },
          locale: "en",
        },
        { provider: "gemini" }
      );

      // Parse persona to extract traits, interests, etc.
      const traits = extractTraits(persona);
      const interests = extractInterests(persona);
      const communicationStyle = extractCommunicationStyle(persona);
      const sentiment = analyzeSentiment(recentMessages);
      const activityLevel = member.messageCount > 100 ? "high" : member.messageCount > 20 ? "medium" : "low";

      profiles.push({
        userId: member.userId,
        username: member.username,
        traits,
        interests,
        communicationStyle,
        sentiment,
        activityLevel,
        summary: persona,
      });
    } catch (error: any) {
      console.error(`Error analyzing member ${member.userId}:`, error);
      // Fallback profile
      profiles.push({
        userId: member.userId,
        username: member.username,
        traits: [],
        interests: [],
        communicationStyle: "unknown",
        sentiment: "neutral",
        activityLevel: member.messageCount > 20 ? "medium" : "low",
        summary: "Analysis unavailable",
      });
    }
  }

  return profiles;
}

/**
 * Generate personalized gift suggestions based on personality profiles
 */
export async function generateGiftSuggestions(
  profiles: PersonalityProfile[],
  giftType: "usdc" | "goody" | "mixed" = "mixed"
): Promise<GiftSuggestion[]> {
  const suggestions: GiftSuggestion[] = [];

  for (const profile of profiles) {
    // Determine suggested USDC amount based on personality and activity
    let suggestedAmountUsdc: number | undefined;
    if (giftType === "usdc" || giftType === "mixed") {
      suggestedAmountUsdc = calculateSuggestedAmount(profile);
    }

    // Determine suggested Goody products based on interests
    let suggestedProductIds: string[] | undefined;
    if (giftType === "goody" || giftType === "mixed") {
      suggestedProductIds = await suggestGoodyProducts(profile);
    }

    // Generate personalized message
    const personalizedMessage = await generatePersonalizedMessage(profile);

    suggestions.push({
      userId: profile.userId,
      username: profile.username,
      suggestedAmountUsdc,
      suggestedProductIds,
      reasoning: generateReasoning(profile, suggestedAmountUsdc, suggestedProductIds),
      personalizedMessage,
    });
  }

  return suggestions;
}

/**
 * Calculate suggested USDC amount based on personality profile
 */
function calculateSuggestedAmount(profile: PersonalityProfile): number {
  let baseAmount = 25.0; // Default amount

  // Adjust based on activity level
  if (profile.activityLevel === "high") {
    baseAmount += 15.0;
  } else if (profile.activityLevel === "low") {
    baseAmount -= 5.0;
  }

  // Adjust based on sentiment
  if (profile.sentiment === "positive") {
    baseAmount += 10.0;
  } else if (profile.sentiment === "negative") {
    baseAmount -= 5.0;
  }

  // Adjust based on communication style (leaders, helpers get more)
  if (profile.communicationStyle.includes("leader") || profile.communicationStyle.includes("helpful")) {
    baseAmount += 10.0;
  }

  // Ensure minimum and maximum bounds
  return Math.max(10.0, Math.min(100.0, baseAmount));
}

/**
 * Suggest Goody products based on interests and personality
 */
async function suggestGoodyProducts(profile: PersonalityProfile): Promise<string[]> {
  // This would integrate with Goody API to search products
  // For now, return empty array - will be implemented with product search
  const env = loadEnv();
  
  try {
    const { GoodyClient } = await import("../goody/client");
    const goodyClient = new GoodyClient();

    // Search products based on interests
    const searchTerms = profile.interests.slice(0, 3); // Top 3 interests
    const productIds: string[] = [];

    for (const term of searchTerms) {
      try {
        const results = await goodyClient.searchProducts(term);
        if (results.data && results.data.length > 0) {
          // Take top 2 products per interest
          productIds.push(...results.data.slice(0, 2).map((p) => p.id));
        }
      } catch (error) {
        console.error(`Error searching products for ${term}:`, error);
      }
    }

    // Return unique product IDs (max 5)
    return [...new Set(productIds)].slice(0, 5);
  } catch (error) {
    console.error("Error suggesting Goody products:", error);
    return [];
  }
}

/**
 * Generate personalized message for recipient
 */
async function generatePersonalizedMessage(profile: PersonalityProfile): Promise<string> {
  const env = loadEnv();
  
  try {
    const { generateBirthdayMessages } = await import("./adapter");
    
    const messages = await generateBirthdayMessages(
      profile.summary,
      {
        senderName: "Your Team",
        recipientHandle: profile.username || profile.userId.toString(),
        relationship: "colleague",
      },
      {
        tone: "appreciative",
        maxChars: 200,
        variants: 1,
        locale: "en",
      },
      { provider: "gemini" }
    );

    return messages.messages && messages.messages.length > 0
      ? messages.messages[0]
      : `Thank you for being an amazing team member! Your ${profile.communicationStyle} communication style and ${profile.traits[0] || "positive"} attitude make a difference.`;
  } catch (error) {
    console.error("Error generating personalized message:", error);
    // Fallback message based on profile
    const trait = profile.traits[0] || "positive";
    return `Thank you for being part of our team! Your ${trait} contributions are valued.`;
  }
}

/**
 * Generate reasoning for gift suggestion
 */
function generateReasoning(
  profile: PersonalityProfile,
  amount?: number,
  productIds?: string[]
): string {
  const reasons: string[] = [];

  if (amount) {
    reasons.push(`Suggested ${amount.toFixed(2)} USDC based on ${profile.activityLevel} activity level`);
  }

  if (profile.traits.length > 0) {
    reasons.push(`Personality traits: ${profile.traits.slice(0, 3).join(", ")}`);
  }

  if (profile.interests.length > 0 && productIds && productIds.length > 0) {
    reasons.push(`Product suggestions based on interests: ${profile.interests.slice(0, 2).join(", ")}`);
  }

  return reasons.join(". ") || "Standard team gift suggestion.";
}

/**
 * Extract traits from AI-generated persona
 */
function extractTraits(persona: string): string[] {
  const traits: string[] = [];
  const traitKeywords: Record<string, string[]> = {
    leader: ["leader", "leadership", "guides", "directs"],
    creative: ["creative", "artistic", "innovative", "imaginative"],
    analytical: ["analytical", "logical", "detail-oriented", "precise"],
    social: ["social", "outgoing", "friendly", "extroverted"],
    helpful: ["helpful", "supportive", "collaborative", "team player"],
    technical: ["technical", "tech-savvy", "developer", "engineer"],
  };

  const personaLower = persona.toLowerCase();
  for (const [trait, keywords] of Object.entries(traitKeywords)) {
    if (keywords.some((keyword) => personaLower.includes(keyword))) {
      traits.push(trait);
    }
  }

  return traits.length > 0 ? traits : ["friendly", "engaged"];
}

/**
 * Extract interests from AI-generated persona
 */
function extractInterests(persona: string): string[] {
  const interests: string[] = [];
  const interestKeywords: Record<string, string[]> = {
    technology: ["tech", "coding", "programming", "software", "developer", "engineer"],
    gaming: ["game", "gaming", "play", "gamer"],
    music: ["music", "song", "artist", "musical"],
    sports: ["sport", "fitness", "exercise", "athletic"],
    travel: ["travel", "trip", "journey", "adventure"],
    food: ["food", "cooking", "restaurant", "cuisine", "recipe"],
    art: ["art", "design", "creative", "artistic", "drawing"],
    books: ["book", "reading", "literature", "novel"],
  };

  const personaLower = persona.toLowerCase();
  for (const [interest, keywords] of Object.entries(interestKeywords)) {
    if (keywords.some((keyword) => personaLower.includes(keyword))) {
      interests.push(interest);
    }
  }

  return interests.length > 0 ? interests : ["general"];
}

/**
 * Extract communication style from AI-generated persona
 */
function extractCommunicationStyle(persona: string): string {
  const personaLower = persona.toLowerCase();
  
  if (personaLower.includes("leader") || personaLower.includes("direct")) {
    return "leader";
  }
  if (personaLower.includes("helpful") || personaLower.includes("supportive")) {
    return "helpful";
  }
  if (personaLower.includes("analytical") || personaLower.includes("detail")) {
    return "analytical";
  }
  if (personaLower.includes("creative") || personaLower.includes("artistic")) {
    return "creative";
  }
  if (personaLower.includes("social") || personaLower.includes("outgoing")) {
    return "social";
  }
  
  return "friendly";
}

/**
 * Analyze sentiment from messages
 */
function analyzeSentiment(messages: string): "positive" | "neutral" | "negative" {
  const positiveWords = ["great", "awesome", "thanks", "thank", "love", "amazing", "excellent", "wonderful", "happy", "excited"];
  const negativeWords = ["bad", "terrible", "hate", "awful", "worst", "sad", "angry", "frustrated", "disappointed"];

  const text = messages.toLowerCase();
  const positiveCount = positiveWords.filter((word) => text.includes(word)).length;
  const negativeCount = negativeWords.filter((word) => text.includes(word)).length;

  if (positiveCount > negativeCount * 1.5) {
    return "positive";
  } else if (negativeCount > positiveCount * 1.5) {
    return "negative";
  }
  return "neutral";
}

