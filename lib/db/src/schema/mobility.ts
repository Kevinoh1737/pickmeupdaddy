import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { timeSlotsTable } from "./schedules";
import { usersTable } from "./users";

export const mobilityTable = pgTable("mobility", {
  id: serial("id").primaryKey(),
  timeSlotId: integer("time_slot_id").notNull().references(() => timeSlotsTable.id, { onDelete: "cascade" }).unique(),
  type: text("type").notNull(),
  guardianId: integer("guardian_id").references(() => usersTable.id),
});

export const insertMobilitySchema = createInsertSchema(mobilityTable).omit({ id: true });
export type InsertMobility = z.infer<typeof insertMobilitySchema>;
export type Mobility = typeof mobilityTable.$inferSelect;
