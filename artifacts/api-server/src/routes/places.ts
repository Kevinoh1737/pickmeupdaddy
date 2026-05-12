import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, placesTable, usersTable } from "@workspace/db";
import { CreateFamilyPlaceBody, UpdatePlaceParams, UpdatePlaceBody, DeletePlaceParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { geocodeAddress } from "../lib/kakao-geocode";

async function getUserFamilyId(userId: number): Promise<number | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user?.familyId ?? null;
}

function formatPlace(p: typeof placesTable.$inferSelect) {
  return {
    id: p.id,
    familyId: p.familyId,
    type: p.type,
    placeName: p.placeName,
    address: p.address,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

const router: IRouter = Router();

router.get("/family/places", requireAuth, async (req, res): Promise<void> => {
  const familyId = await getUserFamilyId(req.session.userId!);
  if (!familyId) {
    res.status(403).json({ error: "Not in a family" });
    return;
  }

  const places = await db.select().from(placesTable).where(eq(placesTable.familyId, familyId));
  res.json(places.map(formatPlace));
});

router.post("/family/places", requireAuth, async (req, res): Promise<void> => {
  const [callerUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!callerUser?.familyId) {
    res.status(403).json({ error: "Not in a family" });
    return;
  }

  if (callerUser.role !== "owner") {
    res.status(403).json({ error: "장소 추가는 가족 대표만 가능합니다" });
    return;
  }

  const familyId = callerUser.familyId;

  const parsed = CreateFamilyPlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.type !== "home" && !parsed.data.address) {
    res.status(400).json({ error: "집 타입이 아닌 경우 주소는 필수입니다" });
    return;
  }

  const address = parsed.data.address ?? "";
  let lat = parsed.data.lat ?? null;
  let lng = parsed.data.lng ?? null;
  if (lat == null || lng == null) {
    const coords = address ? await geocodeAddress(address) : null;
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const [place] = await db.insert(placesTable).values({
    familyId,
    type: parsed.data.type,
    placeName: parsed.data.placeName,
    address,
    lat,
    lng,
  }).returning();

  res.status(201).json(formatPlace(place));
});

router.patch("/places/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePlaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [place] = await db.select().from(placesTable).where(eq(placesTable.id, params.data.id));
  if (!place) {
    res.status(404).json({ error: "Place not found" });
    return;
  }

  const familyId = await getUserFamilyId(req.session.userId!);
  if (!familyId || place.familyId !== familyId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const parsed = UpdatePlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const effectiveType = parsed.data.type ?? place.type;
  if (parsed.data.address !== undefined && effectiveType !== "home" && !parsed.data.address) {
    res.status(400).json({ error: "집 타입이 아닌 경우 주소는 필수입니다" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.placeName !== undefined) updates.placeName = parsed.data.placeName;
  if (parsed.data.lat !== undefined) updates.lat = parsed.data.lat;
  if (parsed.data.lng !== undefined) updates.lng = parsed.data.lng;
  if (parsed.data.address !== undefined) {
    const updatedAddress = parsed.data.address;
    updates.address = updatedAddress;
    if (parsed.data.lat == null && parsed.data.lng == null) {
      if (updatedAddress) {
        const coords = await geocodeAddress(updatedAddress);
        updates.lat = coords?.lat ?? null;
        updates.lng = coords?.lng ?? null;
      } else {
        updates.lat = null;
        updates.lng = null;
      }
    }
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db.update(placesTable).set(updates).where(eq(placesTable.id, params.data.id)).returning();
  res.json(formatPlace(updated));
});

router.delete("/places/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePlaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [place] = await db.select().from(placesTable).where(eq(placesTable.id, params.data.id));
  if (!place) {
    res.status(404).json({ error: "Place not found" });
    return;
  }

  const familyId = await getUserFamilyId(req.session.userId!);
  if (!familyId || place.familyId !== familyId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await db.delete(placesTable).where(eq(placesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
