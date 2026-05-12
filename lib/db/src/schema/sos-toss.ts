import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { timeSlotsTable } from "./schedules";

export const sosTossTable = pgTable("sos_toss", {
  id: serial("id").primaryKey(),
  fromGuardianId: integer("from_guardian_id").notNull().references(() => usersTable.id),
  toGuardianId: integer("to_guardian_id").notNull().references(() => usersTable.id),
  transferredSchedules: integer("transferred_schedules").notNull().default(0),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  pendingSlotIds: text("pending_slot_ids"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSosTossSchema = createInsertSchema(sosTossTable).omit({ id: true, createdAt: true });
export type InsertSosToss = z.infer<typeof insertSosTossSchema>;
export type SosToss = typeof sosTossTable.$inferSelect;

export const sosRequestsTable = pgTable("sos_requests", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => usersTable.id),
  toUserId: integer("to_user_id").notNull().references(() => usersTable.id),
  timeSlotId: integer("time_slot_id").notNull().references(() => timeSlotsTable.id),
  status: text("status").notNull().default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export const insertSosRequestSchema = createInsertSchema(sosRequestsTable).omit({ id: true, createdAt: true, respondedAt: true });
export type InsertSosRequest = z.infer<typeof insertSosRequestSchema>;
export type SosRequest = typeof sosRequestsTable.$inferSelect;
