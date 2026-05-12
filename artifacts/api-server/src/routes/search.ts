import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { searchPlacesByKeyword } from "../lib/kakao-geocode";

const router: IRouter = Router();

router.get("/search/places", requireAuth, async (req, res): Promise<void> => {
  const query = String(req.query.query ?? "").trim();
  if (query.length < 2) {
    res.status(400).json({ error: "검색어는 2글자 이상이어야 합니다" });
    return;
  }

  const lat = req.query.lat !== undefined ? parseFloat(String(req.query.lat)) : undefined;
  const lng = req.query.lng !== undefined ? parseFloat(String(req.query.lng)) : undefined;

  const results = await searchPlacesByKeyword(query, {
    lat: lat != null && !isNaN(lat) ? lat : undefined,
    lng: lng != null && !isNaN(lng) ? lng : undefined,
  });

  res.json(results);
});

export default router;
