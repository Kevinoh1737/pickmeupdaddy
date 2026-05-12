import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const childrenTable = pgTable("children", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  familyId: integer("family_id").notNull(),
  deviationAlertsEnabled: boolean("deviation_alerts_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const childDeviationAlertsTable = pgTable("child_deviation_alerts", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
  alertedAt: timestamp("alerted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChildSchema = createInsertSchema(childrenTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChild = z.infer<typeof insertChildSchema>;
export type Child = typeof childrenTable.$inferSelect;
export type ChildDeviationAlert = typeof childDeviationAlertsTable.$inferSelect;
