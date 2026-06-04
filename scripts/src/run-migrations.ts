import pg from "pg";

const { Pool } = pg;

// Migrations run heavy DDL — use the direct/session connection, not the
// transaction pooler (which DATABASE_URL points at for the serverless runtime).
const migrationUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!migrationUrl) {
  console.error("DATABASE_URL_DIRECT or DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: migrationUrl,
  ssl: migrationUrl.includes("supabase.") ? { rejectUnauthorized: false } : undefined,
});

async function run() {
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS sent_notifications (
        id SERIAL PRIMARY KEY,
        notification_key TEXT NOT NULL,
        sent_date TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT sent_notifications_key_date_unique UNIQUE (notification_key, sent_date)
      );
    `);

    console.log("All migrations applied successfully");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
