-- Migration: Move places from per-child to per-family
-- Task: 장소를 가족 단위로 공유 (task-25)
--
-- This migration MUST be run BEFORE applying the schema change in schedules.ts
-- (i.e., before running db:push which will enforce family_id NOT NULL + FK).
--
-- Step 1: Add family_id column (nullable initially to allow backfill)
ALTER TABLE places ADD COLUMN IF NOT EXISTS family_id integer;

-- Step 2: Backfill family_id from children table
UPDATE places p
SET family_id = c.family_id
FROM children c
WHERE p.child_id = c.id;

-- Step 3: Verify no nulls remain (should be 0)
-- SELECT COUNT(*) FROM places WHERE family_id IS NULL;

-- Step 4: Drop old FK constraint on child_id
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_child_id_children_id_fk;

-- Step 5: Drop child_id column
ALTER TABLE places DROP COLUMN IF EXISTS child_id;

-- Step 6: Now run `pnpm --filter @workspace/db run push-force` to apply:
--   - NOT NULL constraint on family_id
--   - FK constraint: places_family_id_families_id_fk
