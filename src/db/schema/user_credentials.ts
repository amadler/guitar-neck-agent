import { pgTable, uuid, varchar, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const userCredentials = pgTable("user_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull().default("openrouter"),
  encryptedApiKey: varchar("encrypted_api_key", { length: 512 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserCredential = typeof userCredentials.$inferSelect;
export type NewUserCredential = typeof userCredentials.$inferInsert;