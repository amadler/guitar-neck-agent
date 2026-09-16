import express from "express";
import cors from "cors";
import { createChatRouter } from "./routes/chat.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";

if (!API_KEY) {
  console.error("❌ OPENROUTER_API_KEY environment variable is required");
  process.exit(1);
}

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  methods: ["POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json({ limit: "1mb" }));

// ─── Routes ───────────────────────────────────────────────────────────

app.use("/api/chat", createChatRouter(API_KEY, MODEL));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🎸 guitar-neck-agent listening on port ${PORT}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   CORS origin: ${process.env.CORS_ORIGIN ?? "*"}`);
});