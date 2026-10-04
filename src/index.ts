import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { chatRouter } from "./routes/chat.js";
import { db } from "./db/client.js";
import { sessionMiddleware } from "./auth/middleware.js";
import { authRouter } from "./auth/routes.js";
import { usersRouter } from "./users/routes.js";
import { credentialsRouter } from "./credentials/routes.js";
import { progressRouter } from "./progress/routes.js";

// ─── Startup validation ────────────────────────────────────────────────

const VALID_DENSITIES = ["frequent", "balanced", "mostly-teach"] as const;
const interactionDensity = process.env.LESSON_INTERACTION_DENSITY ?? "balanced";
if (!VALID_DENSITIES.includes(interactionDensity)) {
  console.error(
    `Invalid LESSON_INTERACTION_DENSITY: "${interactionDensity}". ` +
    `Must be one of: ${VALID_DENSITIES.join(", ")}`,
  );
  process.exit(1);
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:4200,http://127.0.0.1:4200").split(",");

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(sessionMiddleware);

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);

app.use("/api/chat", chatRouter);
app.use("/api/auth", authRouter);
app.use("/api", usersRouter);
app.use("/api/credentials", credentialsRouter);
app.use("/api/progress", progressRouter);

app.get("/api/health", async (_req, res) => {
  try {
    await db.execute("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

// Global error handler — catch anything that falls through
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Agent API running on http://localhost:${port}`);
});