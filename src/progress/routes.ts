import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { progressService } from "./service.js";
import { exercisesService } from "./exercises.js";

export const progressRouter = Router();

// GET /api/progress — lista wszystkich lekcji usera
progressRouter.get("/", requireAuth, async (req, res) => {
  try {
    const progress = await progressService.getAll(req.session.userId!);
    res.json({ progress });
  } catch (error) {
    console.error("GET /api/progress error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/progress/:lessonId — aktualny stan lekcji
progressRouter.get("/:lessonId", requireAuth, async (req, res) => {
  try {
    const progress = await progressService.get(
      req.session.userId!,
      req.params.lessonId,
    );

    if (!progress) {
      res.status(404).json({ error: "No progress found for this lesson" });
      return;
    }

    res.json({ progress });
  } catch (error) {
    console.error("GET /api/progress/:lessonId error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Exercises ─────────────────────────────────────────────────────────

// POST /api/progress/exercises/result — zapis wyniku ćwiczenia
progressRouter.post("/exercises/result", requireAuth, async (req, res) => {
  try {
    const { lessonId, exerciseId, result } = req.body;

    if (!lessonId || !exerciseId || !result) {
      res.status(400).json({ error: "lessonId, exerciseId, and result are required" });
      return;
    }

    await exercisesService.saveResult(req.session.userId!, { lessonId, exerciseId, result });
    res.json({ ok: true });
  } catch (error) {
    console.error("POST /api/progress/exercises/result error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/progress/exercises/history — historia wyników
progressRouter.get("/exercises/history", requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const history = await exercisesService.getHistory(req.session.userId!, limit);
    res.json({ history });
  } catch (error) {
    console.error("GET /api/progress/exercises/history error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/progress/:lessonId — aktualizacja postępu
progressRouter.put("/:lessonId", requireAuth, async (req, res) => {
  try {
    const { status, currentStep, data, startedAt, completedAt } = req.body;

    await progressService.upsert(req.session.userId!, req.params.lessonId, {
      status,
      currentStep,
      data,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      completedAt: completedAt ? new Date(completedAt) : undefined,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/progress/:lessonId error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});