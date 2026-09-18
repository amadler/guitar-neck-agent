import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createDeepAgent, type DeepAgent } from "deepagents";

import type { DomainCommand, DomainState } from "./types/contract.js";
import { createDomainTools, createWaitForUserTool } from "./tools/domain-tools.js";
import { BASE_SYSTEM_PROMPT, LESSON_SYSTEM_PROMPT } from "./types/prompts.js";
import { LessonGuard } from "./lesson-guard.js";

const checkpointer = new MemorySaver();

export interface AgentRunContext {
  domainState: DomainState;
  emitCommand: (command: DomainCommand) => void;
}

interface AgentConfig {
  apiKey: string;
  model: string;
}

export function createAgent(
  ctx: AgentRunContext,
  lessonMode: boolean,
  config: AgentConfig,
): DeepAgent<any> {
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
    checkpointer,
    systemPrompt: lessonMode
      ? LESSON_SYSTEM_PROMPT
      : BASE_SYSTEM_PROMPT,
  });
}