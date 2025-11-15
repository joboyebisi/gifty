import { loadEnv } from "../config/env";
import { getSupabase } from "../db/supabase";

/**
 * Goody webhook event types
 * Based on Goody API documentation
 */
export type GoodyWebhookEventType =
  | "order_batch.created"
  | "order_batch.completed"
  | "order.created"
  | "order.gift_opened"
  | "order.gift_accepted"
  | "order.thank_you_note_added"
  | "order.shipped"
  | "order.delivered"
  | "order.canceled"
  | "order.refunded";

export interface GoodyWebhookEvent {
  type: GoodyWebhookEventType;
  data: {
    id: string;
    order_batch_id?: string;
    status?: string;
    recipient_email?: string;
    recipient_first_name?: string;
    [key: string]: any;
  };
  timestamp?: string;
}

/**
 * Verify Svix webhook signature
 * Goody uses Svix for webhook delivery
 */
export function verifySvixSignature(
  payload: string,
  headers: {
    "svix-id"?: string;
    "svix-timestamp"?: string;
    "svix-signature"?: string;
  },
  secret: string
): boolean {
  // Basic validation - in production, use @svix/server package
  if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
    return false;
  }

  // For now, log that signature is present
  // Full verification requires @svix/server package
  // Install: npm install @svix/server
  // Then use: svix.verify(payload, headers, secret)
  
  console.log("🔐 Svix signature headers present (full verification recommended)");
  return true; // For now, accept if headers are present
}

/**
 * Handle Goody webhook events
 */
export async function handleGoodyWebhook(event: GoodyWebhookEvent): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    console.error("❌ Supabase not available");
    return;
  }

  const { type, data } = event;
  const orderId = data.id;
  const batchId = data.order_batch_id;

  console.log(`🎁 Processing Goody webhook: ${type} for order ${orderId}`);

  try {
    switch (type) {
      case "order_batch.created":
        await handleOrderBatchCreated(batchId || orderId, data);
        break;

      case "order_batch.completed":
        await handleOrderBatchCompleted(batchId || orderId, data);
        break;

      case "order.created":
        await handleOrderCreated(orderId, data);
        break;

      case "order.gift_opened":
        await handleGiftOpened(orderId, data);
        break;

      case "order.gift_accepted":
        await handleGiftAccepted(orderId, data);
        break;

      case "order.thank_you_note_added":
        await handleThankYouNoteAdded(orderId, data);
        break;

      case "order.shipped":
        await handleOrderShipped(orderId, data);
        break;

      case "order.delivered":
        await handleOrderDelivered(orderId, data);
        break;

      case "order.canceled":
        await handleOrderCanceled(orderId, data);
        break;

      case "order.refunded":
        await handleOrderRefunded(orderId, data);
        break;

      default:
        console.warn(`⚠️ Unknown webhook event type: ${type}`);
    }
  } catch (error: any) {
    console.error(`❌ Error handling webhook ${type}:`, error);
    throw error;
  }
}

/**
 * Handle order batch created
 */
async function handleOrderBatchCreated(batchId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`✅ Order batch created: ${batchId}`);

  // Update bulk gift with batch status
  await sb
    .from("bulk_gifts")
    .update({
      goody_batch_id: batchId,
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_batch_id", batchId);
}

/**
 * Handle order batch completed
 */
async function handleOrderBatchCompleted(batchId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`🎉 Order batch completed: ${batchId}`);

  // Update bulk gift status
  await sb
    .from("bulk_gifts")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_batch_id", batchId);
}

/**
 * Handle order created
 */
async function handleOrderCreated(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`✅ Order created: ${orderId}`);

  // Update recipient with order status
  await sb
    .from("bulk_gift_recipients")
    .update({
      goody_order_id: orderId,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);
}

/**
 * Handle gift opened
 */
async function handleGiftOpened(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`📬 Gift opened: ${orderId}`);

  // Update recipient status
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "opened",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);

  // Could send notification here
}

/**
 * Handle gift accepted
 */
async function handleGiftAccepted(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`✅ Gift accepted: ${orderId}`);

  // Update recipient status
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "accepted",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);

  // Could send notification to sender here
}

/**
 * Handle thank you note added
 */
async function handleThankYouNoteAdded(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`💌 Thank you note added: ${orderId}`);

  // Update recipient with thank you note
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "thanked",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);

  // Could send notification to sender here
}

/**
 * Handle order shipped
 */
async function handleOrderShipped(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`📦 Order shipped: ${orderId}`);

  // Update recipient status
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "shipped",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);

  // Could send shipping notification here
}

/**
 * Handle order delivered
 */
async function handleOrderDelivered(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`🎉 Order delivered: ${orderId}`);

  // Update recipient status
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "delivered",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);

  // Could send delivery notification here
}

/**
 * Handle order canceled
 */
async function handleOrderCanceled(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`❌ Order canceled: ${orderId}`);

  // Update recipient status
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);
}

/**
 * Handle order refunded
 */
async function handleOrderRefunded(orderId: string, data: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  console.log(`💰 Order refunded: ${orderId}`);

  // Update recipient status
  await sb
    .from("bulk_gift_recipients")
    .update({
      status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("goody_order_id", orderId);
}

