import webpush from "web-push";
import { db, timeSlotsTable, placesTable, pushSubscriptionsTable, notificationPreferencesTable, childrenTable, sentNotificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./lib/logger";

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function alreadySent(key: string, date: string): Promise<boolean> {
  const [existing] = await db.select({ id: sentNotificationsTable.id })
    .from(sentNotificationsTable)
    .where(and(
      eq(sentNotificationsTable.notificationKey, key),
      eq(sentNotificationsTable.sentDate, date),
    ))
    .limit(1);
  return !!existing;
}

async function markSent(key: string, date: string): Promise<void> {
  await db.insert(sentNotificationsTable)
    .values({ notificationKey: key, sentDate: date })
    .onConflictDoNothing();
}

async function sendPushToUser(userId: number, payload: object): Promise<void> {
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

export async function runNotificationCheck(): Promise<{ sent: number }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    logger.warn("VAPID keys not configured — push notifications disabled");
    return { sent: 0 };
  }

  webpush.setVapidDetails("mailto:edu-pass@example.com", publicKey, privateKey);

  let sentCount = 0;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay();
  const todayKey = getTodayKey();

  const allSlots = await db.select().from(timeSlotsTable);
  const todaySlots = allSlots.filter(s => s.dayOfWeek === dayOfWeek && s.primaryGuardianId !== null);

  if (todaySlots.length === 0) return { sent: 0 };

  const allPlaces = await db.select().from(placesTable);
  const placeMap = new Map(allPlaces.map(p => [p.id, p]));

  const allChildren = await db.select().from(childrenTable);
  const childMap = new Map(allChildren.map(c => [c.id, c.name]));

  const guardianIds = new Set(todaySlots.map(s => s.primaryGuardianId!));

  for (const guardianId of guardianIds) {
    const [pref] = await db.select().from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, guardianId));

    if (!pref || !pref.enabled) continue;

    const minutesBefore = pref.minutesBefore;
    const guardianSlots = todaySlots
      .filter(s => s.primaryGuardianId === guardianId)
      .sort((a, b) => timeToMinutes(a.endTime) - timeToMinutes(b.endTime));

    const lastSlotPerChild = new Map<number, typeof guardianSlots[0]>();
    for (const slot of guardianSlots) {
      lastSlotPerChild.set(slot.childId, slot);
    }

    for (const slot of guardianSlots) {
      const place = placeMap.get(slot.placeId);
      const childName = childMap.get(slot.childId) || "";

      const isLastSlotForChild = lastSlotPerChild.get(slot.childId)?.id === slot.id;
      const isShuttleSlot = isLastSlotForChild && slot.mobilityType === "shuttle" && slot.shuttleArrivalTime;

      if (isShuttleSlot) {
        const shuttleMinutes = timeToMinutes(slot.shuttleArrivalTime!);
        const alertTime = shuttleMinutes - minutesBefore;
        const shuttleKey = `shuttle-${slot.id}-${guardianId}`;

        if (currentMinutes >= alertTime && currentMinutes < alertTime + 2 && !(await alreadySent(shuttleKey, todayKey))) {
          await sendPushToUser(guardianId, {
            title: `🚌 셔틀 도착 알림`,
            body: `${childName} - ${place?.placeName || ""} 셔틀이 ${minutesBefore}분 후 도착합니다 (${slot.shuttleArrivalTime})`,
            url: "/",
          });
          await markSent(shuttleKey, todayKey);
          sentCount++;
          logger.info({ guardianId, slotId: slot.id }, "Sent shuttle arrival notification");
        }
      } else {
        const endMinutes = timeToMinutes(slot.endTime);
        const pickupAlertTime = endMinutes - minutesBefore;
        const pickupKey = `pickup-${slot.id}-${guardianId}`;

        if (currentMinutes >= pickupAlertTime && currentMinutes < pickupAlertTime + 2 && !(await alreadySent(pickupKey, todayKey))) {
          await sendPushToUser(guardianId, {
            title: `📍 픽업 알림`,
            body: `${childName} - ${place?.placeName || ""} 하원 ${minutesBefore}분 전입니다 (${slot.endTime})`,
            url: "/",
          });
          await markSent(pickupKey, todayKey);
          sentCount++;
          logger.info({ guardianId, slotId: slot.id }, "Sent pickup notification");
        }
      }
    }
  }

  return { sent: sentCount };
}

export function startNotificationScheduler(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    logger.warn("VAPID keys not configured — push notifications disabled");
    return;
  }

  webpush.setVapidDetails("mailto:edu-pass@example.com", publicKey, privateKey);

  setInterval(() => runNotificationCheck().catch(err =>
    logger.error({ err }, "Notification scheduler error")
  ), 60_000);
  logger.info("Notification scheduler started (1-minute interval)");

  setTimeout(() => runNotificationCheck().catch(err =>
    logger.error({ err }, "Notification scheduler error")
  ), 5_000);
}
