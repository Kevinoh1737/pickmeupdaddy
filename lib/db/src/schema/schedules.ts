import { pgTable, text, serial, timestamp, integer, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { familiesTable } from "./families";
import { childrenTable } from "./children";
import { usersTable } from "./users";

export const placesTable = pgTable("places", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  placeName: text("place_name").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const timeSlotsTable = pgTable("time_slots", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
  placeId: integer("place_id").notNull().references(() => placesTable.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  primaryGuardianId: integer("primary_guardian_id").references(() => usersTable.id),
  backupGuardianId: integer("backup_guardian_id").references(() => usersTable.id),
  mobilityType: text("mobility_type"),
  shuttleArrivalTime: text("shuttle_arrival_time"),
  parentAccompany: boolean("parent_accompany").notNull().default(false),
  dropOffType: text("drop_off_type"),
  dropOffGuardianId: integer("drop_off_guardian_id").references(() => usersTable.id),
  pickUpType: text("pick_up_type"),
  pickUpShuttleArrivalTime: text("pick_up_shuttle_arrival_time"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlaceSchema = createInsertSchema(placesTable).omit({ id: true, createdAt: true });
export type InsertPlace = z.infer<typeof insertPlaceSchema>;
export type Place = typeof placesTable.$inferSelect;

export const insertTimeSlotSchema = createInsertSchema(timeSlotsTable).omit({ id: true, createdAt: true });
export type InsertTimeSlot = z.infer<typeof insertTimeSlotSchema>;
export type TimeSlot = typeof timeSlotsTable.$inferSelect;
