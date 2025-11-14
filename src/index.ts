import { generatePersona, generateBirthdayMessages } from "./ai/adapter";
import { savePersonaSnapshot, saveGeneratedMessages } from "./ai/store";

async function main() {
  const persona = await generatePersona({
    snippets: [
      "Happy Friday team! Shipping the feature today 🚀",
      "Anyone up for coffee later?",
      "Loved that sci-fi book recommendation."
    ],
    stats: { emojisPer100: 5.2, topics: "shipping, coffee, sci-fi" },
    locale: "en"
  });

  const out = await generateBirthdayMessages(persona, {
    senderName: "Deborah",
    recipientHandle: "alex",
    relationship: "coworker"
  }, {
    tone: "heartfelt",
    maxChars: 220,
    variants: 2,
    locale: "en"
  });

  // eslint-disable-next-line no-console
  console.log({ persona, messages: out.messages });

  // Persist if Supabase configured (demo giftId placeholder)
  await savePersonaSnapshot("alex", persona, "auto");
  await saveGeneratedMessages("demo-gift-id", out.messages, "auto");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


