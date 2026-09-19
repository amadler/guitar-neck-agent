import { db } from "../db/client.js";
import { lessonProgress } from "../db/schema/lesson_progress.js";
import { eq, and } from "drizzle-orm";
import type { NewLessonProgress, LessonProgress } from "../db/schema/lesson_progress.js";

export const progressService = {
  async get(userId: string, lessonId: string): Promise<LessonProgress | null> {
    const [progress] = await db
      .select()
      .from(lessonProgress)
      .where(and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId),
      ))
      .limit(1);

    return progress ?? null;
  },

  async getAll(userId: string): Promise<LessonProgress[]> {
    return db
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, userId));
  },

  async upsert(
    userId: string,
    lessonId: string,
    data: Partial<Pick<NewLessonProgress, "status" | "currentStep" | "data" | "startedAt" | "completedAt">>,
  ): Promise<void> {
    const existing = await this.get(userId, lessonId);

    if (existing) {
      await db
        .update(lessonProgress)
        .set({ ...data })
        .where(eq(lessonProgress.id, existing.id));
    } else {
      await db
        .insert(lessonProgress)
        .values({
          userId,
          lessonId,
          status: data.status ?? "not_started",
          currentStep: data.currentStep,
          data: data.data ?? {},
          startedAt: data.startedAt,
          completedAt: data.completedAt,
        });
    }
  },
};