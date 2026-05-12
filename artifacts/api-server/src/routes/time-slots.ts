import { Router, type IRouter } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, timeSlotsTable, placesTable, usersTable, childrenTable } from "@workspace/db";
import { CreateTimeSlotBody, CreateTimeSlotParams, DeleteTimeSlotParams, DeleteTimeSlotQueryParams, UpdateTimeSlotBody, UpdateTimeSlotParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function verifyChildFamily(userId: number, childId: number): Promise<boolean> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.familyId) return false;
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
  if (!child) return false;
  return child.familyId === user.familyId;
}

const router: IRouter = Router();

router.get("/children/:childId/time-slots", requireAuth, async (req, res): Promise<void> => {
  const params = CreateTimeSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await verifyChildFamily(req.session.userId!, params.data.childId))) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const slots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.childId, params.data.childId));
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, params.data.childId));
  const places = child
    ? await db.select().from(placesTable).where(eq(placesTable.familyId, child.familyId))
    : [];
  const placeMap = new Map(places.map(p => [p.id, p]));

  const userIds = new Set<number>();
  slots.forEach(s => {
    if (s.primaryGuardianId) userIds.add(s.primaryGuardianId);
    if (s.backupGuardianId) userIds.add(s.backupGuardianId);
    if (s.dropOffGuardianId) userIds.add(s.dropOffGuardianId);
  });

  const guardianMap = new Map<number, string>();
  if (userIds.size > 0) {
    const guardians = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    guardians.forEach(g => guardianMap.set(g.id, g.name));
  }

  res.json(slots.map(s => {
    const place = placeMap.get(s.placeId);
    return {
      id: s.id,
      childId: s.childId,
      placeId: s.placeId,
      placeName: place?.placeName || "",
      placeAddress: place?.address || "",
      placeType: place?.type || "academy",
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      primaryGuardianId: s.primaryGuardianId,
      backupGuardianId: s.backupGuardianId,
      primaryGuardianName: s.primaryGuardianId ? guardianMap.get(s.primaryGuardianId) || null : null,
      backupGuardianName: s.backupGuardianId ? guardianMap.get(s.backupGuardianId) || null : null,
      mobilityType: s.mobilityType,
      shuttleArrivalTime: s.shuttleArrivalTime || null,
      parentAccompany: s.parentAccompany,
      dropOffType: s.dropOffType || null,
      dropOffGuardianId: s.dropOffGuardianId || null,
      dropOffGuardianName: s.dropOffGuardianId ? guardianMap.get(s.dropOffGuardianId) || null : null,
      pickUpType: s.pickUpType || null,
      pickUpShuttleArrivalTime: s.pickUpShuttleArrivalTime || null,
      createdAt: s.createdAt.toISOString(),
    };
  }));
});

router.post("/children/:childId/time-slots", requireAuth, async (req, res): Promise<void> => {
  const params = CreateTimeSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [callerUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!callerUser?.familyId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  if (callerUser.role !== "owner") {
    res.status(403).json({ error: "일정 추가는 가족 대표만 가능합니다" });
    return;
  }

  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, params.data.childId));
  if (!child || child.familyId !== callerUser.familyId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const parsed = CreateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [place] = await db.select().from(placesTable).where(eq(placesTable.id, parsed.data.placeId));
  if (!place) {
    res.status(400).json({ error: "Place not found" });
    return;
  }

  if (place.familyId !== child.familyId) {
    res.status(400).json({ error: "Place does not belong to this family" });
    return;
  }

  const existingPlaces = await db.select().from(placesTable).where(eq(placesTable.familyId, child.familyId));
  const placeMap = new Map(existingPlaces.map(p => [p.id, p]));

  const existingSlots = await db.select().from(timeSlotsTable).where(
    and(
      eq(timeSlotsTable.childId, params.data.childId),
      eq(timeSlotsTable.dayOfWeek, parsed.data.dayOfWeek)
    )
  );

  const [reqUser] = await db.select({ done: usersTable.onboardingCompleted }).from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  const skipSchoolPrereq = reqUser?.done === false;

  if (place.type === "academy" || place.type === "care") {
    if (!skipSchoolPrereq) {
      const hasSchoolSlot = existingSlots.some(s => {
        const p = placeMap.get(s.placeId);
        return p?.type === "school";
      });
      if (!hasSchoolSlot) {
        res.status(400).json({ error: "학교 일정을 먼저 등록해주세요" });
        return;
      }
    }

    const slotStart = timeToMinutes(parsed.data.startTime);
    const slotEnd = timeToMinutes(parsed.data.endTime);
    const minStart = place.type === "care" ? 660 : 780;
    if (slotStart < minStart || slotStart > 1320 || slotEnd < minStart || slotEnd > 1320 || slotStart >= slotEnd) {
      const rangeMsg = place.type === "care"
        ? "돌봄 일정은 오전 11시부터 오후 10시 사이만 가능합니다"
        : "학원 일정은 오후 1시부터 오후 10시 사이만 가능합니다";
      res.status(400).json({ error: rangeMsg });
      return;
    }
  }

  const startTime = parsed.data.startTime;
  const newStart = timeToMinutes(startTime);
  const newEnd = timeToMinutes(parsed.data.endTime);

  for (const existing of existingSlots) {
    const exStart = timeToMinutes(existing.startTime);
    const exEnd = timeToMinutes(existing.endTime);

    if (newStart < exEnd && newEnd > exStart) {
      const conflictPlace = placeMap.get(existing.placeId);
      res.status(400).json({
        error: `${conflictPlace?.placeName || "다른 일정"}과 시간이 겹칩니다 (${existing.startTime}~${existing.endTime})`,
      });
      return;
    }
  }

  const [slot] = await db.insert(timeSlotsTable).values({
    childId: params.data.childId,
    placeId: parsed.data.placeId,
    dayOfWeek: parsed.data.dayOfWeek,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    primaryGuardianId: parsed.data.primaryGuardianId || null,
    backupGuardianId: parsed.data.backupGuardianId || null,
    mobilityType: parsed.data.mobilityType || null,
    shuttleArrivalTime: parsed.data.mobilityType === "shuttle" ? (parsed.data.shuttleArrivalTime || null) : null,
    parentAccompany: place.type === "school" ? (parsed.data.parentAccompany ?? false) : false,
    dropOffType: parsed.data.dropOffType || null,
    dropOffGuardianId: parsed.data.dropOffType === "parent" ? (parsed.data.dropOffGuardianId || null) : null,
    pickUpType: parsed.data.pickUpType || null,
    pickUpShuttleArrivalTime: parsed.data.pickUpType === "shuttle" ? (parsed.data.pickUpShuttleArrivalTime || null) : null,
  }).returning();

  res.status(201).json({
    id: slot.id,
    childId: slot.childId,
    placeId: slot.placeId,
    placeName: place.placeName,
    placeAddress: place.address,
    placeType: place.type,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    primaryGuardianId: slot.primaryGuardianId,
    backupGuardianId: slot.backupGuardianId,
    primaryGuardianName: null,
    backupGuardianName: null,
    mobilityType: slot.mobilityType,
    shuttleArrivalTime: slot.shuttleArrivalTime || null,
    parentAccompany: slot.parentAccompany,
    dropOffType: slot.dropOffType || null,
    dropOffGuardianId: slot.dropOffGuardianId || null,
    dropOffGuardianName: null,
    pickUpType: slot.pickUpType || null,
    pickUpShuttleArrivalTime: slot.pickUpShuttleArrivalTime || null,
    createdAt: slot.createdAt.toISOString(),
  });
});

router.put("/time-slots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTimeSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, params.data.id));
  if (!slot) {
    res.status(404).json({ error: "Time slot not found" });
    return;
  }

  if (!(await verifyChildFamily(req.session.userId!, slot.childId))) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [place] = await db.select().from(placesTable).where(eq(placesTable.id, slot.placeId));
  if (!place) {
    res.status(400).json({ error: "Place not found" });
    return;
  }

  const [slotChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, slot.childId));
  const existingPlaces = slotChild
    ? await db.select().from(placesTable).where(eq(placesTable.familyId, slotChild.familyId))
    : [];
  const placeMap = new Map(existingPlaces.map(p => [p.id, p]));

  if (place.type === "academy" || place.type === "care") {
    const slotStart = timeToMinutes(parsed.data.startTime);
    const slotEnd = timeToMinutes(parsed.data.endTime);
    const minStart = place.type === "care" ? 660 : 780;
    if (slotStart < minStart || slotStart > 1320 || slotEnd < minStart || slotEnd > 1320 || slotStart >= slotEnd) {
      const rangeMsg = place.type === "care"
        ? "돌봄 일정은 오전 11시부터 오후 10시 사이만 가능합니다"
        : "학원 일정은 오후 1시부터 오후 10시 사이만 가능합니다";
      res.status(400).json({ error: rangeMsg });
      return;
    }
  }

  const newStart = timeToMinutes(parsed.data.startTime);
  const newEnd = timeToMinutes(parsed.data.endTime);

  if (newStart >= newEnd) {
    res.status(400).json({ error: "종료 시간은 시작 시간보다 늦어야 합니다" });
    return;
  }

  const existingSlots = await db.select().from(timeSlotsTable).where(
    and(
      eq(timeSlotsTable.childId, slot.childId),
      eq(timeSlotsTable.dayOfWeek, slot.dayOfWeek)
    )
  );

  for (const existing of existingSlots) {
    if (existing.id === slot.id) continue;
    const exStart = timeToMinutes(existing.startTime);
    const exEnd = timeToMinutes(existing.endTime);

    if (newStart < exEnd && newEnd > exStart) {
      const conflictPlace = placeMap.get(existing.placeId);
      res.status(400).json({
        error: `${conflictPlace?.placeName || "다른 일정"}과 시간이 겹칩니다 (${existing.startTime}~${existing.endTime})`,
      });
      return;
    }
  }

  const [updated] = await db.update(timeSlotsTable).set({
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    primaryGuardianId: parsed.data.primaryGuardianId !== undefined ? (parsed.data.primaryGuardianId || null) : slot.primaryGuardianId,
    backupGuardianId: parsed.data.backupGuardianId !== undefined ? (parsed.data.backupGuardianId || null) : slot.backupGuardianId,
    mobilityType: parsed.data.mobilityType !== undefined ? (parsed.data.mobilityType || null) : slot.mobilityType,
    shuttleArrivalTime: parsed.data.mobilityType === "shuttle" ? (parsed.data.shuttleArrivalTime || null) : (parsed.data.mobilityType !== undefined ? null : slot.shuttleArrivalTime),
    parentAccompany: place.type === "school" ? (parsed.data.parentAccompany ?? slot.parentAccompany) : slot.parentAccompany,
    dropOffType: parsed.data.dropOffType !== undefined ? (parsed.data.dropOffType || null) : slot.dropOffType,
    dropOffGuardianId: (() => {
      const newDropOffType = parsed.data.dropOffType !== undefined ? parsed.data.dropOffType : slot.dropOffType;
      if (newDropOffType !== "parent") return null;
      return parsed.data.dropOffGuardianId !== undefined ? (parsed.data.dropOffGuardianId || null) : slot.dropOffGuardianId;
    })(),
    pickUpType: parsed.data.pickUpType !== undefined ? (parsed.data.pickUpType || null) : slot.pickUpType,
    pickUpShuttleArrivalTime: parsed.data.pickUpType === "shuttle" ? (parsed.data.pickUpShuttleArrivalTime || null) : (parsed.data.pickUpType !== undefined ? null : slot.pickUpShuttleArrivalTime),
  }).where(eq(timeSlotsTable.id, params.data.id)).returning();

  const guardianMap = new Map<number, string>();
  const userIds = new Set<number>();
  if (updated.primaryGuardianId) userIds.add(updated.primaryGuardianId);
  if (updated.backupGuardianId) userIds.add(updated.backupGuardianId);
  if (updated.dropOffGuardianId) userIds.add(updated.dropOffGuardianId);
  if (userIds.size > 0) {
    const guardians = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    guardians.forEach(g => guardianMap.set(g.id, g.name));
  }

  res.json({
    id: updated.id,
    childId: updated.childId,
    placeId: updated.placeId,
    placeName: place.placeName,
    placeAddress: place.address,
    placeType: place.type,
    dayOfWeek: updated.dayOfWeek,
    startTime: updated.startTime,
    endTime: updated.endTime,
    primaryGuardianId: updated.primaryGuardianId,
    backupGuardianId: updated.backupGuardianId,
    primaryGuardianName: updated.primaryGuardianId ? guardianMap.get(updated.primaryGuardianId) || null : null,
    backupGuardianName: updated.backupGuardianId ? guardianMap.get(updated.backupGuardianId) || null : null,
    mobilityType: updated.mobilityType,
    shuttleArrivalTime: updated.shuttleArrivalTime || null,
    parentAccompany: updated.parentAccompany,
    dropOffType: updated.dropOffType || null,
    dropOffGuardianId: updated.dropOffGuardianId || null,
    dropOffGuardianName: updated.dropOffGuardianId ? guardianMap.get(updated.dropOffGuardianId) || null : null,
    pickUpType: updated.pickUpType || null,
    pickUpShuttleArrivalTime: updated.pickUpShuttleArrivalTime || null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/time-slots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTimeSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const queryParams = DeleteTimeSlotQueryParams.safeParse(req.query);

  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, params.data.id));
  if (!slot) {
    res.status(404).json({ error: "Time slot not found" });
    return;
  }

  if (!(await verifyChildFamily(req.session.userId!, slot.childId))) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  if (queryParams.success && queryParams.data.deleteAll) {
    await db.delete(timeSlotsTable).where(
      and(
        eq(timeSlotsTable.childId, slot.childId),
        eq(timeSlotsTable.placeId, slot.placeId),
        gte(timeSlotsTable.startTime, slot.startTime)
      )
    );
  } else {
    await db.delete(timeSlotsTable).where(eq(timeSlotsTable.id, params.data.id));
  }

  res.sendStatus(204);
});

export default router;
