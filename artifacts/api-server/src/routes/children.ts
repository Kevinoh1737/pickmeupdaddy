import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, childrenTable } from "@workspace/db";
import { CreateChildBody, UpdateChildBody, UpdateChildParams, DeleteChildParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

function formatChild(c: typeof childrenTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    familyId: c.familyId,
    deviationAlertsEnabled: c.deviationAlertsEnabled,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/children", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.familyId) {
    res.json([]);
    return;
  }

  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, user.familyId));
  res.json(children.map(formatChild));
});

router.post("/children", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateChildBody.safeParse(req.body);
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

  if (user.role !== "owner") {
    res.status(403).json({ error: "아이 추가는 가족 대표만 가능합니다" });
    return;
  }

  const [child] = await db.insert(childrenTable).values({
    name: parsed.data.name,
    familyId: user.familyId,
  }).returning();

  res.status(201).json(formatChild(child));
});

router.patch("/children/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateChildParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateChildBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [child] = await db.update(childrenTable)
    .set(parsed.data)
    .where(eq(childrenTable.id, params.data.id))
    .returning();

  if (!child) {
    res.status(404).json({ error: "Child not found" });
    return;
  }

  res.json(formatChild(child));
});

const DeviationAlertsBody = z.object({
  enabled: z.boolean(),
});

const ChildIdParam = z.object({
  id: z.coerce.number().int().positive(),
});

router.put("/children/:id/deviation-alerts", requireAuth, async (req, res): Promise<void> => {
  const paramParsed = ChildIdParam.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ error: "유효하지 않은 child id입니다" });
    return;
  }

  const bodyParsed = DeviationAlertsBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.familyId) {
    res.status(403).json({ error: "가족에 속해 있지 않습니다" });
    return;
  }

  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, paramParsed.data.id));
  if (!child || child.familyId !== user.familyId) {
    res.status(403).json({ error: "이 자녀에 접근할 수 없습니다" });
    return;
  }

  const [updated] = await db.update(childrenTable)
    .set({ deviationAlertsEnabled: bodyParsed.data.enabled })
    .where(eq(childrenTable.id, paramParsed.data.id))
    .returning();

  res.json(formatChild(updated));
});

router.delete("/children/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteChildParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [child] = await db.delete(childrenTable)
    .where(eq(childrenTable.id, params.data.id))
    .returning();

  if (!child) {
    res.status(404).json({ error: "Child not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
