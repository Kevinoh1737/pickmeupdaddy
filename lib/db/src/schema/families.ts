import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";

export const familiesTable = pgTable("families", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFamilySchema = createInsertSchema(familiesTable).omit({ id: true, createdAt: true });
export type InsertFamily = z.infer<typeof insertFamilySchema>;
export type Family = typeof familiesTable.$inferSelect;
