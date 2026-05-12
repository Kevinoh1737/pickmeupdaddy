import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, mobilityTable, usersTable, timeSlotsTable, childrenTable } from "@workspace/db";
import { GetMobilityParams, SetMobilityParams, SetMobilityBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

async function verifyTimeSlotFamily(userId: number, timeSlotId: number): Promise<boolean> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.familyId) return false;
  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, timeSlotId));
  if (!slot) return false;
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, slot.childId));
  if (!child) return false;
  return child.familyId === user.familyId;
}

const router: IRouter = Router();

router.get("/time-slots/:timeSlotId/mobility", requireAuth, async (req, res): Promise<void> => {
  const params = GetMobilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await verifyTimeSlotFamily(req.session.userId!, params.data.timeSlotId))) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [mobility] = await db.select().from(mobilityTable).where(eq(mobilityTable.timeSlotId, params.data.timeSlotId));
  if (!mobility) {
    res.json({ id: 0, timeSlotId: params.data.timeSlotId, type: "parent", guardianId: null, guardianName: null });
    return;
  }

  let guardianName: string | null = null;
  if (mobility.guardianId) {
    const [guardian] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, mobility.guardianId));
    guardianName = guardian?.name || null;
  }

  res.json({
    id: mobility.id,
    timeSlotId: mobility.timeSlotId,
    type: mobility.type,
    guardianId: mobility.guardianId,
    guardianName,
  });
});

router.put("/time-slots/:timeSlotId/mobility", requireAuth, async (req, res): Promise<void> => {
  const params = SetMobilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await verifyTimeSlotFamily(req.session.userId!, params.data.timeSlotId))) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const parsed = SetMobilityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(mobilityTable).where(eq(mobilityTable.timeSlotId, params.data.timeSlotId));

  let mobility;
  if (existing.length > 0) {
    [mobility] = await db.update(mobilityTable)
      .set({ type: parsed.data.type, guardianId: parsed.data.guardianId || null })
      .where(eq(mobilityTable.timeSlotId, params.data.timeSlotId))
      .returning();
  } else {
    [mobility] = await db.insert(mobilityTable).values({
      timeSlotId: params.data.timeSlotId,
      type: parsed.data.type,
      guardianId: parsed.data.guardianId || null,
    }).returning();
  }

  let guardianName: string | null = null;
  if (mobility.guardianId) {
    const [guardian] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, mobility.guardianId));
    guardianName = guardian?.name || null;
  }

  res.json({
    id: mobility.id,
    timeSlotId: mobility.timeSlotId,
    type: mobility.type,
    guardianId: mobility.guardianId,
    guardianName,
  });
});

export default router;
