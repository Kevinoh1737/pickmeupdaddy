import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, familyLocationsTable, childrenTable, pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { checkDeviationAndAlert } from "../lib/deviation-detector";

const UpdateLocationBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  childId: z.number().int().positive().optional().nullable(),
});

const router: IRouter = Router();

router.put("/location", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const { lat, lng, accuracy, childId } = parsed.data;

  if (childId != null) {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!currentUser?.familyId) {
      res.status(403).json({ error: "가족에 속해 있지 않습니다" });
      return;
    }

    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
    if (!child || child.familyId !== currentUser.familyId) {
      res.status(403).json({ error: "이 자녀에 접근할 수 없습니다" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO family_locations (user_id, child_id, lat, lng, accuracy, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, child_id) WHERE child_id IS NOT NULL
         DO UPDATE SET lat = $3, lng = $4, accuracy = $5, updated_at = NOW()`,
        [userId, childId, lat, lng, accuracy ?? null],
      );
      await client.query(
        `INSERT INTO child_location_history (child_id, user_id, lat, lng, accuracy, recorded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [childId, userId, lat, lng, accuracy ?? null],
      );
    } finally {
      client.release();
    }

    const familyId = currentUser.familyId;
    const childName = child.name;
    setImmediate(() => {
      checkDeviationAndAlert({ childId, familyId, childName, lat, lng }).catch(() => {});
    });
  } else {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO family_locations (user_id, child_id, lat, lng, accuracy, updated_at)
         VALUES ($1, NULL, $2, $3, $4, NOW())
         ON CONFLICT (user_id) WHERE child_id IS NULL
         DO UPDATE SET lat = $2, lng = $3, accuracy = $4, updated_at = NOW()`,
        [userId, lat, lng, accuracy ?? null],
      );
    } finally {
      client.release();
    }
  }

  res.json({ ok: true });
});

router.get("/family/locations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (!currentUser?.familyId) {
    res.json([]);
    return;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      user_id: number;
      child_id: number | null;
      name: string;
      avatar_url: string | null;
      lat: number;
      lng: number;
      accuracy: number | null;
      updated_at: Date;
    }>(
      `SELECT
         fl.user_id,
         fl.child_id,
         CASE WHEN fl.child_id IS NULL THEN u.name ELSE c.name END AS name,
         CASE WHEN fl.child_id IS NULL THEN u.avatar_url ELSE NULL END AS avatar_url,
         fl.lat,
         fl.lng,
         fl.accuracy,
         fl.updated_at
       FROM family_locations fl
       JOIN users u ON fl.user_id = u.id
       LEFT JOIN children c ON fl.child_id = c.id
       WHERE u.family_id = $1
         AND fl.updated_at > NOW() - INTERVAL '12 hours'`,
      [currentUser.familyId],
    );

    const result = rows.map(row => ({
      userId: row.user_id,
      childId: row.child_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      lat: row.lat,
      lng: row.lng,
      accuracy: row.accuracy,
      updatedAt: row.updated_at.toISOString(),
      isMe: row.user_id === userId && row.child_id == null,
    }));

    res.json(result);
  } finally {
    client.release();
  }
});

router.get("/children/:childId/location-history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const childId = parseInt(req.params.childId, 10);

  if (isNaN(childId) || childId <= 0) {
    res.status(400).json({ error: "유효하지 않은 childId입니다" });
    return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser?.familyId) {
    res.status(403).json({ error: "가족에 속해 있지 않습니다" });
    return;
  }

  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
  if (!child || child.familyId !== currentUser.familyId) {
    res.status(403).json({ error: "이 자녀에 접근할 수 없습니다" });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      id: number;
      lat: number;
      lng: number;
      accuracy: number | null;
      recorded_at: Date;
    }>(
      `SELECT id, lat, lng, accuracy, recorded_at
       FROM child_location_history
       WHERE child_id = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'
       ORDER BY recorded_at ASC`,
      [childId],
    );

    res.json(rows.map(r => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      accuracy: r.accuracy,
      recordedAt: r.recorded_at.toISOString(),
    })));
  } finally {
    client.release();
  }
});

router.delete("/location/child/:childId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const childId = parseInt(req.params.childId, 10);

  if (isNaN(childId) || childId <= 0) {
    res.status(400).json({ error: "유효하지 않은 childId입니다" });
    return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser?.familyId) {
    res.status(403).json({ error: "가족에 속해 있지 않습니다" });
    return;
  }

  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
  if (!child || child.familyId !== currentUser.familyId) {
    res.status(403).json({ error: "이 자녀에 접근할 수 없습니다" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM family_locations WHERE user_id = $1 AND child_id = $2`,
      [userId, childId],
    );
  } finally {
    client.release();
  }

  res.json({ ok: true });
});

export default router;
