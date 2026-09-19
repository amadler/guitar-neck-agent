import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { progressService } from "./service.js";

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