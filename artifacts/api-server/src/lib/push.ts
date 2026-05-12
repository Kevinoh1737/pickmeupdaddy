import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let vapidConfigured = false;

export function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    webpush.setVapidDetails("mailto:edu-pass@example.com", publicKey, privateKey);
    vapidConfigured = true;
  }
}

export async function sendPushToUser(userId: number, payload: object): Promise<void> {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const subscriptions = await db.select().from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
    } catch (err: unknown) {
      const statusCode = err instanceof Error && "statusCode" in err ? (err as { statusCode: number }).statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
        logger.info({ subscriptionId: sub.id }, "Removed expired push subscription");
      } else {
        logger.error({ err, subscriptionId: sub.id }, "Failed to send push notification");
      }
    }
  }
}
