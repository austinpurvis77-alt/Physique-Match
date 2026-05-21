import { sql } from "drizzle-orm";
import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const matchHistoryTable = pgTable("match_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  player1Id: varchar("player1_id").references(() => usersTable.id, { onDelete: "set null" }),
  player2Id: varchar("player2_id").references(() => usersTable.id, { onDelete: "set null" }),
  winnerId: varchar("winner_id").references(() => usersTable.id, { onDelete: "set null" }),
  player1Score: integer("player1_score").notNull(),
  player2Score: integer("player2_score").notNull(),
  player1EloChange: integer("player1_elo_change").notNull().default(0),
  player2EloChange: integer("player2_elo_change").notNull().default(0),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MatchHistory = typeof matchHistoryTable.$inferSelect;
export type InsertMatchHistory = typeof matchHistoryTable.$inferInsert;
