import app from "./app";
import { logger } from "./lib/logger";
import { startNotificationScheduler } from "./scheduler";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS drop_off_type TEXT;
      ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS pick_up_type TEXT;
      ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS pick_up_shuttle_arrival_time TEXT;
    `);
    await client.query(`
      ALTER TABLE family_locations ADD COLUMN IF NOT EXISTS child_id INTEGER REFERENCES children(id) ON DELETE CASCADE;
    `);
    await client.query(`
      ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS drop_off_guardian_id INTEGER REFERENCES users(id);
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'family_locations_user_id_unique'
            AND conrelid = 'family_locations'::regclass
        ) THEN
          ALTER TABLE family_locations DROP CONSTRAINT family_locations_user_id_unique;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS family_locations_parent_uniq
        ON family_locations (user_id) WHERE child_id IS NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS family_locations_child_uniq
        ON family_locations (user_id, child_id) WHERE child_id IS NOT NULL;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'guardian';
    `);
    await client.query(`
      UPDATE users u SET role = 'owner'
      WHERE u.family_id IS NOT NULL
        AND u.id = (SELECT MIN(u2.id) FROM users u2 WHERE u2.family_id = u.family_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS family_member_aliases (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT family_member_aliases_user_target_unique UNIQUE (user_id, target_user_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS child_location_history (
        id SERIAL PRIMARY KEY,
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        accuracy REAL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS child_location_history_child_recorded_idx
        ON child_location_history (child_id, recorded_at);
    `);
    await client.query(`
      DELETE FROM child_location_history
        WHERE recorded_at < NOW() - INTERVAL '14 days';
    `);
    await client.query(`
      ALTER TABLE children ADD COLUMN IF NOT EXISTS deviation_alerts_enabled BOOLEAN NOT NULL DEFAULT false;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS child_deviation_alerts (
        id SERIAL PRIMARY KEY,
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS child_deviation_alerts_child_idx
        ON child_deviation_alerts (child_id, alerted_at);
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'onboarding_completed'
        ) THEN
          ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false;
          UPDATE users SET onboarding_completed = true;
        END IF;
      END $$;
    `);
    logger.info("Startup migrations applied successfully");
  } catch (err) {
    logger.error({ err }, "Startup migration failed");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * One-time production data cleanup (2026-04-10).
 * Runs ONLY in production (REPLIT_DEPLOYMENT set), is NON-FATAL, and is fully idempotent.
 *
 * Context: During early dev testing the following were created in production:
 *  1. user_id=2 (newcfo@daum.net) was assigned family_id=1 (Kevin's family) instead of
 *     their own family_id=2, which was auto-created at account registration time
 *     (confirmed: families.id=2 created_at matches user.created_at for user_id=2).
 *  2. sos_toss rows 1,2,3 were cross-family records (user_id=2 ↔ user_id=4).
 */
async function runProductionOneTimeCleanup() {
  if (!process.env.REPLIT_DEPLOYMENT) return;
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    logger.warn({ err }, "Prod one-time cleanup: could not acquire DB client (non-fatal)");
    return;
  }
  try {
    // Step 1: Pre-check — only run if user_id=2 is still incorrectly in family_id=1
    const { rows: [user2] } = await client.query(
      `SELECT id, family_id FROM users WHERE id = 2 LIMIT 1;`
    );
    if (!user2) {
      logger.warn("Prod cleanup skipped: user_id=2 not found");
      return;
    }
    if (user2.family_id !== 1) {
      logger.info({ family_id: user2.family_id }, "Prod cleanup: user_id=2 already moved, skipping");
    } else {
      // Step 2: Create a brand-new family for user_id=2 (INSERT DEFAULT VALUES → RETURNING id)
      const { rows: [newFamily] } = await client.query(
        `INSERT INTO families DEFAULT VALUES RETURNING id;`
      );

      // Step 3: Move user_id=2 to the newly created family
      const { rowCount: movedCount } = await client.query(
        `UPDATE users SET family_id = $1 WHERE id = 2 AND family_id = 1;`,
        [newFamily.id]
      );
      logger.info({ newFamilyId: newFamily.id, movedCount }, "Prod cleanup: user_id=2 moved to new family");
    }

    // Step 4: Pre-check sos_toss — only delete records involving cross-family participants
    const { rows: sosBefore } = await client.query(
      `SELECT id, from_guardian_id, to_guardian_id FROM sos_toss
       WHERE id IN (1, 2, 3)
         AND (from_guardian_id IN (2, 4) OR to_guardian_id IN (2, 4));`
    );
    if (sosBefore.length > 0) {
      const idsToDelete = sosBefore.map((r: { id: number }) => r.id);
      const { rowCount: deletedCount } = await client.query(
        `DELETE FROM sos_toss
         WHERE id = ANY($1)
           AND (from_guardian_id IN (2, 4) OR to_guardian_id IN (2, 4));`,
        [idsToDelete]
      );
      logger.info({ sosDeletedIds: idsToDelete, deletedCount }, "Prod cleanup: cross-family SOS records deleted");
    } else {
      logger.info("Prod cleanup: no cross-family SOS toss records found (already cleaned or never existed)");
    }
  } catch (err) {
    logger.warn({ err }, "Prod one-time cleanup failed (non-fatal)");
  } finally {
    client.release();
  }
}

runStartupMigrations().then(() => {
  return runProductionOneTimeCleanup();
}).then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    startNotificationScheduler();
  });
}).catch((err) => {
  logger.error({ err }, "Failed to run startup migrations, exiting");
  process.exit(1);
});
