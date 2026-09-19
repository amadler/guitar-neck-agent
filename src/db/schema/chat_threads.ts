import { pgTable, uuid, varchar, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatThread = typeof chatThreads.$inferSelect;
export type NewChatThread = typeof chatThreads.$inferInsert;