import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  eloRating: integer("elo_rating").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
