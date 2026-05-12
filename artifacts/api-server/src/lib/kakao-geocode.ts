const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local/search/keyword.json";

export interface PlaceSearchResult {
  placeName: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
}

interface KakaoDocument {
  place_name: string;
  road_address_name: string;
  address_name: string;
  y: string;
  x: string;
  phone: string;
}

interface KakaoLocalResponse {
  documents?: KakaoDocument[];
  meta?: { total_count: number };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function searchByCategory(
  query: string,
  categoryGroupCode: "AC5" | "SC4",
  userLat?: number,
  userLng?: number
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    query,
    category_group_code: categoryGroupCode,
    size: "15",
    sort: userLat != null && userLng != null ? "distance" : "accuracy",
  });
  if (userLat != null && userLng != null) {
    params.set("x", String(userLng));
    params.set("y", String(userLat));
  }
  const url = `${KAKAO_LOCAL_BASE}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[kakao-local] ${categoryGroupCode} search failed — status=${res.status} body=${errText}`);
      return [];
    }
    const data = await res.json() as KakaoLocalResponse;
    return (data.documents ?? []).map(doc => ({
      placeName: doc.place_name,
      address: doc.road_address_name || doc.address_name,
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      phone: doc.phone || undefined,
    }));
  } catch (err) {
    console.error(`[kakao-local] ${categoryGroupCode} network error:`, err);
    return [];
  }
}

async function searchByKeywordGeneral(
  query: string,
  userLat?: number,
  userLng?: number,
  size = 10
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    query,
    size: String(size),
    sort: userLat != null && userLng != null ? "distance" : "accuracy",
  });
  if (userLat != null && userLng != null) {
    params.set("x", String(userLng));
    params.set("y", String(userLat));
  }
  const url = `${KAKAO_LOCAL_BASE}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[kakao-local] general search failed — status=${res.status} body=${errText}`);
      return [];
    }
    const data = await res.json() as KakaoLocalResponse;
    return (data.documents ?? []).map(doc => ({
      placeName: doc.place_name,
      address: doc.road_address_name || doc.address_name,
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      phone: doc.phone || undefined,
    }));
  } catch (err) {
    console.error(`[kakao-local] general search network error:`, err);
    return [];
  }
}

export async function searchPlacesByKeyword(
  query: string,
  options?: { lat?: number; lng?: number }
): Promise<PlaceSearchResult[]> {
  if (!KAKAO_REST_API_KEY) {
    console.error("[kakao-local] KAKAO_REST_API_KEY is not set");
    return [];
  }

  const { lat, lng } = options ?? {};

  try {
    const [academyResults, schoolResults] = await Promise.all([
      searchByCategory(query, "AC5", lat, lng),
      searchByCategory(query, "SC4", lat, lng),
    ]);

    const seen = new Set<string>();
    const merged: PlaceSearchResult[] = [];

    for (const item of [...academyResults, ...schoolResults]) {
      const key = `${item.placeName}||${item.address}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    if (merged.length === 0) {
      const generalResults = await searchByKeywordGeneral(query, lat, lng, 10);
      for (const item of generalResults) {
        const key = `${item.placeName}||${item.address}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
    }

    if (lat != null && lng != null) {
      merged.sort(
        (a, b) =>
          haversineKm(lat, lng, a.lat, a.lng) -
          haversineKm(lat, lng, b.lat, b.lng)
      );
    }

    return merged.slice(0, 10);
  } catch (err) {
    console.error("[kakao-local] Unexpected error during place search:", err);
    return [];
  }
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_REST_API_KEY) return null;
  try {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { documents?: { y: string; x: string }[] };
    const doc = data.documents?.[0];
    if (!doc) return null;
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
  } catch {
    return null;
  }
}
