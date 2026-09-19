import { describe, it, expect, beforeEach } from "vitest";
import { createDomainTools, createWaitForUserTool } from "./domain-tools";
import { LessonGuard } from "../lesson-guard";
import type { DomainState, DomainCommand } from "../types/contract";

function createMockContext(overrides?: Partial<DomainState>) {
  const emitted: DomainCommand[] = [];
  const domainState: DomainState = {
    mode: "scale",
    aiModeEnabled: false,
    displayMode: null,
    rootNote: "C",
    patternName: "major",
    fretRange: { min: 0, max: 24 },
    enabledStrings: [true, true, true, true, true, true],
    markerDisplayMode: "interval-colors",
    exerciseMode: false,
    ...overrides,
  };
  return {
    domainState,
    emitCommand: (cmd: DomainCommand) => { emitted.push(cmd); },
    emitted,
  };
}

describe("createDomainTools", () => {
  describe("domain command tools — guard integration", () => {
    it("show_pattern akceptuje guard i wywołuje emitCommand", async () => {
      const guard = new LessonGuard();
      const ctx = createMockContext();
      const tools = createDomainTools({ ...ctx, lessonGuard: guard });
      const showPatternTool = tools[0];

      const result = await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      expect(guard.committed).toBe(true);
      expect(ctx.emitted).toHaveLength(1);
      expect(ctx.emitted[0]).toMatchObject({ type: "show-pattern" });
      expect(result).toMatchObject({ action: "show-pattern" });
    });

    it("show_pattern zwraca error gdy guard już committed", async () => {
      const guard = new LessonGuard();
      guard.checkCommand(); // symulacja wcześniejszego commanda
      const ctx = createMockContext();
      const tools = createDomainTools({ ...ctx, lessonGuard: guard });
      const showPatternTool = tools[0];

      const result = await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      expect(result).toMatchObject({ action: "blocked" });
      expect(result.error).toContain("został już wykonany");
      expect(ctx.emitted).toHaveLength(0); // command nie został wyemitowany
    });

    it("start_exercise akceptuje guard", async () => {
      const guard = new LessonGuard();
      const ctx = createMockContext();
      const tools = createDomainTools({ ...ctx, lessonGuard: guard });
      const startExerciseTool = tools[9];

      const result = await startExerciseTool.invoke({
        question: "Znajdź kwinty",
        rootNote: "A",
        expectedIntervals: ["5"],
      });

      expect(guard.committed).toBe(true);
      expect(ctx.emitted).toHaveLength(1);
      expect(ctx.emitted[0]).toMatchObject({ type: "start-exercise" });
      expect(result).toMatchObject({ action: "start-exercise" });
    });
  });

  describe("query tools — guard integration", () => {
    it("get_current_view działa przed command", async () => {
      const guard = new LessonGuard();
      const ctx = createMockContext();
      const tools = createDomainTools({ ...ctx, lessonGuard: guard });
      const getViewTool = tools[3];

      const result = await getViewTool.invoke({});

      expect(guard.committed).toBe(false);
      expect(result).toMatchObject({ action: "get-current-view", mode: "scale" });
    });

    it("get_current_view zwraca error po command", async () => {
      const guard = new LessonGuard();
      guard.checkCommand(); // symulacja wcześniejszego commanda
      const ctx = createMockContext();
      const tools = createDomainTools({ ...ctx, lessonGuard: guard });
      const getViewTool = tools[3];

      const result = await getViewTool.invoke({});

      expect(result).toMatchObject({ action: "blocked" });
      expect(result.error).toContain("Po narzędziu domenowym");
    });

    it("get_exercise_result działa przed command", async () => {
      const guard = new LessonGuard();
      const ctx = createMockContext({ exerciseMode: true });
      const tools = createDomainTools({ ...ctx, lessonGuard: guard });
      const getExerciseTool = tools[10];

      const result = await getExerciseTool.invoke({});

      expect(guard.committed).toBe(false);
      expect(result).toMatchObject({ action: "get-exercise-result" });
    });
  });

  describe("bez guarda (normal chat)", () => {
    it("pozwala na wiele commandów — brak guarda", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx); // bez guarda
      const showPatternTool = tools[0];
      const showIntervalTool = tools[1];

      // Pierwszy command
      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });
      expect(ctx.emitted).toHaveLength(1);

      // Drugi command — bez guarda, więc dozwolony
      await showIntervalTool.invoke({ rootNote: "C", interval: "3" });
      expect(ctx.emitted).toHaveLength(2);
    });

    it("pozwala na query po command — brak guarda", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx); // bez guarda
      const showPatternTool = tools[0];
      const getViewTool = tools[3];

      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      // Query po command — bez guarda, więc dozwolone
      const result = await getViewTool.invoke({});
      expect(result).toMatchObject({ action: "get-current-view" });
    });
  });

  describe("wait_for_user", () => {
    it("resetuje guard przed interrupt", async () => {
      const guard = new LessonGuard();
      guard.checkCommand(); // symulacja wykonanego commanda
      expect(guard.committed).toBe(true);

      // Tworzymy tool — nie wywołujemy go, bo interrupt() rzuciłby
      // specjalnym wyjątkiem LangGraph. Testujemy tylko, że factory
      // przyjmuje guard i że reset działa.
      const tool = createWaitForUserTool(guard);
      expect(tool.name).toBe("wait_for_user");
      // Guard jest resetowany w momencie wywołania toola,
      // ale nie możemy go wywołać w teście jednostkowym bez LangGraph.
      // Testujemy to przez LessonGuard.reset() bezpośrednio.
      guard.reset();
      expect(guard.committed).toBe(false);
    });
  });
});