import { Router } from "express";
import { runNotificationCheck } from "../scheduler";
import { logger } from "../lib/logger";

const router = Router();

router.post("/cron/run-notifications", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: "CRON_SECRET not configured" });
    return;
  }

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await runNotificationCheck();
    logger.info({ sent: result.sent }, "Cron notification check completed");
    res.json({ ok: true, sent: result.sent });
  } catch (err) {
    logger.error({ err }, "Cron notification check failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
