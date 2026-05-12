import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const familyMemberAliasesTable = pgTable("family_member_aliases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  targetUserId: integer("target_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("family_member_aliases_user_target_unique").on(t.userId, t.targetUserId),
]);

export type FamilyMemberAlias = typeof familyMemberAliasesTable.$inferSelect;
