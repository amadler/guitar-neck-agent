import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createDeepAgent, type DeepAgent } from "deepagents";

import type { DomainCommand, DomainState } from "./types/contract.js";
import { createDomainTools, createWaitForUserTool } from "./tools/domain-tools.js";
import { BASE_SYSTEM_PROMPT, LESSON_SYSTEM_PROMPT } from "./types/prompts.js";
import { LessonGuard } from "./lesson-guard.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://guitarneck:guitarneck@localhost:5432/guitarneck";

// Lazy singleton — created once, reused across requests
let checkpointer: PostgresSaver | null = null;
let checkpointerPromise: Promise<PostgresSaver> | null = null;

async function getCheckpointer(): Promise<PostgresSaver> {
  if (checkpointer) return checkpointer;
  if (checkpointerPromise) return checkpointerPromise;

  checkpointerPromise = (async () => {
    const cp = await PostgresSaver.fromConnString(DATABASE_URL);
    await cp.setup();
    checkpointer = cp;
    return cp;
  })();

  return checkpointerPromise;
}

export interface AgentRunContext {
  domainState: DomainState;
  emitCommand: (command: DomainCommand) => void;
}

interface AgentConfig {
  apiKey: string;
  model: string;
}

export async function createAgent(
  ctx: AgentRunContext,
  lessonMode: boolean,
  config: AgentConfig,
): Promise<DeepAgent<any>> {
  const cp = await getCheckpointer();

  // Per-request guard — fresh for every invocation, discarded when the request ends.
  const guard = lessonMode ? new LessonGuard() : undefined;

  const domainTools = createDomainTools({
    domainState: ctx.domainState,
    emitCommand: ctx.emitCommand,
    lessonGuard: guard,
  });

  const model = new ChatOpenRouter({
    apiKey: config.apiKey,
    model: config.model,
  });

  return createDeepAgent({
    model,
    tools: lessonMode
      ? [...domainTools, createWaitForUserTool(guard)]
      : domainTools,
    checkpointer: cp,
    systemPrompt: lessonMode
      ? LESSON_SYSTEM_PROMPT
      : BASE_SYSTEM_PROMPT,
  });
}