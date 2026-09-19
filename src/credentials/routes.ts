import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { credentialsService } from "./service.js";

export const credentialsRouter = Router();

// PUT /api/credentials/openrouter
credentialsRouter.put("/openrouter", requireAuth, async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== "string") {
      res.status(400).json({ error: "apiKey is required and must be a string" });
      return;
    }

    await credentialsService.save(req.session.userId!, apiKey);
    res.json({ ok: true });
  } catch (error) {
    console.error("Save credential error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/credentials/openrouter/status
credentialsRouter.get("/openrouter/status", requireAuth, async (req, res) => {
  try {
    const status = await credentialsService.getStatus(req.session.userId!);
    res.json(status);
  } catch (error) {
    console.error("Credential status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/credentials/openrouter
credentialsRouter.delete("/openrouter", requireAuth, async (req, res) => {
  try {
    await credentialsService.delete(req.session.userId!);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete credential error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});