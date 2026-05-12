import { pgTable, serial, integer, doublePrecision, timestamp, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { childrenTable } from "./children";

export const familyLocationsTable = pgTable("family_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  childId: integer("child_id").references(() => childrenTable.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: real("accuracy"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FamilyLocation = typeof familyLocationsTable.$inferSelect;

export const childLocationHistoryTable = pgTable("child_location_history", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: real("accuracy"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChildLocationHistory = typeof childLocationHistoryTable.$inferSelect;
