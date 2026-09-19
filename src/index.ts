import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chat.js";
import { db } from "./db/client.js";
import { sessionMiddleware } from "./auth/middleware.js";
import { authRouter } from "./auth/routes.js";
import { usersRouter } from "./users/routes.js";
import { credentialsRouter } from "./credentials/routes.js";
import { progressRouter } from "./progress/routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:4200",
    credentials: true,
  })
);
app.use(express.json());
app.use(sessionMiddleware);

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

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Agent API running on http://localhost:${port}`);
});