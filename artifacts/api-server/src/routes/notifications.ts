import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pushSubscriptionsTable, notificationPreferencesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/notifications/vapid-key", (_req, res): void => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    res.status(500).json({ error: "VAPID key not configured" });
    return;
  }
  res.json({ publicKey });
});

router.post("/notifications/subscribe", requireAuth, async (req, res): Promise<void> => {
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "endpoint, p256dh, auth 필수" });
    return;
  }

  const userId = req.session.userId!;

  const existing = await db.select().from(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));

  if (existing.length > 0) {
    await db.update(pushSubscriptionsTable)
      .set({ p256dh, auth })
      .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
    res.json({ message: "알림 구독이 업데이트되었습니다" });
    return;
  }

  await db.insert(pushSubscriptionsTable).values({ userId, endpoint, p256dh, auth });
  res.json({ message: "알림 구독이 등록되었습니다" });
});

router.delete("/notifications/subscribe", requireAuth, async (req, res): Promise<void> => {
  const { endpoint } = req.body;
  if (!endpoint) {
    res.status(400).json({ error: "endpoint 필수" });
    return;
  }

  const userId = req.session.userId!;

  await db.delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));

  res.json({ message: "알림 구독이 해제되었습니다" });
});

router.get("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [pref] = await db.select().from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId));

  if (!pref) {
    res.json({ enabled: false, minutesBefore: 15 });
    return;
  }

  res.json({ enabled: pref.enabled, minutesBefore: pref.minutesBefore });
});

router.put("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const { enabled, minutesBefore } = req.body;
  if (typeof enabled !== "boolean" || typeof minutesBefore !== "number" || !Number.isInteger(minutesBefore) || minutesBefore < 5 || minutesBefore > 60 || minutesBefore % 5 !== 0) {
    res.status(400).json({ error: "enabled (boolean), minutesBefore (5~60, 5분 단위 정수) 필수" });
    return;
  }

  const userId = req.session.userId!;

  const [existing] = await db.select().from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId));

  if (existing) {
    await db.update(notificationPreferencesTable)
      .set({ enabled, minutesBefore })
      .where(eq(notificationPreferencesTable.userId, userId));
  } else {
    await db.insert(notificationPreferencesTable).values({ userId, enabled, minutesBefore });
  }

  res.json({ enabled, minutesBefore });
});

export default router;
