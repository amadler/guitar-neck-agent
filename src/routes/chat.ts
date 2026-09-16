import { Router, Request, Response } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { createGuitarAgent, createLessonAgent, type AgentRunContext } from "../agent.js";
import type { ChatRequestBody, ChatResponseEvent, DomainState } from "../types/contract.js";

// ─── Default DomainState ──────────────────────────────────────────────

const DEFAULT_DOMAIN_STATE: DomainState = {
  mode: "scale",
  aiModeEnabled: false,
  displayMode: null,
  rootNote: "C",
  patternName: "major",
  fretRange: { min: 0, max: 24 },
  enabledStrings: [true, true, true, true, true, true],
  markerDisplayMode: "interval-colors",
  exerciseMode: false,
};

// ─── Router ───────────────────────────────────────────────────────────

export function createChatRouter(apiKey: string, model?: string) {
  const router = Router();
  const agentFactory = createGuitarAgent({ apiKey, model });
  const lessonFactory = createLessonAgent({ apiKey, model });

  router.post("/", async (req: Request, res: Response) => {
    const body = req.body as ChatRequestBody;
    const { type, threadId, text, domainState, lessonId } = body;

    if (!threadId || !text) {
      res.status(400).json({ error: "Missing required fields: threadId, text" });
      return;
    }

    // Set up NDJSON streaming headers
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Helper: write an NDJSON event
    const emit = (event: ChatResponseEvent) => {
      res.write(JSON.stringify(event) + "\n");
    };

    try {
      // Build the run context with the DomainState snapshot (request-scoped)
      const ctx: AgentRunContext = {
        domainState: domainState ?? DEFAULT_DOMAIN_STATE,
        commands: [],
      };

      // Choose agent based on lesson mode
      const isLesson = Boolean(lessonId);
      const { buildAgent, checkpointSaver } = isLesson ? lessonFactory : agentFactory;
      const agent = buildAgent(ctx);

      // Determine the input to the agent
      let agentInput;
      if (type === "resume") {
        agentInput = new Command({ resume: text });
      } else {
        agentInput = { messages: [new HumanMessage(text)] };
      }

      // Run the agent and stream events
      const stream = await agent.streamEvents(
        agentInput,
        {
          configurable: { thread_id: threadId },
          version: "v3",
        },
      );

      // Consume the stream
      for await (const message of stream.messages) {
        let accumulated = "";
        for await (const token of message.text) {
          accumulated += token;
          emit({ type: "token", text: accumulated });
        }
      }

      for await (const call of stream.toolCalls) {
        emit({ type: "token", text: `🔧 Używam narzędzia: ${call.name}...` });
        await call.output;
      }

      // Emit any DomainCommands collected by tools
      for (const command of ctx.commands) {
        emit({ type: "domain-command", command });
      }

      // Emit interrupt status
      const waitingForUser = Boolean(stream.interrupted);
      emit({ type: "interrupt", waitingForUser });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      emit({ type: "error", message: errorMsg });
    } finally {
      emit({ type: "done" });
      res.end();
    }
  });

  return router;
}