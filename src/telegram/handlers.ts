import { TelegramBot } from "./bot";
import { loadEnv } from "../config/env";
import { getUserByWallet, createOrUpdateUser, getUserByTelegramId, getUserByTelegramHandle } from "../users/users";
import { getUpcomingBirthdays, createBirthday, getBirthdayById } from "../birthdays/birthdays";
import { generatePersona, generateBirthdayMessages } from "../ai/adapter";
import { CircleWalletClient } from "../circle/wallet";
import { GoodyClient } from "../goody/client";
import { createGift } from "../gifts/gifts";
import { CCTPClient } from "../circle/cctp";

export async function handleCallbackQuery(update: any): Promise<void> {
  const bot = new TelegramBot();
  const env = loadEnv();
  const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";
  
  const callbackQuery = update.callback_query;
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  // Answer callback query to remove loading state
  try {
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error("Error answering callback query:", error);
  }

  if (data === "birthdays") {
    await handleBirthdaysCommand(bot, chatId, userId);
  } else if (data === "check_wallet") {
    await handleWalletCommand(bot, chatId, userId);
  } else if (data === "compose") {
    await bot.sendMessage(chatId, `✍️ <b>Compose Gift</b>\n\nOpening Mini App to compose your gift...`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎁 Open Gifties",
              web_app: { url: `${frontendUrl}/compose` },
            },
          ],
        ],
      },
    });
  } else if (data.startsWith("birthday_")) {
    const birthdayId = data.replace("birthday_", "");
    await handleBirthdayDetail(bot, chatId, userId, birthdayId);
    } else if (data.startsWith("gift_")) {
      const handle = data.replace("gift_", "");
      await handleGiftForHandle(bot, chatId, userId, handle);
    } else if (data.startsWith("send_goody_")) {
      // Parse: send_goody_<productId>_<handle>_<birthdayId>
      // Handle and birthdayId are optional
      const payload = data.replace("send_goody_", "");
      const parts = payload.split("_");
      const productId = parts[0];
      const handle = parts.length > 1 && parts[1] ? parts[1] : undefined;
      const birthdayId = parts.length > 2 && parts[2] ? parts[2] : undefined;
      await handleSendGoodyGift(bot, chatId, userId, productId, handle, birthdayId);
    } else if (data.startsWith("send_usdc_")) {
      // Handle both birthday ID and handle formats
      const payload = data.replace("send_usdc_", "");
      if (payload.startsWith("handle_")) {
        // Format: send_usdc_handle_username
        const handle = payload.replace("handle_", "");
        await handleSendUSDCGift(bot, chatId, userId, undefined, handle);
      } else {
        // Format: send_usdc_birthdayId
        const birthdayId = payload;
        await handleSendUSDCGift(bot, chatId, userId, birthdayId);
      }
    } else if (data.startsWith("copy_claim_code_")) {
      const claimCode = data.replace("copy_claim_code_", "");
      await bot.answerCallbackQuery(callbackQuery.id, `Claim code: ${claimCode}`, false);
    } else if (data.startsWith("copy_gift_")) {
      const claimCode = data.replace("copy_gift_", "");
      await bot.answerCallbackQuery(callbackQuery.id, `Gift link copied! Share it with the recipient.`, false);
    } else if (data === "refresh_balance") {
      await handleWalletCommand(bot, chatId, userId);
    }
}

export async function handleSendGoodyGift(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  productId: string,
  recipientHandle?: string,
  birthdayId?: string
): Promise<void> {
  try {
    await bot.sendMessage(chatId, `🛒 Creating gift order...`, {
      parse_mode: "HTML",
    });

    const goodyClient = new GoodyClient();
    const user = await getUserByTelegramId(userId.toString());

    if (!user) {
      await bot.sendMessage(chatId, `❌ User not found. Please connect your wallet first.`);
      return;
    }

    // Get product details to check price
    const products = await goodyClient.getProducts(1, 100);
    const product = products.data.find(p => p.id === productId);
    
    if (!product) {
      await bot.sendMessage(chatId, `❌ Product not found.`);
      return;
    }

    const productPrice = product.price / 100; // Convert cents to dollars
    const shippingPrice = product.brand.shipping_price / 100;
    const totalPrice = productPrice + shippingPrice;

    // Check wallet balance if Circle wallet ID is available
    let balance = "0";
    let hasEnoughFunds = false;
    if (user.circleWalletId) {
      try {
        const circleClient = new CircleWalletClient();
        balance = await circleClient.getWalletBalance(user.circleWalletId);
        const balanceNum = parseFloat(balance);
        const totalPriceNum = totalPrice;
        hasEnoughFunds = balanceNum >= totalPriceNum;
        
        if (!hasEnoughFunds) {
          await bot.sendMessage(chatId, `⚠️ <b>Insufficient Funds</b>\n\n💰 Your balance: $${balanceNum.toFixed(2)} USDC\n💵 Required: $${totalPriceNum.toFixed(2)} USDC\n\nPlease fund your wallet to send this gift.\n\n📍 Wallet Address:\n<code>${user.walletAddress}</code>`, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💼 Check Wallet",
                    callback_data: "refresh_balance",
                  },
                ],
              ],
            },
          });
          return;
        }
      } catch (balanceError: any) {
        console.error("Error checking balance:", balanceError);
        // Continue anyway - Goody will handle payment
      }
    }

    // Get recipient info
    let recipientEmail: string | undefined;
    let recipientName = recipientHandle ? recipientHandle.replace("@", "") : "Friend";
    let personalizedMessage = "Enjoy your gift!";
    
    if (birthdayId) {
      // Get birthday data for personalized message
      const birthday = await getBirthdayById(birthdayId);
      if (birthday) {
        recipientName = birthday.telegramHandle ? birthday.telegramHandle.replace("@", "") : birthday.email || recipientName;
        recipientEmail = birthday.email;
        
        // Generate personalized message
        const personaSummary = await generatePersona({
          snippets: [
            `Birthday: ${birthday.month}/${birthday.day}`,
            `Name: ${recipientName}`,
            birthday.email ? `Email: ${birthday.email}` : "",
          ].filter(Boolean),
          stats: {},
          locale: "en",
        });
        
        const messages = await generateBirthdayMessages(personaSummary, {}, {});
        personalizedMessage = messages.messages && messages.messages.length > 0 ? messages.messages[0] : "Happy Birthday! Enjoy your gift!";
      }
    } else if (recipientHandle) {
      // Try to find recipient user by Telegram handle
      const recipientUser = await getUserByTelegramHandle(recipientHandle);
      if (recipientUser?.email) {
        recipientEmail = recipientUser.email;
      }
      if (recipientUser?.telegramHandle) {
        recipientName = recipientUser.telegramHandle;
      }
    }

    // Create order batch
    const orderBatch = await goodyClient.createOrderBatch({
      from_name: user.telegramHandle || user.walletAddress?.slice(0, 10) || "Friend",
      send_method: "link_multiple_custom_list",
      recipients: [
        {
          first_name: recipientName,
          email: recipientEmail,
        },
      ],
      cart: {
        items: [
          {
            product_id: productId,
            quantity: 1,
          },
        ],
      },
      message: personalizedMessage,
    });

    if (orderBatch.orders_preview && orderBatch.orders_preview.length > 0) {
      const order = orderBatch.orders_preview[0];
      const giftLink = order.individual_gift_link;

      let message = `✅ <b>Gift Created Successfully!</b>\n\n`;
      message += `🎁 <b>Gift:</b> ${product.name}\n`;
      message += `💵 <b>Total:</b> $${totalPrice.toFixed(2)}\n`;
      if (hasEnoughFunds && user.circleWalletId) {
        message += `💰 <b>Balance after:</b> $${(parseFloat(balance) - totalPrice).toFixed(2)} USDC\n\n`;
      }
      message += `🔗 <b>Gift Link:</b>\n<code>${giftLink}</code>\n\n`;
      message += `Share this link with ${recipientName} to claim their gift!`;

      await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📋 Open Gift Link",
                url: giftLink,
              },
            ],
          ],
        },
      });
    } else {
      await bot.sendMessage(chatId, `✅ Gift order created! Check your Goody account for the gift link.`);
    }
  } catch (error: any) {
    console.error("Error sending Goody gift:", error);
    await bot.sendMessage(chatId, `❌ Error creating gift: ${error.message}\n\nPlease try again or contact support.`);
  }
}

/**
 * Handle sending USDC gift - Creates a claimable gift link
 * Can be called with birthdayId (from birthday) or with handle (from /sendgift)
 */
export async function handleSendUSDCGift(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  birthdayId?: string,
  recipientHandle?: string,
  amount?: number
): Promise<void> {
  try {
    const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";
    
    await bot.sendMessage(chatId, `💰 Creating USDC gift...`, {
      parse_mode: "HTML",
    });

    // Get sender's wallet info
    const sender = await getUserByTelegramId(userId.toString());
    if (!sender?.walletAddress) {
      await bot.sendMessage(
        chatId,
        `❌ Wallet not connected. Please connect your wallet first.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect Wallet",
                  web_app: { url: frontendUrl },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Get recipient info
    let recipientUser: any = null;
    let recipientName = "";
    let giftMessage = "🎁 Here's a gift for you!";

    if (birthdayId) {
      // Get birthday info
      const birthday = await getBirthdayById(birthdayId);
      if (!birthday) {
        await bot.sendMessage(chatId, `❌ Birthday not found.`);
        return;
      }
      recipientName = birthday.telegramHandle ? `@${birthday.telegramHandle}` : birthday.email || "Friend";
      recipientUser = birthday.telegramHandle 
        ? await getUserByTelegramHandle(birthday.telegramHandle)
        : null;
      
      // Generate personalized message for birthday
      try {
        const personaSummary = await generatePersona({
          snippets: [
            `Birthday: ${birthday.month}/${birthday.day}`,
            `Name: ${recipientName}`,
            birthday.email ? `Email: ${birthday.email}` : "",
          ].filter(Boolean),
          stats: {},
          locale: "en",
        });
        const messages = await generateBirthdayMessages(personaSummary, {}, {});
        if (messages.messages && messages.messages.length > 0) {
          giftMessage = messages.messages[0];
        }
      } catch (aiError) {
        console.error("Error generating message:", aiError);
        giftMessage = `🎂 Happy Birthday! Here's a gift for you!`;
      }
    } else if (recipientHandle) {
      // Get recipient by handle
      recipientName = `@${recipientHandle}`;
      recipientUser = await getUserByTelegramHandle(recipientHandle);
      if (!recipientUser) {
        await bot.sendMessage(
          chatId,
          `❌ User ${recipientName} not found. They need to connect their wallet first.`,
          { parse_mode: "HTML" }
        );
        return;
      }
      
      // Generate personalized message
      try {
        const personaSummary = await generatePersona({
          snippets: [`User handle: ${recipientName}`],
          stats: {},
          locale: "en",
        });
        const messages = await generateBirthdayMessages(personaSummary, {}, {});
        if (messages.messages && messages.messages.length > 0) {
          giftMessage = messages.messages[0];
        }
      } catch (aiError) {
        console.error("Error generating message:", aiError);
        giftMessage = `🎁 Here's a gift for you!`;
      }
    } else {
      await bot.sendMessage(chatId, `❌ Recipient not specified.`);
      return;
    }

    // Default amount if not provided
    const giftAmount = amount || 10; // Default 10 USDC

    // Check sender's balance
    await bot.sendMessage(chatId, `💰 Checking balance...`, { parse_mode: "HTML" });
    
    const { getChainBalances } = await import("../blockchain/balance");
    const balances = await getChainBalances(sender.walletAddress, "11155111"); // Sepolia
    const usdcBalance = parseFloat(balances.usdc.balanceFormatted || "0");

    if (usdcBalance < giftAmount) {
      await bot.sendMessage(
        chatId,
        `❌ <b>Insufficient Balance</b>\n\n` +
        `Required: ${giftAmount.toFixed(2)} USDC\n` +
        `Available: ${usdcBalance.toFixed(2)} USDC\n\n` +
        `💡 <b>Options:</b>\n` +
        `1. Fund your wallet with USDC on Sepolia\n` +
        `2. Use /swap 0.1 ETH to convert ETH to USDC\n` +
        `3. Use /swap 0.1 ETH @${recipientHandle ? recipientHandle.replace("@", "") : "friend"} to swap and create gift`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💱 Swap ETH to USDC",
                  callback_data: `swap_for_gift_${recipientHandle || birthdayId || ""}`,
                },
              ],
              [
                {
                  text: "💼 View Wallet",
                  callback_data: "check_wallet",
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Create USDC gift
    await bot.sendMessage(
      chatId,
      `🎁 <b>Creating USDC Gift...</b>\n\n` +
      `💰 Amount: ${giftAmount.toFixed(2)} USDC\n` +
      `👤 Recipient: ${recipientName}\n` +
      `📍 Destination: Arc Testnet\n\n` +
      `Generating claimable gift link...`,
      { parse_mode: "HTML" }
    );

    try {
      // Create gift record
      const gift = await createGift({
        senderUserId: userId.toString(),
        recipientHandle: recipientUser?.telegramHandle || recipientName.replace("@", ""),
        recipientEmail: recipientUser?.email,
        amountUsdc: (giftAmount * 1000000).toString(), // Amount in smallest unit (6 decimals)
        srcChain: "eth-sepolia",
        dstChain: "arc-testnet",
        message: giftMessage,
        expiresInDays: 30,
        senderWalletAddress: sender.walletAddress,
      });

      // Generate deeplinks (Telegram and web)
      const { generateSmartGiftLink } = await import("../utils/telegram-deeplink");
      const links = generateSmartGiftLink({
        claimCode: gift.claimCode,
        secret: gift.claimSecret,
        botUsername: env.TELEGRAM_BOT_USERNAME,
        frontendUrl,
      });
      
      const giftLink = links.webLink;
      const giftTelegramLink = links.telegramLink;
      const giftShortLink = `${frontendUrl}/gifts/${gift.claimCode}`;

      await bot.sendMessage(
        chatId,
        `✅ <b>USDC Gift Created!</b>\n\n` +
        `🎁 <b>Gift for:</b> ${recipientName}\n` +
        `💰 <b>Amount:</b> ${giftAmount.toFixed(2)} USDC\n` +
        `📍 <b>Destination:</b> Arc Testnet\n\n` +
        `💬 <b>Message:</b>\n${giftMessage}\n\n` +
        `🔗 <b>Gift Link (Web):</b>\n` +
        `<code>${giftShortLink}</code>\n\n` +
        (giftTelegramLink ? `📱 <b>Telegram Link:</b>\n<code>${giftTelegramLink}</code>\n\n` : "") +
        `📋 <b>Claim Code:</b> <code>${gift.claimCode}</code>\n` +
        (gift.claimSecret ? `🔐 <b>Secret:</b> <code>${gift.claimSecret}</code>\n` : "") +
        `\n✨ <b>Share this link with ${recipientName} to claim their gift!</b>\n\n` +
        `💡 <b>Tip:</b> Use the Telegram link to open directly in Telegram Mini App!\n` +
        `💡 <b>Note:</b> The gift will be transferred when ${recipientName} claims it.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📱 Open in Telegram",
                  url: giftTelegramLink || giftLink,
                },
                {
                  text: "🔗 Share Web Link",
                  url: `https://t.me/share/url?url=${encodeURIComponent(giftLink)}&text=${encodeURIComponent(`🎁 You have a gift! Claim ${giftAmount.toFixed(2)} USDC: ${giftLink}`)}`,
                },
              ],
              [
                {
                  text: "📋 Copy Gift Link",
                  callback_data: `copy_gift_${gift.claimCode}`,
                },
                {
                  text: "💼 View Wallet",
                  callback_data: "check_wallet",
                },
              ],
            ],
          },
        }
      );
    } catch (giftError: any) {
      console.error("Error creating USDC gift:", giftError);
      await bot.sendMessage(
        chatId,
        `❌ <b>Failed to Create Gift</b>\n\n${giftError.message}\n\nPlease try again or contact support.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (error: any) {
    console.error("Error sending USDC gift:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

export async function handleBirthdaysCommand(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
  try {
    const env = loadEnv();
    // Get user's wallet to find their birthdays
    const user = await getUserByTelegramId(userId.toString());
    if (!user) {
      await bot.sendMessage(chatId, `❌ Please connect your wallet first to view birthdays.\n\nUse /wallet to connect.`, {
        parse_mode: "HTML",
      });
      return;
    }

    const allBirthdays = await getUpcomingBirthdays(30);
    
    // Filter birthdays for this user (by user_id or telegram_handle)
    const userBirthdays = allBirthdays.filter(
      (bday) => bday.userId === user.id || bday.telegramHandle === user.telegramHandle
    );
    
    if (userBirthdays.length === 0) {
      await bot.sendMessage(chatId, `🎂 <b>Upcoming Birthdays</b>\n\nNo upcoming birthdays in the next 30 days.\n\nAdd birthdays using the Mini App or contact birthdays.`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎁 Open Mini App",
                web_app: { url: `${env.FRONTEND_URL || "https://gifties-w3yr.vercel.app"}/birthdays` },
              },
            ],
          ],
        },
      });
      return;
    }

    let message = `🎂 <b>Upcoming Birthdays</b>\n\n`;
    const keyboard = [];
    
    for (const bday of userBirthdays.slice(0, 10)) {
      const today = new Date();
      const bdayDate = new Date(today.getFullYear(), bday.month - 1, bday.day);
      const daysUntil = Math.ceil((bdayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const name = bday.telegramHandle ? `@${bday.telegramHandle}` : bday.email || "Friend";
      const emoji = daysUntil === 0 ? "🎉" : daysUntil <= 7 ? "🎂" : "📅";
      message += `${emoji} <b>${name}</b>\n`;
      message += `   ${daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`} - ${bday.month}/${bday.day}\n\n`;
      
      keyboard.push([
        {
          text: `🎁 Send Gift to ${name}`,
          callback_data: `birthday_${bday.id}`,
        },
      ]);
    }
    
    keyboard.push([
      {
        text: "🎁 Open Mini App for More",
        web_app: { url: `${env.FRONTEND_URL || "https://gifties-w3yr.vercel.app"}/birthdays` },
      },
    ]);

    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error: any) {
    console.error("Error handling birthdays command:", error);
    await bot.sendMessage(chatId, `❌ Error loading birthdays: ${error.message}`);
  }
}

export async function handleBirthdayDetail(bot: TelegramBot, chatId: number, userId: number, birthdayId: string): Promise<void> {
  try {
    await bot.sendMessage(chatId, `🎁 Generating personalized gift suggestion...`, {
      parse_mode: "HTML",
    });

    // Get birthday data
    const birthday = await getBirthdayById(birthdayId);
    if (!birthday) {
      await bot.sendMessage(chatId, `❌ Birthday not found.`);
      return;
    }

    const name = birthday.telegramHandle ? `@${birthday.telegramHandle}` : birthday.email || "Friend";
    
    // Generate persona based on birthday data
    const personaSummary = await generatePersona({
      snippets: [
        `Birthday: ${birthday.month}/${birthday.day}`,
        `Name: ${name}`,
        birthday.email ? `Email: ${birthday.email}` : "",
      ].filter(Boolean),
      stats: {},
      locale: "en",
    });

    const messages = await generateBirthdayMessages(
      personaSummary,
      {},
      {}
    );

    // Search for gifts using Goody API
    const goodyClient = new GoodyClient();
    const products = await goodyClient.searchProducts("birthday gift");

    let message = `🎁 <b>Gift Suggestion for ${name}</b>\n\n`;
    message += `🎂 Birthday: ${birthday.month}/${birthday.day}\n\n`;
    const firstMessage = messages.messages && messages.messages.length > 0 ? messages.messages[0] : "Happy Birthday!";
    message += `💬 <b>Personalized Message:</b>\n${firstMessage}\n\n`;
    
    if (products.data.length > 0) {
      message += `🎁 <b>Suggested Gift:</b>\n`;
      message += `${products.data[0].name} - $${(products.data[0].price / 100).toFixed(2)}\n`;
      message += `Brand: ${products.data[0].brand.name}\n\n`;
      message += `Would you like to send this gift?`;
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Send Gift via Goody",
              callback_data: `send_goody_${products.data[0]?.id || ""}_${birthday.telegramHandle || ""}_${birthdayId}`,
            },
          ],
          [
            {
              text: "💰 Send USDC Gift (Create Claimable Link)",
              callback_data: `send_usdc_${birthdayId}`,
            },
          ],
        ],
      },
    });
  } catch (error: any) {
    console.error("Error handling birthday detail:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

export async function handleGiftForHandle(bot: TelegramBot, chatId: number, userId: number, handle: string): Promise<void> {
  try {
    await bot.sendMessage(chatId, `🎁 Generating gift suggestion for @${handle}...`, {
      parse_mode: "HTML",
    });

    // Generate persona based on handle (you'd need to fetch user data)
    const personaSummary = await generatePersona({
      snippets: [`User handle: @${handle}`],
      stats: {},
      locale: "en",
    });

    const messages = await generateBirthdayMessages(
      personaSummary,
      {},
      {}
    );

    // Search for gifts
    const goodyClient = new GoodyClient();
    const products = await goodyClient.searchProducts("gift");

    let message = `🎁 <b>Gift for @${handle}</b>\n\n`;
    const firstMessage = messages.messages && messages.messages.length > 0 ? messages.messages[0] : "Here's a gift for you!";
    message += `💬 <b>Personalized Message:</b>\n${firstMessage}\n\n`;
    
    if (products.data.length > 0) {
      message += `🎁 <b>Suggested Physical Gift:</b>\n`;
      message += `${products.data[0].name} - $${(products.data[0].price / 100).toFixed(2)}\n`;
      message += `Brand: ${products.data[0].brand.name}\n\n`;
    }

    message += `💡 <b>Choose gift type:</b>`;

    // Create inline keyboard with both options
    const keyboard = [];
    
    if (products.data.length > 0) {
      keyboard.push([
        {
          text: "📦 Send Physical Gift via Goody",
          callback_data: `send_goody_${products.data[0].id}_${handle}`,
        },
      ]);
    }
    
    keyboard.push([
      {
        text: "💰 Send USDC Gift (Create Claimable Link)",
        callback_data: `send_usdc_handle_${handle}`,
      },
    ]);

    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error: any) {
    console.error("Error handling gift for handle:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

export async function handleWalletCommand(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
  try {
    const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";
    const user = await getUserByTelegramId(userId.toString());
    
    if (!user?.walletAddress) {
      await bot.sendMessage(chatId, `💼 <b>Wallet</b>\n\nNo wallet connected yet.\n\nConnect your wallet in the Mini App to get started.`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔗 Connect Wallet",
                web_app: { url: `${frontendUrl}` },
              },
            ],
          ],
        },
      });
      return;
    }

    // Get balances for Sepolia (ETH and USDC)
    let sepoliaBalances: any = null;
    let arcBalance: any = null;
    let balanceError: string | null = null;
    
    try {
      const { getChainBalances, getWalletBalance } = await import("../blockchain/balance");
      
      // Get Sepolia balances (ETH and USDC)
      try {
        sepoliaBalances = await getChainBalances(user.walletAddress, "11155111"); // Sepolia
        console.log(`✅ Sepolia balances fetched: ETH=${sepoliaBalances.native.balanceFormatted}, USDC=${sepoliaBalances.usdc.balanceFormatted}`);
      } catch (sepoliaError: any) {
        console.error("Error fetching Sepolia balances:", sepoliaError);
        balanceError = `Sepolia: ${sepoliaError.message}`;
      }
      
      // Also get Arc Testnet balance for backwards compatibility
      try {
        arcBalance = await getWalletBalance(user.walletAddress, "117000"); // Arc Testnet
        console.log(`✅ Arc balance: ${arcBalance.balanceFormatted} USDC`);
      } catch (arcError: any) {
        console.error("Error fetching Arc balance:", arcError);
        // Non-critical error, continue
      }
      
      // Try Circle API as fallback (if Circle wallet ID exists)
      if (user.circleWalletId && (!sepoliaBalances || (!sepoliaBalances.usdc.balance || sepoliaBalances.usdc.balance === "0"))) {
        try {
          const { CircleWalletClient } = await import("../circle/wallet");
          const circleClient = new CircleWalletClient();
          const circleBalance = await circleClient.getWalletBalance(user.circleWalletId);
          const circleBalanceNum = parseFloat(circleBalance);
          
          if (circleBalanceNum > 0) {
            // Update USDC balance if Circle has more
            if (!sepoliaBalances) {
              sepoliaBalances = {
                native: { balance: "0", balanceFormatted: "0.000000", error: undefined },
                usdc: { balance: circleBalance, balanceFormatted: circleBalanceNum.toFixed(2), error: undefined },
                chainId: "circle",
                chainName: "Circle Wallet",
              };
            } else if (circleBalanceNum > parseFloat(sepoliaBalances.usdc.balance || "0")) {
              sepoliaBalances.usdc.balance = circleBalance;
              sepoliaBalances.usdc.balanceFormatted = circleBalanceNum.toFixed(2);
            }
            console.log(`✅ Circle API balance: ${circleBalance} USDC`);
          }
        } catch (circleError: any) {
          console.error("Circle API balance check failed:", circleError);
          // Non-critical error, continue
        }
      }
    } catch (error: any) {
      console.error("Could not fetch balances:", error);
      balanceError = error.message || "Unable to fetch balances";
    }
    
    let message = `💼 <b>Your Wallet</b>\n\n`;
    message += `📍 <b>Address:</b>\n<code>${user.walletAddress}</code>\n\n`;
    
    // Display Sepolia balances (ETH and USDC)
    if (sepoliaBalances) {
      message += `🌐 <b>Ethereum Sepolia</b>\n`;
      
      // ETH Balance
      const ethBalance = parseFloat(sepoliaBalances.native.balanceFormatted || "0");
      const ethDisplay = ethBalance > 0 ? ethBalance.toFixed(6) : "0.000000";
      message += `⚡ <b>ETH:</b> ${ethDisplay} ETH`;
      if (sepoliaBalances.native.error) {
        message += ` ⚠️ (${sepoliaBalances.native.error})`;
      }
      message += `\n`;
      
      // USDC Balance
      const usdcBalance = parseFloat(sepoliaBalances.usdc.balanceFormatted || "0");
      const usdcDisplay = usdcBalance > 0 ? usdcBalance.toFixed(2) : "0.00";
      message += `💰 <b>USDC:</b> ${usdcDisplay} USDC`;
      if (sepoliaBalances.usdc.error) {
        message += ` ⚠️ (${sepoliaBalances.usdc.error})`;
      }
      message += `\n\n`;
      
      // Show funding instructions if no funds
      if (ethBalance === 0 && usdcBalance === 0) {
        message += `⚠️ <b>No Funds on Sepolia</b>\n\n`;
        message += `💡 <b>Fund your wallet:</b>\n`;
        message += `1. Copy the address above\n`;
        message += `2. Send ETH Sepolia for gas fees\n`;
        message += `3. Send USDC Sepolia for gifts\n`;
        message += `4. Use CCTP to transfer USDC between chains\n`;
        message += `5. Click "🔄 Refresh Balance" to update\n\n`;
      } else {
        if (usdcBalance > 0) {
          message += `✅ <b>Wallet Funded:</b> You have ${usdcDisplay} USDC ready to use!\n\n`;
        }
        if (ethBalance > 0) {
          message += `✅ <b>Gas Available:</b> ${ethDisplay} ETH for transactions\n\n`;
        }
      }
    } else if (balanceError) {
      message += `⚠️ <b>Balance:</b> Error checking balances\n`;
      message += `<code>${balanceError}</code>\n\n`;
      message += `💡 <b>Tip:</b> If you just funded your wallet, wait a moment and refresh.\n\n`;
    }
    
    // Also show Arc Testnet balance if available
    if (arcBalance && !arcBalance.error) {
      const arcUsdc = parseFloat(arcBalance.balanceFormatted || "0");
      if (arcUsdc > 0) {
        message += `🔷 <b>Arc Testnet</b>\n`;
        message += `💰 <b>USDC:</b> ${arcUsdc.toFixed(2)} USDC\n\n`;
      }
    }
    
    message += `🔗 <b>Quick Actions:</b>`;

    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💼 View Wallet in App",
              web_app: { url: `${frontendUrl}/wallet` },
            },
          ],
          [
            {
              text: "🔄 Refresh Balance",
              callback_data: `refresh_balance`,
            },
          ],
        ],
      },
    });
  } catch (error: any) {
    console.error("Error handling wallet command:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

export async function handleSendGiftCommand(bot: TelegramBot, chatId: number, userId: number, handle?: string): Promise<void> {
  try {
    const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";
    
    if (!handle) {
      await bot.sendMessage(
        chatId,
        `🎁 <b>Send Gift</b>\n\nUsage: /sendgift @username\n\nExample: /sendgift @friendname\n\nThis will:\n1. Generate a personalized AI message\n2. Create a USDC gift with claimable link\n3. Provide you with the gift link and secret to share`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎁 Open Mini App to Compose",
                  web_app: { url: `${frontendUrl}/compose` },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Automatically create USDC gift with claimable link and secret
    // This is the main flow: /sendgift @username creates the gift immediately
    await handleSendUSDCGift(bot, chatId, userId, undefined, handle);
  } catch (error: any) {
    console.error("Error handling send gift command:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

/**
 * Handle /giftlink command - Show pending gifts for the user
 */
export async function handleGiftLinkCommand(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
  try {
    const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";
    
    await bot.sendMessage(chatId, `🔍 Checking for your gifts...`, {
      parse_mode: "HTML",
    });

    // Get user info to find their handle
    const user = await getUserByTelegramId(userId.toString());
    if (!user) {
      await bot.sendMessage(
        chatId,
        `❌ User not found. Please connect your wallet first.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect Wallet",
                  web_app: { url: frontendUrl },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Get pending gifts for this user
    const { getGiftsForRecipient } = await import("../gifts/gifts");
    const gifts = await getGiftsForRecipient(
      userId.toString(),
      user.telegramHandle
    );

    if (gifts.length === 0) {
      await bot.sendMessage(
        chatId,
        `🎁 <b>No Pending Gifts</b>\n\nYou don't have any pending gifts to claim.\n\n💡 <b>Tips:</b>\n• Ask friends to send you gifts using /sendgift @${user.telegramHandle || "yourhandle"}\n• Check your gift links regularly\n• Gifts expire after 30 days`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎁 Open Mini App",
                  web_app: { url: frontendUrl },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Show gifts
    for (const gift of gifts) {
      const amountUsdc = (parseFloat(gift.amountUsdc) / 1000000).toFixed(2); // Convert from smallest unit
      // Generate deeplinks
      const { generateSmartGiftLink } = await import("../utils/telegram-deeplink");
      const links = generateSmartGiftLink({
        claimCode: gift.claimCode,
        secret: undefined, // Gift link command doesn't include secret
        botUsername: env.TELEGRAM_BOT_USERNAME,
        frontendUrl,
      });
      const giftLink = links.webLink;
      const giftTelegramLink = links.telegramLink;
      const expiresDate = gift.expiresAt ? new Date(gift.expiresAt).toLocaleDateString() : "Never";
      
      let message = `🎁 <b>You have a gift!</b>\n\n`;
      message += `💰 <b>Amount:</b> ${amountUsdc} USDC\n`;
      message += `📍 <b>Destination:</b> ${gift.dstChain === "arc-testnet" ? "Arc Testnet" : gift.dstChain}\n`;
      if (gift.message) {
        message += `💬 <b>Message:</b>\n${gift.message}\n\n`;
      }
      message += `🔗 <b>Claim Link:</b>\n<code>${giftLink}</code>\n\n`;
      message += `📋 <b>Claim Code:</b> <code>${gift.claimCode}</code>\n`;
      message += `⏰ <b>Expires:</b> ${expiresDate}\n\n`;
      message += `✨ <b>Click the button below to claim your gift in the Mini App!</b>\n\n`;
      message += `💡 <b>Note:</b> You may need a secret to claim. Ask the sender for it if prompted.`;

      await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎁 Claim Gift in Mini App",
                web_app: { url: giftLink },
              },
            ],
            [
              {
                text: "📋 Copy Claim Code",
                callback_data: `copy_claim_code_${gift.claimCode}`,
              },
            ],
          ],
        },
      });
    }
  } catch (error: any) {
    console.error("Error handling gift link command:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

/**
 * Handle /transfer command - Cross-chain USDC transfer using CCTP
 * Format: /transfer <amount> <destination-chain> <recipient-address or @username>
 * Example: /transfer 10 arc-testnet 0x... or /transfer 10 arc-testnet @username
 */
export async function handleTransferCommand(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  args: string[]
): Promise<void> {
  try {
    if (args.length < 3) {
      await bot.sendMessage(
        chatId,
        `🌐 <b>Cross-Chain Transfer</b>\n\n` +
        `Usage: /transfer <amount> <destination-chain> <recipient>\n\n` +
        `<b>Examples:</b>\n` +
        `• /transfer 10 arc-testnet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\n` +
        `• /transfer 25 arc-testnet @username\n` +
        `• /transfer 5 eth-sepolia @friendname\n\n` +
        `<b>Supported Chains:</b>\n` +
        `• eth-sepolia (Ethereum Sepolia)\n` +
        `• arc-testnet (Arc Testnet)\n\n` +
        `<b>Note:</b> Transfers USDC using Circle CCTP for fast cross-chain transfers.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const amount = parseFloat(args[0]);
    const destinationChain = args[1].toLowerCase();
    const recipientInput = args[2];

    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, `❌ Invalid amount. Please provide a positive number.`);
      return;
    }

    // Get user's wallet info
    const user = await getUserByTelegramId(userId.toString());
    if (!user?.walletAddress) {
      await bot.sendMessage(
        chatId,
        `❌ Wallet not connected. Please connect your wallet in the Mini App first.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect Wallet",
                  web_app: { url: `${loadEnv().FRONTEND_URL || "https://gifties-w3yr.vercel.app"}` },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Check if user has Circle wallet ID (required for CCTP)
    if (!user.circleWalletId) {
      await bot.sendMessage(
        chatId,
        `❌ Circle wallet not set up. Please connect your wallet in the Mini App to set up Circle wallet integration.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect Wallet",
                  web_app: { url: `${loadEnv().FRONTEND_URL || "https://gifties-w3yr.vercel.app"}` },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Parse recipient address
    let recipientAddress: string;
    if (recipientInput.startsWith("@")) {
      // Lookup user by handle
      const recipientHandle = recipientInput.replace("@", "");
      const recipientUser = await getUserByTelegramHandle(recipientHandle);
      if (!recipientUser?.walletAddress) {
        await bot.sendMessage(chatId, `❌ User @${recipientHandle} not found or wallet not connected.`);
        return;
      }
      recipientAddress = recipientUser.walletAddress;
    } else if (recipientInput.startsWith("0x")) {
      // Direct address
      recipientAddress = recipientInput;
    } else {
      await bot.sendMessage(chatId, `❌ Invalid recipient. Please provide a wallet address (0x...) or Telegram handle (@username).`);
      return;
    }

    // Validate chains
    const validChains = ["eth-sepolia", "ethereum", "arc-testnet", "arc"];
    if (!validChains.includes(destinationChain)) {
      await bot.sendMessage(
        chatId,
        `❌ Invalid destination chain. Supported chains: eth-sepolia, arc-testnet`
      );
      return;
    }

    // Determine source chain (default to Sepolia)
    const sourceChain = "eth-sepolia"; // Could be enhanced to detect user's current chain

    // Check balance
    await bot.sendMessage(chatId, `💰 Checking balance...`, { parse_mode: "HTML" });
    
    const { getChainBalances } = await import("../blockchain/balance");
    const balances = await getChainBalances(user.walletAddress, "11155111"); // Sepolia
    const usdcBalance = parseFloat(balances.usdc.balanceFormatted || "0");
    const amountInSmallestUnit = Math.floor(amount * 1000000); // USDC has 6 decimals

    if (usdcBalance < amount) {
      await bot.sendMessage(
        chatId,
        `❌ <b>Insufficient Balance</b>\n\n` +
        `Required: ${amount.toFixed(2)} USDC\n` +
        `Available: ${usdcBalance.toFixed(2)} USDC\n\n` +
        `Please fund your wallet on Sepolia first.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // Initiate CCTP transfer
    await bot.sendMessage(
      chatId,
      `🌐 <b>Initiating Cross-Chain Transfer...</b>\n\n` +
      `💰 Amount: ${amount.toFixed(2)} USDC\n` +
      `📍 From: Ethereum Sepolia\n` +
      `📍 To: ${destinationChain === "arc-testnet" || destinationChain === "arc" ? "Arc Testnet" : "Ethereum Sepolia"}\n` +
      `👤 Recipient: ${recipientAddress.substring(0, 6)}...${recipientAddress.substring(recipientAddress.length - 4)}\n\n` +
      `Using Circle CCTP for fast cross-chain transfer...`,
      { parse_mode: "HTML" }
    );

    try {
      const cctpClient = new CCTPClient();
      const transfer = await cctpClient.initiateCCTPTransfer(
        user.circleWalletId,
        sourceChain,
        destinationChain,
        recipientAddress,
        amountInSmallestUnit.toString()
      );

      const chainName = destinationChain === "arc-testnet" || destinationChain === "arc" 
        ? "Arc Testnet" 
        : "Ethereum Sepolia";

      await bot.sendMessage(
        chatId,
        `✅ <b>Cross-Chain Transfer Initiated!</b>\n\n` +
        `💰 Amount: ${amount.toFixed(2)} USDC\n` +
        `📍 From: Ethereum Sepolia\n` +
        `📍 To: ${chainName}\n` +
        `👤 Recipient: <code>${recipientAddress}</code>\n\n` +
        `🔄 Transfer ID: <code>${transfer.id}</code>\n` +
        `📊 Status: ${transfer.status}\n` +
        (transfer.messageHash ? `🔗 Message Hash: <code>${transfer.messageHash}</code>\n` : "") +
        `\n✨ Transfer is being processed. Recipient will receive USDC on ${chainName} once confirmed.`,
        { parse_mode: "HTML" }
      );
    } catch (error: any) {
      console.error("CCTP transfer error:", error);
      await bot.sendMessage(
        chatId,
        `❌ <b>Transfer Failed</b>\n\n${error.message}\n\nPlease try again or contact support.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (error: any) {
    console.error("Error handling transfer command:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

/**
 * Handle /swap command - Token swap (ETH to USDC) with optional gift creation
 * Format: /swap <amount> <token> [@recipient]
 * Examples: 
 *   /swap 0.1 ETH (Swap ETH to USDC for yourself)
 *   /swap 0.1 ETH @friendname (Swap ETH to USDC and create gift for friend)
 */
export async function handleSwapCommand(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  args: string[]
): Promise<void> {
  try {
    const env = loadEnv();
    const frontendUrl = env.FRONTEND_URL || "https://gifties-w3yr.vercel.app";

    if (args.length < 2) {
      await bot.sendMessage(
        chatId,
        `💱 <b>Token Swap</b>\n\n` +
        `Usage: /swap <amount> <token> [@recipient]\n\n` +
        `<b>Examples:</b>\n` +
        `• /swap 0.1 ETH (Swap ETH to USDC)\n` +
        `• /swap 0.1 ETH @friendname (Swap ETH to USDC and send as gift)\n` +
        `• /swap 10 USDC (Swap USDC to ETH)\n\n` +
        `<b>Note:</b> Swaps require wallet signatures. Use the Mini App to execute swaps.\n\n` +
        `<b>Supported:</b>\n` +
        `• ETH ↔ USDC on Sepolia\n` +
        `• Uses DEX aggregator for best rates\n\n` +
        `<b>Gift Feature:</b>\n` +
        `• Add @username to create a gift link after swap\n` +
        `• Friend can claim USDC gift via claimable link`,
        { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💱 Open Swap in Mini App",
                  web_app: { url: `${frontendUrl}/swap` },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    const amount = parseFloat(args[0]);
    const token = args[1].toUpperCase();
    const recipientInput = args[2]; // Optional recipient

    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, `❌ Invalid amount. Please provide a positive number.`);
      return;
    }

    if (token !== "ETH" && token !== "USDC") {
      await bot.sendMessage(chatId, `❌ Invalid token. Supported tokens: ETH, USDC`);
      return;
    }

    // Get user's wallet info
    const user = await getUserByTelegramId(userId.toString());
    if (!user?.walletAddress) {
      await bot.sendMessage(
        chatId,
        `❌ Wallet not connected. Please connect your wallet first.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect Wallet",
                  web_app: { url: frontendUrl },
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // Parse recipient if provided
    let recipientUser: any = null;
    let recipientName = "";
    if (recipientInput && recipientInput.startsWith("@")) {
      const recipientHandle = recipientInput.replace("@", "");
      recipientUser = await getUserByTelegramHandle(recipientHandle);
      if (!recipientUser?.walletAddress) {
        await bot.sendMessage(
          chatId,
          `❌ User @${recipientHandle} not found or wallet not connected. Gift cannot be created.`,
          {
            parse_mode: "HTML",
          }
        );
        // Continue with swap anyway (without gift)
      } else {
        recipientName = `@${recipientHandle}`;
      }
    }

    // Check balance
    await bot.sendMessage(chatId, `💰 Checking balance...`, { parse_mode: "HTML" });
    
    const { getChainBalances } = await import("../blockchain/balance");
    const balances = await getChainBalances(user.walletAddress, "11155111"); // Sepolia
    
    if (token === "ETH") {
      const ethBalance = parseFloat(balances.native.balanceFormatted || "0");
      if (ethBalance < amount) {
        await bot.sendMessage(
          chatId,
          `❌ <b>Insufficient ETH Balance</b>\n\n` +
          `Required: ${amount.toFixed(6)} ETH\n` +
          `Available: ${ethBalance.toFixed(6)} ETH\n\n` +
          `Please fund your wallet with ETH on Sepolia.`,
          { parse_mode: "HTML" }
        );
        return;
      }
    } else {
      const usdcBalance = parseFloat(balances.usdc.balanceFormatted || "0");
      if (usdcBalance < amount) {
        await bot.sendMessage(
          chatId,
          `❌ <b>Insufficient USDC Balance</b>\n\n` +
          `Required: ${amount.toFixed(2)} USDC\n` +
          `Available: ${usdcBalance.toFixed(2)} USDC\n\n` +
          `Please fund your wallet with USDC on Sepolia.`,
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    const swapToken = token === "ETH" ? "USDC" : "ETH";
    
    // If recipient provided and swapping ETH to USDC, create gift link
    if (recipientUser && token === "ETH" && swapToken === "USDC") {
      // Estimate USDC amount (approximate, actual will be after swap)
      // For demo, we'll create the gift with estimated amount
      const estimatedUSDC = amount * 3000; // Rough estimate (ETH price)
      
      await bot.sendMessage(
        chatId,
        `💱 <b>Swap & Send Gift</b>\n\n` +
        `💰 Swap: ${amount.toFixed(6)} ETH → ~${estimatedUSDC.toFixed(2)} USDC\n` +
        `🎁 Gift for: ${recipientName}\n` +
        `📍 Chain: Ethereum Sepolia → Arc Testnet\n\n` +
        `✅ Balance verified!\n\n` +
        `Creating gift link...`,
        { parse_mode: "HTML" }
      );

      try {
        // Create gift record (will be funded after swap)
        const gift = await createGift({
          senderUserId: userId.toString(),
          recipientHandle: recipientUser.telegramHandle || recipientInput.replace("@", ""),
          amountUsdc: estimatedUSDC.toFixed(2),
          srcChain: "eth-sepolia",
          dstChain: "arc-testnet",
          message: `🎁 Gift from swap: ${amount.toFixed(6)} ETH converted to USDC`,
          expiresInDays: 30,
          senderWalletAddress: user.walletAddress,
        });

        // Generate deeplinks
        const { generateSmartGiftLink } = await import("../utils/telegram-deeplink");
        const links = generateSmartGiftLink({
          claimCode: gift.claimCode,
          secret: gift.claimSecret,
          botUsername: env.TELEGRAM_BOT_USERNAME,
          frontendUrl,
        });
        const claimUrl = links.webLink;
        const giftLink = links.webLink;
        const giftTelegramLink = links.telegramLink;

        await bot.sendMessage(
          chatId,
          `✅ <b>Gift Created!</b>\n\n` +
          `🎁 <b>Gift for:</b> ${recipientName}\n` +
          `💰 <b>Amount:</b> ~${estimatedUSDC.toFixed(2)} USDC (after swap)\n` +
          `📍 <b>Destination:</b> Arc Testnet\n\n` +
          `🔗 <b>Gift Link (Web):</b>\n` +
          `<code>${giftLink}</code>\n\n` +
          (giftTelegramLink ? `📱 <b>Telegram Link:</b>\n<code>${giftTelegramLink}</code>\n\n` : "") +
          `📋 <b>Claim Code:</b> <code>${gift.claimCode}</code>\n` +
          (gift.claimSecret ? `🔐 <b>Secret:</b> <code>${gift.claimSecret}</code>\n` : "") +
          `\n✨ <b>Next Steps:</b>\n` +
          `1. Complete the swap in Mini App (ETH → USDC)\n` +
          `2. Gift will be funded with swapped USDC\n` +
          `3. Share the gift link with ${recipientName}\n` +
          `4. ${recipientName} can claim the USDC gift\n\n` +
          `💡 <b>Note:</b> The gift will be available after the swap completes.`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `💱 Complete Swap & Fund Gift`,
                    web_app: { url: `${frontendUrl}/swap?amount=${amount}&from=${token}&to=${swapToken}&giftId=${gift.id}&recipient=${encodeURIComponent(recipientName)}` },
                  },
                ],
                [
                  {
                    text: "📱 Open in Telegram",
                    url: giftTelegramLink || giftLink,
                  },
                  {
                    text: "🔗 Share Web Link",
                    url: `https://t.me/share/url?url=${encodeURIComponent(giftLink)}&text=${encodeURIComponent(`🎁 You have a gift! Claim ${estimatedUSDC.toFixed(2)} USDC: ${giftLink}`)}`,
                  },
                ],
                [
                  {
                    text: "📋 Copy Gift Link",
                    callback_data: `copy_gift_${gift.claimCode}`,
                  },
                ],
              ],
            },
          }
        );
      } catch (giftError: any) {
        console.error("Error creating gift:", giftError);
        // Continue with regular swap flow
        await bot.sendMessage(
          chatId,
          `⚠️ Could not create gift link. Continuing with swap...\n\n${giftError.message}`,
          { parse_mode: "HTML" }
        );
        
        // Fall through to regular swap
        await bot.sendMessage(
          chatId,
          `💱 <b>Swap Ready</b>\n\n` +
          `💰 Amount: ${amount.toFixed(token === "ETH" ? 6 : 2)} ${token}\n` +
          `🔄 To: ${swapToken}\n` +
          `📍 Chain: Ethereum Sepolia\n\n` +
          `✅ Balance verified!\n\n` +
          `Click the button below to execute the swap in the Mini App.`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `💱 Swap ${amount.toFixed(token === "ETH" ? 6 : 2)} ${token} → ${swapToken}`,
                    web_app: { url: `${frontendUrl}/swap?amount=${amount}&from=${token}&to=${swapToken}` },
                  },
                ],
              ],
            },
          }
        );
      }
    } else {
      // Regular swap (no gift)
      await bot.sendMessage(
        chatId,
        `💱 <b>Swap Ready</b>\n\n` +
        `💰 Amount: ${amount.toFixed(token === "ETH" ? 6 : 2)} ${token}\n` +
        `🔄 To: ${swapToken}\n` +
        `📍 Chain: Ethereum Sepolia\n\n` +
        `✅ Balance verified!\n\n` +
        `Click the button below to execute the swap in the Mini App. Swaps require wallet signatures for security.` +
        (recipientInput ? `\n\n💡 <b>Tip:</b> To send as gift, use: /swap ${amount} ${token} @username` : ""),
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `💱 Swap ${amount.toFixed(token === "ETH" ? 6 : 2)} ${token} → ${swapToken}`,
                  web_app: { url: `${frontendUrl}/swap?amount=${amount}&from=${token}&to=${swapToken}` },
                },
              ],
              [
                {
                  text: "💼 View Wallet",
                  callback_data: "check_wallet",
                },
              ],
            ],
          },
        }
      );
    }
  } catch (error: any) {
    console.error("Error handling swap command:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}


