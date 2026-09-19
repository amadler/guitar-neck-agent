import { Router } from "express";
import { db } from "../db/client.js";
import { users } from "../db/schema/users.js";
import { requireAuth } from "../auth/middleware.js";
import { eq } from "drizzle-orm";

export const usersRouter = Router();

// GET /api/me
usersRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, req.session.userId!))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error("GET /me error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});