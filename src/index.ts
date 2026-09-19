import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chat.js";
import { db } from "./db/client.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/chat", chatRouter);

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