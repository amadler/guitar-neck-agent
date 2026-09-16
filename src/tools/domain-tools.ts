import { tool } from "langchain/tools";
import { z } from "zod";
import type { DomainCommand, DomainState, ChatResponseEvent } from "../types/contract.js";

// ─── Schemas ──────────────────────────────────────────────────────────

const showPatternSchema = z.object({
  patternType: z.enum(["scale", "chord"]).describe("Typ patternu: 'scale' dla skali, 'chord' dla akordu"),
  patternName: z.string().describe("Nazwa patternu, np. 'major', 'minor', 'pentatonic major'"),
  rootNote: z.string().describe("Nuta podstawowa, np. 'C', 'A', 'G', 'D'"),
  fretRange: z.object({ min: z.number().min(0).max(24), max: z.number().min(0).max(24) }).optional().describe("Opcjonalny zakres progów"),
  emphasis: z.object({
    intervals: z.array(z.string()).optional().describe("Interwały do podświetlenia, np. ['1', '3', '5']"),
    roles: z.array(z.string()).optional().describe("Role do podświetlenia, np. ['root', 'third']"),
  }).optional().describe("Opcjonalne podświetlenie konkretnych interwałów"),
});
type ShowPatternInput = z.infer<typeof showPatternSchema>;

const showIntervalSchema = z.object({
  rootNote: z.string().describe("Nuta podstawowa"),
  interval: z.string().describe("Nazwa interwału, np. b3, 3, 5, b7"),
});
type ShowIntervalInput = z.infer<typeof showIntervalSchema>;

const comparePatternsSchema = z.object({
  primary: z.object({
    patternType: z.enum(["scale", "chord"]).describe("Typ pierwszego patternu"),
    patternName: z.string().describe("Nazwa pierwszego patternu"),
    rootNote: z.string().describe("Nuta podstawowa pierwszego patternu"),
  }),
  secondary: z.object({
    patternType: z.enum(["scale", "chord"]).describe("Typ drugiego patternu"),
    patternName: z.string().describe("Nazwa drugiego patternu"),
    rootNote: z.string().describe("Nuta podstawowa drugiego patternu"),
  }),
});
type ComparePatternsInput = z.infer<typeof comparePatternsSchema>;

const setViewSchema = z.object({
  fretRange: z.object({ min: z.number().min(0).max(24), max: z.number().min(0).max(24) }).optional().describe("Opcjonalny zakres progów"),
  enabledStrings: z.array(z.boolean()).length(6).optional().describe("Opcjonalnie które struny są aktywne"),
  markerDisplayMode: z.enum(["interval-colors", "note-names", "neutral-dots"]).optional().describe("Tryb wyświetlania markerów"),
});
type SetViewInput = z.infer<typeof setViewSchema>;

const setEmphasisSchema = z.object({
  emphasis: z.object({
    intervals: z.array(z.string()).optional().describe("Interwały do podświetlenia"),
    roles: z.array(z.string()).optional().describe("Role do podświetlenia"),
  }),
});
type SetEmphasisInput = z.infer<typeof setEmphasisSchema>;

const resolveShapeSchema = z.object({
  shapeId: z.string().describe("ID kształtu, np. 'cowboy-C', 'barre-E-form'"),
  rootNote: z.string().optional().describe("Root note dla movable shapes"),
});
type ResolveShapeInput = z.infer<typeof resolveShapeSchema>;

const setAiModeSchema = z.object({
  enabled: z.boolean().describe("true = włącz tryb AI, false = wyłącz"),
});
type SetAiModeInput = z.infer<typeof setAiModeSchema>;

const startExerciseSchema = z.object({
  question: z.string().describe("Pytanie do użytkownika"),
  rootNote: z.string().describe("Nuta podstawowa"),
  expectedIntervals: z.array(z.string()).describe("Oczekiwane interwały"),
  fretRange: z.object({ min: z.number().min(0).max(24), max: z.number().min(0).max(24) }).optional().describe("Opcjonalny zakres progów"),
  enabledStrings: z.array(z.boolean()).length(6).optional().describe("Opcjonalnie które struny mają być aktywne"),
});
type StartExerciseInput = z.infer<typeof startExerciseSchema>;

// ─── Tool factory ──────────────────────────────────────────────────────

export interface ToolContext {
  /** The DomainState snapshot from the current request (request-scoped). */
  domainState: DomainState;
  /** Callback to emit a domain-command event to the Angular client. */
  emitCommand: (command: DomainCommand) => void;
}

/**
 * Creates the agent tools.
 *
 * Command tools return a DomainCommand object instead of executing it.
 * The Angular client receives the command via the NDJSON stream and executes it locally.
 *
 * Query tools read from the DomainState snapshot that Angular sends with each request.
 * Within a single request, Node does NOT see the effects of DomainCommand executed locally.
 */
export function createAgentTools(ctx: ToolContext) {
  return [
    // ── show_pattern ────────────────────────────────────────────────
    tool(
      async (input: ShowPatternInput) => {
        const command: DomainCommand = {
          type: "show-pattern",
          patternType: input.patternType,
          patternName: input.patternName,
          rootNote: input.rootNote,
          fretRange: input.fretRange,
          emphasis: input.emphasis,
        };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "show-pattern",
          patternType: input.patternType,
          patternName: input.patternName,
          rootNote: input.rootNote,
          message: `Pokazano ${input.patternType} ${input.patternName} (${input.rootNote})`,
        };
      },
      {
        name: "show_pattern",
        description: "Wyświetla skalę lub akord na gryfie gitary. Użyj gdy użytkownik poprosi o pokazanie skali (np. C-dur, A-moll) lub akordu (np. C-dur, Am).",
        schema: showPatternSchema,
      }
    ),

    // ── show_interval ────────────────────────────────────────────────
    tool(
      async (input: ShowIntervalInput) => {
        const command: DomainCommand = { type: "show-interval", rootNote: input.rootNote, interval: input.interval };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "show-interval",
          rootNote: input.rootNote,
          interval: input.interval,
          message: `Pokazano interwał ${input.interval} od ${input.rootNote}`,
        };
      },
      {
        name: "show_interval",
        description: "Wyświetla pojedynczy interwał od root note na gryfie",
        schema: showIntervalSchema,
      }
    ),

    // ── clear_view ──────────────────────────────────────────────────
    tool(
      async () => {
        ctx.emitCommand({ type: "clear-view" });
        return { success: true, action: "clear-view", message: "Widok wyczyszczony" };
      },
      {
        name: "clear_view",
        description: "Czyści gryf i resetuje widok do domyślnego stanu",
        schema: z.object({}),
      }
    ),

    // ── get_current_view ────────────────────────────────────────────
    tool(
      async () => {
        // Reads from the DomainState snapshot — no round-trip to Angular
        const state = ctx.domainState;
        return {
          success: true,
          action: "get-current-view",
          mode: state.mode,
          rootNote: state.rootNote,
          patternName: state.patternName,
          exerciseMode: state.exerciseMode,
          message: `Aktualny widok: ${state.mode} ${state.patternName} (${state.rootNote})`,
        };
      },
      {
        name: "get_current_view",
        description: "Pobiera aktualny stan widoku gryfu",
        schema: z.object({}),
      }
    ),

    // ── compare_patterns ────────────────────────────────────────────
    tool(
      async (input: ComparePatternsInput) => {
        const command: DomainCommand = {
          type: "compare-patterns",
          primary: input.primary,
          secondary: input.secondary,
        };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "compare-patterns",
          primary: input.primary,
          secondary: input.secondary,
          message: `Porównano ${input.primary.patternName} (${input.primary.rootNote}) z ${input.secondary.patternName} (${input.secondary.rootNote})`,
        };
      },
      {
        name: "compare_patterns",
        description: "Porównuje dwa patterny (skalę z akordem) na gryfie.",
        schema: comparePatternsSchema,
      }
    ),

    // ── set_view ────────────────────────────────────────────────────
    tool(
      async (input: SetViewInput) => {
        const command: DomainCommand = { type: "set-view", ...input };
        ctx.emitCommand(command);
        return { success: true, action: "set-view", message: "Widok zaktualizowany" };
      },
      {
        name: "set_view",
        description: "Zmienia konfigurację widoku gryfu (zakres progów, aktywne struny, tryb wyświetlania markerów) bez zmiany patternu.",
        schema: setViewSchema,
      }
    ),

    // ── set_emphasis ────────────────────────────────────────────────
    tool(
      async (input: SetEmphasisInput) => {
        const command: DomainCommand = { type: "set-emphasis", emphasis: input.emphasis };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "set-emphasis",
          emphasis: input.emphasis,
          message: `Ustawiono emphasis: ${JSON.stringify(input.emphasis)}`,
        };
      },
      {
        name: "set_emphasis",
        description: "Podświetla konkretne interwały lub role na bieżącym patternie.",
        schema: setEmphasisSchema,
      }
    ),

    // ── resolve_shape ───────────────────────────────────────────────
    tool(
      async (input: ResolveShapeInput) => {
        const command: DomainCommand = { type: "resolve-shape", shapeId: input.shapeId, rootNote: input.rootNote };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "resolve-shape",
          shapeId: input.shapeId,
          rootNote: input.rootNote,
          message: `Pokazano kształt ${input.shapeId}${input.rootNote ? ` (${input.rootNote})` : ''}`,
        };
      },
      {
        name: "resolve_shape",
        description: "Wyświetla nazwany kształt (cowboy chord, barre) na gryfie.",
        schema: resolveShapeSchema,
      }
    ),

    // ── set_ai_mode ─────────────────────────────────────────────────
    tool(
      async (input: SetAiModeInput) => {
        const command: DomainCommand = { type: "set-ai-mode", enabled: input.enabled };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "set-ai-mode",
          enabled: input.enabled,
          message: input.enabled ? "Tryb AI włączony" : "Tryb AI wyłączony",
        };
      },
      {
        name: "set_ai_mode",
        description: "Włącza lub wyłącza tryb AI.",
        schema: setAiModeSchema,
      }
    ),

    // ── start_exercise ──────────────────────────────────────────────
    tool(
      async (input: StartExerciseInput) => {
        const command: DomainCommand = {
          type: "start-exercise",
          question: input.question,
          rootNote: input.rootNote,
          expectedIntervals: input.expectedIntervals,
          fretRange: input.fretRange,
          enabledStrings: input.enabledStrings,
        };
        ctx.emitCommand(command);
        return {
          success: true,
          action: "start-exercise",
          question: input.question,
          rootNote: input.rootNote,
          expectedIntervals: input.expectedIntervals,
          message: `Rozpoczęto ćwiczenie: ${input.question}`,
        };
      },
      {
        name: "start_exercise",
        description: "Rozpoczyna ćwiczenie w trybie lekcji. Aktywuje klikalny tryb na gryfie.",
        schema: startExerciseSchema,
      }
    ),

    // ── submit_exercise ─────────────────────────────────────────────
    tool(
      async () => {
        // Reads exercise result from DomainState snapshot
        const state = ctx.domainState;
        const exerciseResult = state.lastExerciseResult;
        return {
          success: true,
          action: "submit-exercise",
          exerciseResult,
          message: exerciseResult
            ? `Ćwiczenie sprawdzone. Poprawne: ${exerciseResult.correctCount}, błędne: ${exerciseResult.incorrectCount}`
            : "Ćwiczenie sprawdzone.",
        };
      },
      {
        name: "submit_exercise",
        description: "Zatwierdza aktualne ćwiczenie do sprawdzenia. Aplikacja weryfikuje zaznaczone nuty i zwraca wynik.",
        schema: z.object({}),
      }
    ),

    // ── get_exercise_result ─────────────────────────────────────────
    tool(
      async () => {
        const state = ctx.domainState;
        return {
          success: true,
          action: "get-exercise-result",
          exerciseMode: state.exerciseMode,
          exerciseTask: state.exerciseTask,
          selectedNotes: state.selectedNotes,
          lastExerciseResult: state.lastExerciseResult,
        };
      },
      {
        name: "get_exercise_result",
        description: "Pobiera wynik ostatniego ćwiczenia oraz aktualny stan trybu ćwiczeń.",
        schema: z.object({}),
      }
    ),
  ];
}