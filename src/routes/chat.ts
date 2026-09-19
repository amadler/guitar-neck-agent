import { Router } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { createAgent, type AgentRunContext } from "../agent.js";
import type { ChatRequestBody, ChatResponseEvent, DomainState } from "../types/contract.js";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { chatThreads } from "../db/schema/chat_threads.js";
import { eq } from "drizzle-orm";

export const chatRouter = Router();

const DEFAULT_DOMAIN_STATE: DomainState = {
  mode: "scale",
  aiModeEnabled: false,
  displayMode: null,
  rootNote: "C",
  patternName: "",
  fretRange: { min: 0, max: 12 },
  enabledStrings: [true, true, true, true, true, true],
  markerDisplayMode: "interval-colors",
  exerciseMode: false,
};

chatRouter.post("/", requireAuth, async (req, res) => {
  const {
    type,
    threadId,
    text,
    domainState,
    lessonMode,
  } = req.body as ChatRequestBody;

  const userId = req.session.userId!;

  // Validate threadId if provided — must belong to this user
  if (threadId) {
    const [thread] = await db
      .select({ id: chatThreads.id, userId: chatThreads.userId })
      .from(chatThreads)
      .where(eq(chatThreads.id, threadId))
      .limit(1);

    if (thread) {
      // Thread exists — verify ownership
      if (thread.userId !== userId) {
        res.status(403).json({ error: "Thread does not belong to this user" });
        return;
      }
    } else {
      // Thread doesn't exist yet — create it
      await db.insert(chatThreads).values({ id: threadId, userId });
    }
  }

  const emit = (event: ChatResponseEvent) => {
    res.write(JSON.stringify(event) + "\n");
  };

  const resolvedDomainState = domainState ?? DEFAULT_DOMAIN_STATE;

  const ctx: AgentRunContext = {
    domainState: resolvedDomainState,
    emitCommand: (command) => {
      emit({
        type: "domain-command",
        command,
      });
    },
  };

  const agent = createAgent(ctx, lessonMode, {
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.OPENROUTER_MODEL!,
  });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");


  try {
    const input =
      type === "resume"
        ? new Command({ resume: text })
        : {
          messages: [new HumanMessage(text)],
        };

    const stream = await agent.streamEvents(
      input,
      {
        configurable: { thread_id: threadId },
        version: "v3",
      },
    );

    let finalText = "";
    for await (const message of stream.messages) {
      let currentText = "";

      for await (const token of message.text) {
        currentText += token;
      }

      if (currentText.trim()) {
        finalText = currentText;
      }
    }

    if (finalText) {
      emit({
        type: "token",
        text: finalText,
      });
    }

    emit({
      type: "interrupt",
      waitingForUser: Boolean(stream.interrupted),
    });

    emit({ type: "done" });
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    res.end();
  }
});