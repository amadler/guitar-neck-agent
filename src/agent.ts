import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createDeepAgent, type DeepAgent } from "deepagents";

import type { DomainCommand, DomainState } from "./types/contract.js";
import { createDomainTools, waitForUserTool } from "./tools/domain-tools.js";
import { BASE_SYSTEM_PROMPT, LESSON_SYSTEM_PROMPT } from "./types/prompts.js";

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
  const domainTools = createDomainTools({
    domainState: ctx.domainState,
    emitCommand: ctx.emitCommand,
  });

  const model = new ChatOpenRouter({
    apiKey: config.apiKey,
    model: config.model,
  });

  return createDeepAgent({
    model,
    tools: lessonMode
      ? [...domainTools, waitForUserTool]
      : domainTools,
    checkpointer,
    systemPrompt: lessonMode
      ? LESSON_SYSTEM_PROMPT
      : BASE_SYSTEM_PROMPT,
  });
}