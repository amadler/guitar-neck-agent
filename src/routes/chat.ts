import { Router } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { createAgent, type AgentRunContext } from "../agent.js";
import type { ChatRequestBody, ChatResponseEvent } from "../types/contract.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const {
    type,
    threadId,
    text,
    domainState,
    lessonMode,
  } = req.body as ChatRequestBody;

  const emit = (event: ChatResponseEvent) => {
    res.write(JSON.stringify(event) + "\n");
  };

  const ctx: AgentRunContext = {
    domainState,
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