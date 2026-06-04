import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// Tombstone records for withdrawn (회원탈퇴) accounts. Used to enforce a
// cooling-off period before the same identity can sign up again.
export const deletedAccountsTable = pgTable("deleted_accounts", {
  id: serial("id").primaryKey(),
  email: text("email"),
  googleId: text("google_id"),
  kakaoId: text("kakao_id"),
  naverId: text("naver_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeletedAccount = typeof deletedAccountsTable.$inferSelect;
