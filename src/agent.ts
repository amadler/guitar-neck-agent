import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { DomainCommand, DomainState } from "./types/contract.js";
import { createDomainTools, waitForUserTool } from "./tools/domain-tools.js";
import { BASE_SYSTEM_PROMPT, LESSON_SYSTEM_PROMPT } from "./types/prompts.js";
import { createDeepAgent, type DeepAgent } from "deepagents";

const checkpointer = new MemorySaver();
export interface AgentRunContext {
  domainState: DomainState;
  commands: DomainCommand[];
}

export function createAgent(ctx: AgentRunContext, lessonMode: boolean): DeepAgent<any> {
  const domainTools = createDomainTools({
    domainState: ctx.domainState,
    emitCommand: (command) => ctx.commands.push(command),
  });

  const model = new ChatOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.OPENROUTER_MODEL!,
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

    ...(lessonMode
      ? {
        interruptOn: {
          wait_for_user: true,
        },
      }
      : {}),
  });
}