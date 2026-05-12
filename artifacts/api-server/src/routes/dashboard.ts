import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, childrenTable, timeSlotsTable, placesTable, sosTossTable } from "@workspace/db";
import { CalculateLeaveAtBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getScheduleStatus(startTime: string, endTime: string): "upcoming" | "in_progress" | "completed" {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (currentMinutes < start) return "upcoming";
  if (currentMinutes >= start && currentMinutes <= end) return "in_progress";
  return "completed";
}

const router: IRouter = Router();

router.get("/dashboard/today", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rawFilter = req.query.filter as string | undefined;
  const filter = rawFilter === "all" ? "all" : "mine";
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.json({ date: new Date().toISOString().split("T")[0], totalPickups: 0, completedPickups: 0, activeWarnings: 0, items: [] });
    return;
  }

  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  const childIds = children.map(c => c.id);
  const childMap = new Map(children.map(c => [c.id, c.name]));

  if (childIds.length === 0) {
    res.json({ date: new Date().toISOString().split("T")[0], totalPickups: 0, completedPickups: 0, activeWarnings: 0, items: [] });
    return;
  }

  const today = new Date();
  const dayOfWeek = today.getDay();

  const allSlots = await db.select().from(timeSlotsTable);
  let todaySlots = allSlots.filter(s => childIds.includes(s.childId) && s.dayOfWeek === dayOfWeek);

  if (filter === "mine") {
    todaySlots = todaySlots.filter(s =>
      s.primaryGuardianId === userId ||
      (s.dropOffGuardianId === userId && s.dropOffType === "parent")
    );
  }

  const allPlaces = await db.select().from(placesTable);
  const placeMap = new Map(allPlaces.map(p => [p.id, p]));

  const guardianIds = new Set<number>();
  todaySlots.forEach(s => {
    if (s.primaryGuardianId) guardianIds.add(s.primaryGuardianId);
  });

  const guardianMap = new Map<number, string>();
  if (guardianIds.size > 0) {
    const guardians = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    guardians.forEach(g => guardianMap.set(g.id, g.name));
  }

  const computeMyRole = (s: typeof todaySlots[0]): "dropOff" | "pickUp" | "both" | null => {
    if (filter !== "mine") return null;
    const isDropOff = s.dropOffGuardianId === userId && s.dropOffType === "parent";
    const isPickUp = s.primaryGuardianId === userId;
    if (isDropOff && isPickUp) return "both";
    if (isDropOff) return "dropOff";
    if (isPickUp) return "pickUp";
    return null;
  };

  const items: Array<{
    timeSlotId: number;
    childId: number;
    childName: string;
    placeName: string;
    address: string;
    startTime: string;
    endTime: string;
    mobilityType: string | null;
    dropOffType: string | null;
    pickUpType: string | null;
    myRole: "dropOff" | "pickUp" | "both" | null;
    guardianId: number | null;
    guardianName: string | null;
    status: string;
    warning: string | null;
  }> = todaySlots
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    .map(s => {
      const place = placeMap.get(s.placeId);
      const status = getScheduleStatus(s.startTime, s.endTime);
      return {
        timeSlotId: s.id,
        childId: s.childId,
        childName: childMap.get(s.childId) || "",
        placeName: place?.placeName || "",
        address: place?.address || "",
        startTime: s.startTime,
        endTime: s.endTime,
        mobilityType: s.mobilityType,
        dropOffType: s.dropOffType,
        pickUpType: s.pickUpType,
        myRole: computeMyRole(s),
        guardianId: s.primaryGuardianId,
        guardianName: s.primaryGuardianId ? guardianMap.get(s.primaryGuardianId) || null : null,
        status,
        warning: null,
      };
    });

  let warnings = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const gap = timeToMinutes(items[i + 1].startTime) - timeToMinutes(items[i].endTime);
    if (gap < 15 && gap >= 0) {
      items[i + 1].warning = `Only ${gap}min gap from previous schedule`;
      items[i + 1].status = "warning";
      warnings++;
    }
  }

  const completedPickups = items.filter(i => i.status === "completed").length;

  res.json({
    date: today.toISOString().split("T")[0],
    totalPickups: items.length,
    completedPickups,
    activeWarnings: warnings,
    items,
  });
});

router.get("/dashboard/weekly", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const fmtLocalDate = (d: Date) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const ddd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${ddd}`;
  };

  if (!user || !user.familyId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today.getTime() + 6 * 86400000);
    res.json({ startDate: fmtLocalDate(today), endDate: fmtLocalDate(end), days: [] });
    return;
  }

  const rawStartDate = req.query.startDate as string | undefined;
  let startDate: Date;
  if (rawStartDate && /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)) {
    const parts = rawStartDate.split("-").map(Number);
    const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(parsed.getTime()) || parsed.getFullYear() !== parts[0] || parsed.getMonth() !== parts[1] - 1 || parsed.getDate() !== parts[2]) {
      res.status(400).json({ message: "유효하지 않은 날짜입니다" });
      return;
    }
    startDate = parsed;
  } else {
    startDate = new Date();
  }
  startDate.setHours(0, 0, 0, 0);
  const dayOffset = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOffset);

  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  const childIds = children.map(c => c.id);
  const childMap = new Map(children.map(c => [c.id, c.name]));

  const allSlots = await db.select().from(timeSlotsTable);
  const familySlots = allSlots.filter(s => childIds.includes(s.childId));

  const allPlaces = await db.select().from(placesTable);
  const placeMap = new Map(allPlaces.map(p => [p.id, p]));

  const guardianMap = new Map<number, string>();
  const guardians = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  guardians.forEach(g => guardianMap.set(g.id, g.name));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime() + i * 86400000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${dd}`;
    const dow = date.getDay();

    const daySlots = familySlots
      .filter(s => s.dayOfWeek === dow)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const items = daySlots.map((s, idx) => {
      const place = placeMap.get(s.placeId);
      let hasWarning = false;
      let warningMessage: string | null = null;

      if (idx > 0) {
        const prevEnd = timeToMinutes(daySlots[idx - 1].endTime);
        const curStart = timeToMinutes(s.startTime);
        const gap = curStart - prevEnd;
        if (gap < 15 && gap >= 0) {
          hasWarning = true;
          const prevPlace = placeMap.get(daySlots[idx - 1].placeId);
          warningMessage = `Only ${gap}min gap from ${prevPlace?.placeName || "이전 일정"}`;
        }
      }

      return {
        timeSlotId: s.id,
        childName: childMap.get(s.childId) || "",
        placeName: place?.placeName || "",
        startTime: s.startTime,
        endTime: s.endTime,
        type: (place?.type || "academy") as "school" | "academy" | "care" | "home",
        mobilityType: s.mobilityType,
        guardianName: s.primaryGuardianId ? guardianMap.get(s.primaryGuardianId) || null : null,
        hasWarning,
        warningMessage,
      };
    });

    days.push({ date: dateStr, dayOfWeek: dow, items });
  }

  const endDate = new Date(startDate.getTime() + 6 * 86400000);

  res.json({
    startDate: fmtLocalDate(startDate),
    endDate: fmtLocalDate(endDate),
    days,
  });
});

router.get("/dashboard/warnings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.json([]);
    return;
  }

  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  const childIds = children.map(c => c.id);

  const allSlots = await db.select().from(timeSlotsTable);
  const familySlots = allSlots.filter(s => childIds.includes(s.childId));

  const allPlaces = await db.select().from(placesTable);
  const placeMap = new Map(allPlaces.map(p => [p.id, p]));

  const warnings: Array<{ id: number; type: string; message: string; timeSlotId: number; conflictTimeSlotId: number | null; gapMinutes: number | null; requiredMinutes: number | null }> = [];
  let warnId = 1;
  const seen = new Set<string>();

  for (let dow = 0; dow < 7; dow++) {
    const daySlots = familySlots
      .filter(s => s.dayOfWeek === dow)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    for (let i = 0; i < daySlots.length - 1; i++) {
      const curr = daySlots[i];
      const next = daySlots[i + 1];
      const pairKey = `${Math.min(curr.id, next.id)}-${Math.max(curr.id, next.id)}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const gap = timeToMinutes(next.startTime) - timeToMinutes(curr.endTime);

      const currPlace = placeMap.get(curr.placeId);
      const nextPlace = placeMap.get(next.placeId);

      if (gap < 0) {
        warnings.push({
          id: warnId++,
          type: "overlap",
          message: `"${currPlace?.placeName}" and "${nextPlace?.placeName}" overlap`,
          timeSlotId: curr.id,
          conflictTimeSlotId: next.id,
          gapMinutes: null,
          requiredMinutes: null,
        });
      } else if (gap < 15) {
        warnings.push({
          id: warnId++,
          type: "gap_too_short",
          message: `Only ${gap}min between "${currPlace?.placeName}" and "${nextPlace?.placeName}"`,
          timeSlotId: curr.id,
          conflictTimeSlotId: next.id,
          gapMinutes: gap,
          requiredMinutes: 15,
        });
      }
    }
  }

  res.json(warnings);
});

router.post("/dashboard/leave-at", requireAuth, async (req, res): Promise<void> => {
  const parsed = CalculateLeaveAtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { latitude, longitude, timeSlotId } = parsed.data;

  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, timeSlotId));
  if (!slot) {
    res.status(404).json({ error: "Time slot not found" });
    return;
  }

  const familyChildren = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  const familyChildIds = familyChildren.map(c => c.id);
  if (!familyChildIds.includes(slot.childId)) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [place] = await db.select().from(placesTable).where(eq(placesTable.id, slot.placeId));

  const estimatedMinutes = 15 + Math.floor(Math.random() * 20);

  const now = new Date();
  const startMinutes = timeToMinutes(slot.startTime);
  const leaveByMinutes = startMinutes - estimatedMinutes;
  const leaveByTime = minutesToTime(Math.max(0, leaveByMinutes));

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const shouldLeaveNow = currentMinutes >= leaveByMinutes - 5;

  let message: string;
  if (shouldLeaveNow) {
    message = "지금 출발해야 합니다!";
  } else {
    const minutesUntilLeave = leaveByMinutes - currentMinutes;
    if (minutesUntilLeave <= 30) {
      message = `${minutesUntilLeave}분 후 출발하세요`;
    } else {
      message = `${leaveByTime}에 출발하세요`;
    }
  }

  res.json({
    timeSlotId,
    placeName: place?.placeName || "",
    estimatedMinutes,
    leaveByTime,
    arrivalTime: slot.startTime,
    shouldLeaveNow,
    message,
  });
});

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.json({ totalChildren: 0, totalSchedules: 0, todayPickups: 0, activeWarnings: 0, sosCount: 0, familyMembers: 0 });
    return;
  }

  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  const childIds = children.map(c => c.id);
  const allSlots = await db.select().from(timeSlotsTable);
  const familySlots = allSlots.filter(s => childIds.includes(s.childId));

  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayPickups = familySlots.filter(s => s.dayOfWeek === dayOfWeek).length;

  const familyMembers = await db.select().from(usersTable).where(eq(usersTable.familyId, user.familyId));

  const allSosRecords = await db.select().from(sosTossTable);
  const familyMemberIds = familyMembers.map(m => m.id);
  const sosCount = allSosRecords.filter(r => familyMemberIds.includes(r.fromGuardianId) || familyMemberIds.includes(r.toGuardianId)).length;

  res.json({
    totalChildren: children.length,
    totalSchedules: familySlots.length,
    todayPickups,
    activeWarnings: 0,
    sosCount,
    familyMembers: familyMembers.length,
  });
});

export default router;
