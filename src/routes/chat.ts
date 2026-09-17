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

  const ctx: AgentRunContext = {
    domainState,
    commands: [],
  };

  const agent = createAgent(ctx, lessonMode);

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");

  const emit = (event: ChatResponseEvent) => {
    res.write(JSON.stringify(event) + "\n");
  };

  try {
    const input =
      type === "resume"
        ? new Command({
          resume: {
            decisions: [
              {
                type: "respond",
                message: text,
              },
            ],
          },
        })
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

    for await (const message of stream.messages) {
      for await (const token of message.text) {
        emit({
          type: "token",
          text: token,
        });
      }
    }

    for (const command of ctx.commands) {
      emit({
        type: "domain-command",
        command,
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