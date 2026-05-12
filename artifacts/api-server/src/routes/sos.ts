import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db, usersTable, childrenTable, timeSlotsTable, placesTable, sosTossTable, sosRequestsTable } from "@workspace/db";
import { SosTossBody, CreateSosRequestBody, AcceptSosRequestParams, DeclineSosRequestParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import { z } from "zod";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const router: IRouter = Router();

router.post("/sos/toss", requireAuth, async (req, res): Promise<void> => {
  const parsed = SosTossBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.status(400).json({ error: "No family found" });
    return;
  }

  if (parsed.data.targetGuardianId === userId) {
    res.status(400).json({ error: "Cannot toss to yourself" });
    return;
  }

  const [targetGuardian] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.targetGuardianId));
  if (!targetGuardian || targetGuardian.familyId !== user.familyId) {
    res.status(400).json({ error: "Target guardian is not in your family" });
    return;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay();

  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  const childIds = children.map(c => c.id);

  const allSlots = await db.select().from(timeSlotsTable);
  const remainingSlots = allSlots.filter(s => {
    if (!childIds.includes(s.childId)) return false;
    if (s.dayOfWeek !== dayOfWeek) return false;
    if (timeToMinutes(s.endTime) <= currentMinutes) return false;
    if (s.primaryGuardianId !== userId) return false;
    return true;
  });

  const slotIds = remainingSlots.map(s => s.id);

  const [record] = await db.insert(sosTossTable).values({
    fromGuardianId: userId,
    toGuardianId: parsed.data.targetGuardianId,
    transferredSchedules: remainingSlots.length,
    message: parsed.data.message || null,
    status: "pending",
    pendingSlotIds: JSON.stringify(slotIds),
  }).returning();

  const [toUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, parsed.data.targetGuardianId));

  await sendPushToUser(parsed.data.targetGuardianId, {
    title: "🚨 긴급 픽업 전달 요청",
    body: `${user.name}님이 오늘 남은 ${remainingSlots.length}건 픽업을 넘기려 합니다. 수락하시겠습니까?`,
    url: "/",
  });

  res.json({
    id: record.id,
    fromGuardianId: record.fromGuardianId,
    toGuardianId: record.toGuardianId,
    transferredSchedules: record.transferredSchedules,
    status: record.status,
    message: record.message || null,
    pendingSlotIds: slotIds,
    createdAt: record.createdAt.toISOString(),
    respondedAt: record.respondedAt?.toISOString() || null,
  });
});

router.get("/sos/toss/pending", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const pendingTosses = await db.select().from(sosTossTable)
    .where(and(
      eq(sosTossTable.toGuardianId, userId),
      eq(sosTossTable.status, "pending")
    ));

  const guardianIds = new Set<number>();
  pendingTosses.forEach(t => { guardianIds.add(t.fromGuardianId); guardianIds.add(t.toGuardianId); });

  const guardianMap = new Map<number, string>();
  if (guardianIds.size > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    users.forEach(u => guardianMap.set(u.id, u.name));
  }

  res.json(pendingTosses.map(t => ({
    id: t.id,
    fromGuardianId: t.fromGuardianId,
    fromGuardianName: guardianMap.get(t.fromGuardianId) || "Unknown",
    toGuardianId: t.toGuardianId,
    toGuardianName: guardianMap.get(t.toGuardianId) || "Unknown",
    transferredSchedules: t.transferredSchedules,
    status: t.status,
    message: t.message || null,
    pendingSlotIds: t.pendingSlotIds ? JSON.parse(t.pendingSlotIds) : [],
    createdAt: t.createdAt.toISOString(),
    respondedAt: t.respondedAt?.toISOString() || null,
  })));
});

const SosTossIdParams = z.object({ id: z.coerce.number() });

router.post("/sos/toss/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = SosTossIdParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid toss ID" });
    return;
  }

  const userId = req.session.userId!;
  const tossId = paramsParsed.data.id;

  const [toss] = await db.select().from(sosTossTable)
    .where(and(
      eq(sosTossTable.id, tossId),
      eq(sosTossTable.toGuardianId, userId),
      eq(sosTossTable.status, "pending")
    ));

  if (!toss) {
    res.status(404).json({ error: "SOS toss not found or already responded" });
    return;
  }

  const slotIds: number[] = toss.pendingSlotIds ? JSON.parse(toss.pendingSlotIds) : [];

  for (const slotId of slotIds) {
    await db.update(timeSlotsTable)
      .set({ primaryGuardianId: userId })
      .where(eq(timeSlotsTable.id, slotId));
  }

  const [updated] = await db.update(sosTossTable)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(sosTossTable.id, tossId))
    .returning();

  const [toUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await sendPushToUser(toss.fromGuardianId, {
    title: "✅ SOS 긴급 전달 수락",
    body: `${toUser?.name || ""}님이 ${slotIds.length}건 픽업 전달을 수락했습니다.`,
    url: "/sos",
  });

  const guardianMap = new Map<number, string>();
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  users.forEach(u => guardianMap.set(u.id, u.name));

  res.json({
    id: updated.id,
    fromGuardianId: updated.fromGuardianId,
    fromGuardianName: guardianMap.get(updated.fromGuardianId) || "Unknown",
    toGuardianId: updated.toGuardianId,
    toGuardianName: guardianMap.get(updated.toGuardianId) || "Unknown",
    transferredSchedules: updated.transferredSchedules,
    status: updated.status,
    message: updated.message || null,
    pendingSlotIds: slotIds,
    createdAt: updated.createdAt.toISOString(),
    respondedAt: updated.respondedAt?.toISOString() || null,
  });
});

router.post("/sos/toss/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = SosTossIdParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid toss ID" });
    return;
  }

  const userId = req.session.userId!;
  const tossId = paramsParsed.data.id;

  const [toss] = await db.select().from(sosTossTable)
    .where(and(
      eq(sosTossTable.id, tossId),
      eq(sosTossTable.toGuardianId, userId),
      eq(sosTossTable.status, "pending")
    ));

  if (!toss) {
    res.status(404).json({ error: "SOS toss not found or already responded" });
    return;
  }

  const slotIds: number[] = toss.pendingSlotIds ? JSON.parse(toss.pendingSlotIds) : [];

  const [updated] = await db.update(sosTossTable)
    .set({ status: "declined", respondedAt: new Date() })
    .where(eq(sosTossTable.id, tossId))
    .returning();

  const [toUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await sendPushToUser(toss.fromGuardianId, {
    title: "❌ SOS 긴급 전달 거절",
    body: `${toUser?.name || ""}님이 픽업 전달 요청을 거절했습니다.`,
    url: "/sos",
  });

  const guardianMap = new Map<number, string>();
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  users.forEach(u => guardianMap.set(u.id, u.name));

  res.json({
    id: updated.id,
    fromGuardianId: updated.fromGuardianId,
    fromGuardianName: guardianMap.get(updated.fromGuardianId) || "Unknown",
    toGuardianId: updated.toGuardianId,
    toGuardianName: guardianMap.get(updated.toGuardianId) || "Unknown",
    transferredSchedules: updated.transferredSchedules,
    status: updated.status,
    message: updated.message || null,
    pendingSlotIds: slotIds,
    createdAt: updated.createdAt.toISOString(),
    respondedAt: updated.respondedAt?.toISOString() || null,
  });
});

router.get("/sos/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.json([]);
    return;
  }

  const records = await db.select().from(sosTossTable);

  const userIds = new Set<number>();
  records.forEach(r => { userIds.add(r.fromGuardianId); userIds.add(r.toGuardianId); });

  const guardianMap = new Map<number, string>();
  if (userIds.size > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    users.forEach(u => guardianMap.set(u.id, u.name));
  }

  res.json(records.map(r => ({
    id: r.id,
    fromGuardianId: r.fromGuardianId,
    fromGuardianName: guardianMap.get(r.fromGuardianId) || "Unknown",
    toGuardianId: r.toGuardianId,
    toGuardianName: guardianMap.get(r.toGuardianId) || "Unknown",
    transferredSchedules: r.transferredSchedules,
    status: r.status,
    message: r.message,
    pendingSlotIds: r.pendingSlotIds ? JSON.parse(r.pendingSlotIds) : [],
    createdAt: r.createdAt.toISOString(),
    respondedAt: r.respondedAt?.toISOString() || null,
  })));
});

async function enrichSosRequest(request: typeof sosRequestsTable.$inferSelect) {
  const [fromUser] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, request.fromUserId));
  const [toUser] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, request.toUserId));
  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, request.timeSlotId));
  const [child] = slot ? await db.select().from(childrenTable).where(eq(childrenTable.id, slot.childId)) : [null];
  const [place] = slot ? await db.select().from(placesTable).where(eq(placesTable.id, slot.placeId)) : [null];

  return {
    id: request.id,
    fromUserId: request.fromUserId,
    fromUserName: fromUser?.name || "Unknown",
    toUserId: request.toUserId,
    toUserName: toUser?.name || "Unknown",
    timeSlotId: request.timeSlotId,
    childName: child?.name || "Unknown",
    placeName: place?.placeName || "Unknown",
    address: place?.address || "",
    startTime: slot?.startTime || "",
    endTime: slot?.endTime || "",
    dayOfWeek: slot?.dayOfWeek ?? 0,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt.toISOString(),
    respondedAt: request.respondedAt?.toISOString() || null,
  };
}

router.post("/sos/request", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSosRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const { timeSlotId, toUserId, message } = parsed.data;

  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!fromUser || !fromUser.familyId) {
    res.status(400).json({ error: "No family found" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId));
  if (!targetUser || targetUser.familyId !== fromUser.familyId) {
    res.status(400).json({ error: "Target user is not in your family" });
    return;
  }

  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, timeSlotId));
  if (!slot) {
    res.status(400).json({ error: "Time slot not found" });
    return;
  }

  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, slot.childId));
  if (!child || child.familyId !== fromUser.familyId) {
    res.status(400).json({ error: "This time slot does not belong to your family" });
    return;
  }

  if (slot.primaryGuardianId !== userId) {
    res.status(400).json({ error: "You are not the primary guardian for this time slot" });
    return;
  }

  const existing = await db.select().from(sosRequestsTable)
    .where(and(
      eq(sosRequestsTable.timeSlotId, timeSlotId),
      eq(sosRequestsTable.status, "pending")
    ));
  if (existing.length > 0) {
    res.status(400).json({ error: "A pending SOS request already exists for this time slot" });
    return;
  }

  const [record] = await db.insert(sosRequestsTable).values({
    fromUserId: userId,
    toUserId,
    timeSlotId,
    status: "pending",
    message: message || null,
  }).returning();

  const enriched = await enrichSosRequest(record);

  await sendPushToUser(toUserId, {
    title: "📍 픽업 도움 요청",
    body: `${fromUser.name}님이 ${enriched.childName} - ${enriched.placeName} 픽업을 부탁드립니다. 도와주실 수 있으신가요? (${enriched.endTime})`,
    url: "/",
  });

  res.status(201).json(enriched);
});

router.get("/sos/requests/pending", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const pending = await db.select().from(sosRequestsTable)
    .where(and(
      eq(sosRequestsTable.toUserId, userId),
      eq(sosRequestsTable.status, "pending")
    ));

  const results = await Promise.all(pending.map(enrichSosRequest));
  res.json(results);
});

router.post("/sos/requests/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = AcceptSosRequestParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }
  const userId = req.session.userId!;
  const requestId = paramsParsed.data.id;

  const [sosReq] = await db.select().from(sosRequestsTable)
    .where(and(
      eq(sosRequestsTable.id, requestId),
      eq(sosRequestsTable.toUserId, userId),
      eq(sosRequestsTable.status, "pending")
    ));

  if (!sosReq) {
    res.status(404).json({ error: "SOS request not found or already responded" });
    return;
  }

  const [updated] = await db.update(sosRequestsTable)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(sosRequestsTable.id, requestId))
    .returning();

  await db.update(timeSlotsTable)
    .set({ primaryGuardianId: userId })
    .where(eq(timeSlotsTable.id, sosReq.timeSlotId));

  const enriched = await enrichSosRequest(updated);

  const [toUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  await sendPushToUser(sosReq.fromUserId, {
    title: "✅ SOS 요청 수락",
    body: `${toUser?.name || ""}님이 ${enriched.childName} - ${enriched.placeName} 픽업 요청을 수락했습니다.`,
    url: "/",
  });

  res.json(enriched);
});

router.post("/sos/requests/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = DeclineSosRequestParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }
  const userId = req.session.userId!;
  const requestId = paramsParsed.data.id;

  const [sosReq] = await db.select().from(sosRequestsTable)
    .where(and(
      eq(sosRequestsTable.id, requestId),
      eq(sosRequestsTable.toUserId, userId),
      eq(sosRequestsTable.status, "pending")
    ));

  if (!sosReq) {
    res.status(404).json({ error: "SOS request not found or already responded" });
    return;
  }

  const [updated] = await db.update(sosRequestsTable)
    .set({ status: "declined", respondedAt: new Date() })
    .where(eq(sosRequestsTable.id, requestId))
    .returning();

  const enriched = await enrichSosRequest(updated);

  const [toUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  await sendPushToUser(sosReq.fromUserId, {
    title: "❌ SOS 요청 거절",
    body: `${toUser?.name || ""}님이 ${enriched.childName} - ${enriched.placeName} 픽업 요청을 거절했습니다.`,
    url: "/",
  });

  res.json(enriched);
});

export default router;
