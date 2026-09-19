import { db } from "../db/client.js";
import { exerciseResults } from "../db/schema/exercise_results.js";
import { userProfiles } from "../db/schema/user_profiles.js";
import { eq } from "drizzle-orm";
import type { NewExerciseResult } from "../db/schema/exercise_results.js";

const LEVEL_THRESHOLDS = [
  { level: "beginner", minCorrect: 0 },
  { level: "intermediate", minCorrect: 20 },
  { level: "advanced", minCorrect: 50 },
  { level: "expert", minCorrect: 100 },
] as const;

export const exercisesService = {
  async saveResult(
    userId: string,
    data: { lessonId: string; exerciseId: string; result: Record<string, unknown> },
  ): Promise<void> {
    await db.insert(exerciseResults).values({
      userId,
      lessonId: data.lessonId,
      exerciseId: data.exerciseId,
      result: data.result,
    });

    // Auto-update level based on total correct answers
    await this.updateLevel(userId);
  },

  async getHistory(userId: string, limit = 50) {
    return db
      .select()
      .from(exerciseResults)
      .where(eq(exerciseResults.userId, userId))
      .orderBy(exerciseResults.createdAt)
      .limit(limit);
  },

  async getTotalCorrect(userId: string): Promise<number> {
    const results = await db
      .select({ result: exerciseResults.result })
      .from(exerciseResults)
      .where(eq(exerciseResults.userId, userId));

    return results.reduce((sum, r) => {
      const res = r.result as { correct?: boolean; correctCount?: number };
      return sum + (res.correctCount ?? (res.correct ? 1 : 0));
    }, 0);
  },

  async updateLevel(userId: string): Promise<void> {
    const totalCorrect = await this.getTotalCorrect(userId);

    // Find the highest level the user qualifies for
    let newLevel = "beginner";
    for (const t of LEVEL_THRESHOLDS) {
      if (totalCorrect >= t.minCorrect) {
        newLevel = t.level;
      }
    }

    // Upsert profile with new level
    const [existing] = await db
      .select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(userProfiles)
        .set({ level: newLevel })
        .where(eq(userProfiles.userId, userId));
    } else {
      await db
        .insert(userProfiles)
        .values({ userId, level: newLevel });
    }
  },
};