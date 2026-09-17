import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chat.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/chat", chatRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Agent API running on http://localhost:${port}`);
});