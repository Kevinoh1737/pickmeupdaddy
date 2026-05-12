import OpenAI from "openai";
import { pool } from "@workspace/db";
import { sendPushToUser, ensureVapidConfigured } from "./push";
import { logger } from "./logger";

const DEVIATION_THRESHOLD_M = 350;
const COOLDOWN_MINUTES = 30;
const MIN_HISTORY_POINTS = 5;
const KST_ZONE = "Asia/Seoul";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  openaiClient = new OpenAI({ baseURL, apiKey });
  return openaiClient;
}

async function generateAlertMessage(
  childName: string,
  distanceM: number,
  nearestPlaceName: string | null,
  kstHour: number,
): Promise<string> {
  const client = getOpenAIClient();
  const timeLabel = kstHour < 12 ? "오전" : "오후";
  const hour12 = kstHour % 12 === 0 ? 12 : kstHour % 12;
  const timeStr = `${timeLabel} ${hour12}시`;

  if (!client) {
    return fallbackMessage(childName, distanceM, nearestPlaceName, timeStr);
  }

  try {
    const context = nearestPlaceName
      ? `현재 위치 근처의 등록된 장소: ${nearestPlaceName}`
      : "현재 위치 근처에 등록된 장소 없음";

    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            "당신은 부모에게 아이의 경로 이탈을 알리는 한국어 Push 알림 메시지를 작성합니다. 메시지는 50자 이내의 간결하고 명확한 한국어로 작성하고, 🚨 이모지로 시작하세요. 불필요한 설명 없이 핵심 정보만 전달하세요.",
        },
        {
          role: "user",
          content: `아이 이름: ${childName}\n이탈 거리: 약 ${Math.round(distanceM)}m\n시간대: ${timeStr}\n${context}\n\n위 정보를 바탕으로 부모에게 보낼 경로 이탈 알림 메시지를 작성해주세요.`,
        },
      ],
      max_tokens: 100,
      temperature: 0.3,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ??
      fallbackMessage(childName, distanceM, nearestPlaceName, timeStr)
    );
  } catch (err) {
    logger.warn({ err }, "AI alert message generation failed, using fallback");
    return fallbackMessage(childName, distanceM, nearestPlaceName, timeStr);
  }
}

function fallbackMessage(
  childName: string,
  distanceM: number,
  nearestPlaceName: string | null,
  timeStr: string,
): string {
  return nearestPlaceName
    ? `🚨 ${childName}이(가) ${timeStr} 평소 경로에서 약 ${Math.round(distanceM)}m 이탈했습니다. (근처: ${nearestPlaceName})`
    : `🚨 ${childName}이(가) ${timeStr} 평소 경로에서 약 ${Math.round(distanceM)}m 이탈했습니다.`;
}

export async function checkDeviationAndAlert(params: {
  childId: number;
  familyId: number;
  childName: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const { childId, familyId, childName, lat, lng } = params;

  const client = await pool.connect();
  try {
    const { rows: [childRow] } = await client.query<{ deviation_alerts_enabled: boolean }>(
      `SELECT deviation_alerts_enabled FROM children WHERE id = $1`,
      [childId],
    );
    if (!childRow?.deviation_alerts_enabled) return;

    const { rows: [nowRow] } = await client.query<{ dow: number; hour: number }>(
      `SELECT
         EXTRACT(DOW FROM NOW() AT TIME ZONE $1)::int AS dow,
         EXTRACT(HOUR FROM NOW() AT TIME ZONE $1)::int AS hour`,
      [KST_ZONE],
    );
    const { dow: kstDow, hour: kstHour } = nowRow;

    const { rows: historyRows } = await client.query<{ lat: number; lng: number }>(
      `SELECT lat, lng
       FROM child_location_history
       WHERE child_id = $1
         AND EXTRACT(DOW FROM recorded_at AT TIME ZONE $2) = $3
         AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) = $4
         AND recorded_at > NOW() - INTERVAL '30 days'
         AND recorded_at < NOW() - INTERVAL '2 minutes'
       LIMIT 200`,
      [childId, KST_ZONE, kstDow, kstHour],
    );

    if (historyRows.length < MIN_HISTORY_POINTS) return;

    const centroidLat = historyRows.reduce((sum, r) => sum + r.lat, 0) / historyRows.length;
    const centroidLng = historyRows.reduce((sum, r) => sum + r.lng, 0) / historyRows.length;
    const distanceM = haversineMeters(lat, lng, centroidLat, centroidLng);

    if (distanceM <= DEVIATION_THRESHOLD_M) return;

    const { rows: [inserted] } = await client.query<{ id: number }>(
      `INSERT INTO child_deviation_alerts (child_id, alerted_at)
       SELECT $1, NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM child_deviation_alerts
         WHERE child_id = $1
           AND alerted_at > NOW() - INTERVAL '${COOLDOWN_MINUTES} minutes'
       )
       RETURNING id`,
      [childId],
    );
    if (!inserted) return;

    const { rows: placesRows } = await client.query<{ place_name: string; lat: number; lng: number }>(
      `SELECT place_name, lat, lng FROM places WHERE family_id = $1 AND lat IS NOT NULL AND lng IS NOT NULL`,
      [familyId],
    );
    let nearestPlaceName: string | null = null;
    if (placesRows.length > 0) {
      let minDist = Infinity;
      for (const place of placesRows) {
        const d = haversineMeters(lat, lng, place.lat, place.lng);
        if (d < minDist) {
          minDist = d;
          nearestPlaceName = place.place_name;
        }
      }
    }

    const message = await generateAlertMessage(childName, distanceM, nearestPlaceName, kstHour);

    const { rows: guardianRows } = await client.query<{ id: number }>(
      `SELECT id FROM users
       WHERE family_id = $1
         AND role IN ('owner', 'guardian')`,
      [familyId],
    );

    ensureVapidConfigured();
    const pushPromises = guardianRows.map(g =>
      sendPushToUser(g.id, {
        title: "경로 이탈 감지",
        body: message,
        url: "/map",
      }).catch(err => logger.warn({ err, userId: g.id }, "Failed to send deviation push")),
    );
    await Promise.all(pushPromises);

    logger.info(
      { childId, childName, distanceM: Math.round(distanceM), familyId },
      "Child route deviation detected and alert sent",
    );
  } catch (err) {
    logger.error({ err, childId }, "Deviation check error");
  } finally {
    client.release();
  }
}
