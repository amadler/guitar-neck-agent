import { pgTable, uuid, varchar, timestamp, jsonb, foreignKey, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const lessonProgress = pgTable("lesson_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("not_started"),
  currentStep: varchar("current_step", { length: 255 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  data: jsonb("data").default({}).notNull(),
}, (table) => [
  unique().on(table.userId, table.lessonId),
]);

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;