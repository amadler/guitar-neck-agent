import { tool } from "langchain/tools";
import { z } from "zod";
import { DomainCommand, DomainState } from "../types/contract";
import { interrupt } from "@langchain/langgraph";
import { LessonGuard } from "../lesson-guard";

interface ToolContext {
  domainState: DomainState;
  emitCommand: (command: DomainCommand) => void;
  lessonGuard?: LessonGuard;
}

// #region Zod schemas
const showPatternSchema = z.object({
  patternType: z.enum(["scale", "chord"]).describe("Typ patternu: 'scale' dla skali, 'chord' dla akordu"),
  patternName: z.string().describe("Nazwa patternu, np. 'major', 'minor', 'pentatonic major'"),
  rootNote: z.string().describe("Nuta podstawowa, np. 'C', 'A', 'G', 'D'"),
  fretRange: z.object({
    min: z.number().min(0).max(24),
    max: z.number().min(0).max(24),
  }).optional().describe("Opcjonalny zakres progów"),
  emphasis: z.object({
    intervals: z.array(z.string()).optional().describe("Interwały do podświetlenia, np. ['1', '3', '5']"),
    roles: z.array(z.string()).optional().describe("Role do podświetlenia, np. ['root', 'third']"),
  }).optional().describe("Opcjonalne podświetlenie konkretnych interwałów"),
});
type ShowPatternInput = z.infer<typeof showPatternSchema>;

const showIntervalSchema = z.object({
  rootNote: z.string().describe("Nuta podstawowa"),
  intervals: z.array(z.string()).describe("Lista interwałów, np. ['b3', '5', 'b7']"),
});
type ShowIntervalInput = z.infer<typeof showIntervalSchema>;

const comparePatternsSchema = z.object({
  primary: z.object({
    patternType: z.enum(["scale", "chord"]).describe("Typ pierwszego patternu"),
    patternName: z.string().describe("Nazwa pierwszego patternu, np. 'major', 'minor'"),
    rootNote: z.string().describe("Nuta podstawowa pierwszego patternu, np. 'C', 'A'"),
  }),
  secondary: z.object({
    patternType: z.enum(["scale", "chord"]).describe("Typ drugiego patternu"),
    patternName: z.string().describe("Nazwa drugiego patternu, np. 'major', 'minor'"),
    rootNote: z.string().describe("Nuta podstawowa drugiego patternu, np. 'C', 'A'"),
  }),
});
type ComparePatternsInput = z.infer<typeof comparePatternsSchema>;

const setViewSchema = z.object({
  fretRange: z.object({
    min: z.number().min(0).max(24),
    max: z.number().min(0).max(24),
  }).optional().describe("Opcjonalny zakres progów"),
  enabledStrings: z.array(z.boolean()).length(6).optional().describe("Opcjonalnie które struny są aktywne (6 elementów)"),
  markerDisplayMode: z.enum(["interval-colors", "note-names", "neutral-dots"]).optional().describe("Tryb wyświetlania markerów"),
});
type SetViewInput = z.infer<typeof setViewSchema>;

const setEmphasisSchema = z.object({
  emphasis: z.object({
    intervals: z.array(z.string()).optional().describe("Interwały do podświetlenia, np. ['1', '3', '5']"),
    roles: z.array(z.string()).optional().describe("Role do podświetlenia, np. ['root', 'third']"),
  }),
});
type SetEmphasisInput = z.infer<typeof setEmphasisSchema>;

const resolveShapeSchema = z.object({
  shapeId: z.string().describe("ID kształtu, np. 'cowboy-C', 'barre-E-form'"),
  rootNote: z.string().optional().describe("Root note dla movable shapes (barre), np. 'F'"),
});
type ResolveShapeInput = z.infer<typeof resolveShapeSchema>;

const setAiModeSchema = z.object({
  enabled: z.boolean().describe("true = włącz tryb AI, false = wyłącz"),
});
type SetAiModeInput = z.infer<typeof setAiModeSchema>;

const startExerciseSchema = z.object({
  question: z.string().describe("Pytanie do użytkownika, np. 'Znajdź wszystkie kwinty względem A'"),
  rootNote: z.string().describe("Nuta podstawowa, np. 'A', 'C'"),
  expectedIntervals: z.array(z.string()).describe("Oczekiwane interwały, np. ['5'], ['1', 'b3']"),
  fretRange: z.object({
    min: z.number().min(0).max(24),
    max: z.number().min(0).max(24),
  }).optional().describe("Opcjonalny zakres progów do wyświetlenia"),
  enabledStrings: z.array(z.boolean()).length(6).optional().describe("Opcjonalnie które struny mają być aktywne"),
});
type StartExerciseInput = z.infer<typeof startExerciseSchema>;

// #endregion

/**
 * Creates the wait_for_user tool.
 * Factory function so each invocation gets its own guard reference.
 */
export function createWaitForUserTool(guard?: LessonGuard) {
  return tool(
    async ({ prompt }) => {
      guard?.reset();
      return interrupt({ prompt });
    },
    {
      name: "wait_for_user",
      description: "Zatrzymuje lekcję i czeka na odpowiedź użytkownika.",
      schema: z.object({
        prompt: z.string(),
      }),
    },
  );
}

export function createDomainTools(ctx: ToolContext) {
  return [
    // ── show_pattern (domain command) ──────────────────────────────
    tool(
      async (input: ShowPatternInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
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
          action: "show-pattern",
          patternType: input.patternType,
          patternName: input.patternName,
          rootNote: input.rootNote,
        };
      },
      {
        name: "show_pattern",
        description: "Wyświetla skalę lub akord na gryfie gitary. Użyj gdy użytkownik poprosi o pokazanie skali (np. C-dur, A-moll) lub akordu (np. C-dur, Am).",
        schema: showPatternSchema,
      },
    ),

    // ── show_interval (domain command) ─────────────────────────────
    tool(
      async (input: ShowIntervalInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        const command: DomainCommand = { type: "show-intervals", rootNote: input.rootNote, intervals: input.intervals };
        ctx.emitCommand(command);

        return {
          action: "show-intervals",
          rootNote: input.rootNote,
          intervals: input.intervals,
        };
      },
      {
        name: "show_interval",
        description: "Wyświetla interwał lub listę interwałów od root note na gryfie",
        schema: showIntervalSchema,
      },
    ),

    // ── clear_view (domain command) ───────────────────────────────
    tool(
      async () => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        ctx.emitCommand({ type: "clear-view" });
        return {
          action: "clear-view",
        };
      },
      {
        name: "clear_view",
        description: "Czyści gryf i resetuje widok do domyślnego stanu",
        schema: z.object({}),
      },
    ),

    // ── get_current_view (query) ──────────────────────────────────
    tool(
      async () => {
        const blocked = ctx.lessonGuard?.checkQuery();
        if (blocked) return { error: blocked, action: "blocked" };
        const result = ctx.domainState;
        return {
          action: "get-current-view",
          mode: result.mode,
          rootNote: result.rootNote,
          patternName: result.patternName,
        };
      },
      {
        name: "get_current_view",
        description: "Pobiera aktualny stan widoku gryfu",
        schema: z.object({}),
      },
    ),

    // ── compare_patterns (domain command) ──────────────────────────
    tool(
      async (input: ComparePatternsInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        const command: DomainCommand = {
          type: "compare-patterns",
          primary: input.primary,
          secondary: input.secondary,
        };
        ctx.emitCommand(command);

        return {
          action: "compare-patterns",
          primary: input.primary,
          secondary: input.secondary,
        };
      },
      {
        name: "compare_patterns",
        description: "Porównuje dwa patterny (skalę z akordem) na gryfie. Użyj gdy użytkownik chce zobaczyć jak skala nakłada się na akord (np. 'pokaż C-dur z Am', 'porównaj skalę z akordem').",
        schema: comparePatternsSchema,
      },
    ),

    // ── set_view (domain command) ──────────────────────────────────
    tool(
      async (input: SetViewInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        const command: DomainCommand = {
          type: "set-view",
          fretRange: input.fretRange,
          enabledStrings: input.enabledStrings,
          markerDisplayMode: input.markerDisplayMode,
        };
        ctx.emitCommand(command);
        return {
          action: "set-view",
        };
      },
      {
        name: "set_view",
        description: "Zmienia konfigurację widoku gryfu (zakres progów, aktywne struny, tryb wyświetlania markerów) bez zmiany patternu.",
        schema: setViewSchema,
      },
    ),

    // ── set_emphasis (domain command) ──────────────────────────────
    tool(
      async (input: SetEmphasisInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        const command: DomainCommand = {
          type: "set-emphasis",
          emphasis: input.emphasis,
        };
        ctx.emitCommand(command);
        return {
          action: "set-emphasis",
          emphasis: input.emphasis,
        };
      },
      {
        name: "set_emphasis",
        description: "Podświetla konkretne interwały lub role na bieżącym patternie. Użyj gdy użytkownik chce wyróżnić np. tylko tercje i kwinty.",
        schema: setEmphasisSchema,
      },
    ),

    // ── resolve_shape (domain command) ─────────────────────────────
    tool(
      async (input: ResolveShapeInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        const command: DomainCommand = {
          type: "resolve-shape",
          shapeId: input.shapeId,
          rootNote: input.rootNote,
        };
        ctx.emitCommand(command);

        return {
          action: "resolve-shape",
          shapeId: input.shapeId,
          rootNote: input.rootNote,
        };
      },
      {
        name: "resolve_shape",
        description: "Wyświetla nazwany kształt (cowboy chord, barre) na gryfie. Użyj gdy użytkownik zapyta o chwyty gitarowe, np. 'pokaż chwyt C-dur', 'pokaż barre F'.",
        schema: resolveShapeSchema,
      },
    ),

    // ── set_ai_mode (domain command) ───────────────────────────────
    tool(
      async (input: SetAiModeInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
        const command: DomainCommand = {
          type: "set-ai-mode",
          enabled: input.enabled,
        };
        ctx.emitCommand(command);
        return {
          action: "set-ai-mode",
          enabled: input.enabled,
        };
      },
      {
        name: "set_ai_mode",
        description: "Włącza lub wyłącza tryb AI. Gdy włączony, metronom chowa się a czat zajmuje stałą szerokość.",
        schema: setAiModeSchema,
      },
    ),

    // ── start_exercise (domain command) ────────────────────────────
    tool(
      async (input: StartExerciseInput) => {
        const blocked = ctx.lessonGuard?.checkCommand();
        if (blocked) return { error: blocked, action: "blocked" };
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
          action: "start-exercise",
          question: input.question,
          rootNote: input.rootNote,
          expectedIntervals: input.expectedIntervals,
        };
      },
      {
        name: "start_exercise",
        description: "Rozpoczyna ćwiczenie w trybie lekcji. Aktywuje klikalny tryb na gryfie — użytkownik może zaznaczać nuty. Gdy skończy, kliknie Sprawdź. Użyj gdy prowadzisz lekcję i chcesz zadać pytanie typu 'znajdź wszystkie kwinty względem A'.",
        schema: startExerciseSchema,
      },
    ),

    // ── get_exercise_result (query) ────────────────────────────────
    tool(
      async () => {
        const blocked = ctx.lessonGuard?.checkQuery();
        if (blocked) return { error: blocked, action: "blocked" };
        const state = ctx.domainState;
        const exerciseResult = state.lastExerciseResult;
        return {
          success: true,
          action: "get-exercise-result",
          exerciseMode: state.exerciseMode,
          exerciseTask: state.exerciseTask,
          selectedNotes: state.selectedNotes,
          lastExerciseResult: exerciseResult,
        };
      },
      {
        name: "get_exercise_result",
        description: "Pobiera wynik ostatniego ćwiczenia oraz aktualny stan trybu ćwiczeń. Użyj gdy chcesz sprawdzić co użytkownik zaznaczył lub jaki był wynik walidacji.",
        schema: z.object({}),
      },
    ),
  ];
}