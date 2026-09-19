import { pgTable, uuid, varchar, timestamp, jsonb, foreignKey } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const exerciseResults = pgTable("exercise_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id", { length: 255 }).notNull(),
  exerciseId: varchar("exercise_id", { length: 255 }).notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ExerciseResult = typeof exerciseResults.$inferSelect;
export type NewExerciseResult = typeof exerciseResults.$inferInsert;