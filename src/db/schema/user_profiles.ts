import { pgTable, uuid, varchar, integer, jsonb, foreignKey } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  level: varchar("level", { length: 50 }).notNull().default("beginner"),
  preferences: jsonb("preferences").default({}).notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;