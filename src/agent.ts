import { createDeepAgent, type DeepAgent } from "deepagents";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenRouter } from "@langchain/openrouter";
import { tool } from "langchain/tools";
import { z } from "zod";
import { createAgentTools, type ToolContext } from "./tools/domain-tools.js";
import type { DomainCommand, DomainState, ChatResponseEvent } from "./types/contract.js";

// ─── Wait-for-user tool ───────────────────────────────────────────────

const waitForUserTool = tool(
  async ({ prompt }: { prompt: string }) => prompt,
  {
    name: "wait_for_user",
    description: "Zatrzymuje lekcję po jednym kroku dydaktycznym i czeka na odpowiedź użytkownika.",
    schema: z.object({ prompt: z.string() }),
  },
);

// ─── System prompts ───────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT =
  "Jesteś pomocnym asystentem gitarzysty. Mów po polsku, krótko i rzeczowo. " +
  "Gdy użytkownik poprosi o pokazanie skali lub akordu na gryfie, użyj narzędzia show_pattern. " +
  "Gdy zapyta o interwał, użyj show_interval. " +
  "Gdy poprosi o wyczyszczenie widoku, użyj clear_view. " +
  "Gdy poprosi o porównanie skali z akordem (np. 'pokaż C-dur z Am'), użyj compare_patterns. " +
  "Gdy poprosi o zmianę widoku (zakres progów, tryb wyświetlania), użyj set_view. " +
  "Gdy poprosi o podświetlenie konkretnych interwałów, użyj set_emphasis. " +
  "Gdy zapyta o chwyty gitarowe (cowboy chords, barre), użyj resolve_shape. " +
  "Gdy poprosi o włączenie/wyłączenie trybu AI, użyj set_ai_mode. " +
  "Po wykonaniu narzędzia powiedz użytkownikowi co zostało pokazane.";

const LESSON_SYSTEM_PROMPT =
  "Jesteś nauczycielem gitary prowadzącym lekcję krok po kroku. " +
  "Masz przed sobą pełny tekst lekcji. Trzymaj się ściśle jej treści — nie odchodź od tematu. " +
  "Wykonuj jeden krok dydaktyczny na raz. " +
  "Po pokazaniu interwału, skali, akordu lub innego przykładu użyj narzędzia wait_for_user i poczekaj na reakcję użytkownika. " +
  "Nie przechodź do następnego kroku przed odpowiedzią użytkownika. " +
  "Gdy chcesz zadać ćwiczenie, użyj narzędzia start_exercise. " +
  "Podaj question (pytanie do użytkownika), rootNote, expectedIntervals (czego szukać). " +
  "Po rozpoczęciu ćwiczenia użyj wait_for_user. " +
  "Po otrzymaniu wyniku ćwiczenia (submit_exercise), skomentuj odpowiedź użytkownika. " +
  "Jeśli odpowiedź jest dobra — pochwal. Jeśli nie — podpowiedz. " +
  "Nie zadawaj kolejnego pytania, dopóki nie dostaniesz wyniku poprzedniego. " +
  "Gdy użytkownik zada pytanie spoza lekcji, odpowiedz krótko i wróć do lekcji.";

// ─── Agent factory ────────────────────────────────────────────────────

export interface AgentConfig {
  apiKey: string;
  model?: string;
}

export interface AgentRunContext {
  /** Collected DomainCommands emitted by tools during this run. */
  commands: DomainCommand[];
  /** The DomainState snapshot for this request. */
  domainState: DomainState;
}

/**
 * Creates a DeepAgent configured for guitar-neck.
 * Each call creates a fresh agent with the given context.
 */
export function createGuitarAgent(config: AgentConfig): {
  buildAgent: (ctx: AgentRunContext) => DeepAgent<any>;
  checkpointSaver: MemorySaver;
} {
  const llm = new ChatOpenRouter({
    apiKey: config.apiKey,
    model: config.model ?? "deepseek/deepseek-v4-flash",
    temperature: 0.7,
  });

  const checkpointSaver = new MemorySaver();

  /**
   * Creates a new agent instance bound to a specific run context.
   * The context provides the DomainState snapshot and collects emitted commands.
   */
  function buildAgent(ctx: AgentRunContext) {
    const domainTools = createAgentTools({
      domainState: ctx.domainState,
      emitCommand: (cmd) => { ctx.commands.push(cmd); },
    });

    return createDeepAgent({
      model: llm,
      tools: [...domainTools, waitForUserTool],
      interruptOn: { wait_for_user: true },
      systemPrompt: BASE_SYSTEM_PROMPT,
      checkpointer: checkpointSaver,
    });
  }

  return { buildAgent, checkpointSaver };
}

/**
 * Creates a lesson agent with the lesson-specific system prompt.
 */
export function createLessonAgent(config: AgentConfig): {
  buildAgent: (ctx: AgentRunContext) => DeepAgent<any>;
  checkpointSaver: MemorySaver;
} {
  const llm = new ChatOpenRouter({
    apiKey: config.apiKey,
    model: config.model ?? "deepseek/deepseek-v4-flash",
    temperature: 0.7,
  });

  const checkpointSaver = new MemorySaver();

  function buildAgent(ctx: AgentRunContext) {
    const domainTools = createAgentTools({
      domainState: ctx.domainState,
      emitCommand: (cmd) => { ctx.commands.push(cmd); },
    });

    return createDeepAgent({
      model: llm,
      tools: [...domainTools, waitForUserTool],
      interruptOn: { wait_for_user: true },
      systemPrompt: LESSON_SYSTEM_PROMPT,
      checkpointer: checkpointSaver,
    });
  }

  return { buildAgent, checkpointSaver };
}