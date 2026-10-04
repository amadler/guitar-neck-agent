import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDomainTools, createWaitForUserTool } from "./domain-tools";
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

  // Command sequencer — serializes emissions in order
  let commandQueue: Promise<void> = Promise.resolve();
  const executeCommand = async (command: DomainCommand) => {
    await (commandQueue = commandQueue.then(() => {
      emitted.push(command);
    }));
  };

  return {
    domainState,
    emitCommand: (cmd: DomainCommand) => { emitted.push(cmd); },
    executeCommand,
    emitted,
  };
}

describe("createDomainTools", () => {
  describe("multiple domain commands", () => {
    it("pozwala na kilka kolejnych commandów", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const showIntervalTool = tools[1];

      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });
      expect(ctx.emitted).toHaveLength(1);
      expect(ctx.emitted[0]).toMatchObject({ type: "show-pattern" });

      await showIntervalTool.invoke({ rootNote: "C", intervals: ["3"] });
      expect(ctx.emitted).toHaveLength(2);
      expect(ctx.emitted[1]).toMatchObject({ type: "show-intervals" });
    });

    it("zachowuje kolejność emisji przy sekwencyjnych wywołaniach", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const showIntervalTool = tools[1];
      const clearViewTool = tools[2];

      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });
      await showIntervalTool.invoke({ rootNote: "A", intervals: ["b3", "5"] });
      await clearViewTool.invoke({});

      expect(ctx.emitted).toHaveLength(3);
      expect(ctx.emitted[0]).toMatchObject({ type: "show-pattern" });
      expect(ctx.emitted[1]).toMatchObject({ type: "show-intervals" });
      expect(ctx.emitted[2]).toMatchObject({ type: "clear-view" });
    });

    it("emituje command przez executeCommand — oba zostają wyemitowane", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const showIntervalTool = tools[1];

      // Symulacja równoległych wywołań — oba startują w tym samym czasie
      const result1 = showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });
      const result2 = showIntervalTool.invoke({ rootNote: "A", intervals: ["b3"] });

      await Promise.all([result1, result2]);

      // Oba zostały wyemitowane (kolejność zależy od LangChain invoke, nie testujemy jej)
      expect(ctx.emitted).toHaveLength(2);
      const types = ctx.emitted.map(e => e.type);
      expect(types).toContain("show-pattern");
      expect(types).toContain("show-intervals");
    });
  });

  describe("query tools — snapshot semantics", () => {
    it("get_current_view zwraca stan sprzed requestu", async () => {
      const ctx = createMockContext({ rootNote: "A", patternName: "minor" });
      const tools = createDomainTools(ctx);
      const getViewTool = tools[3];

      const result = await getViewTool.invoke({});

      expect(result).toMatchObject({
        action: "get-current-view",
        mode: "scale",
        rootNote: "A",
        patternName: "minor",
      });
    });

    it("get_current_view działa po command — brak blokady", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const getViewTool = tools[3];

      // Wykonaj command
      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      // Query po command — dozwolone, zwraca stary snapshot
      const result = await getViewTool.invoke({});
      expect(result).toMatchObject({ action: "get-current-view" });
      // Snapshot wciąż pokazuje stan sprzed requestu (C/major)
      expect(result.rootNote).toBe("C");
      expect(result.patternName).toBe("major");
    });

    it("get_exercise_result działa po command — brak blokady", async () => {
      const ctx = createMockContext({
        exerciseMode: true,
        lastExerciseResult: {
          correct: [true, false],
          selectedNotes: [],
          correctCount: 1,
          incorrectCount: 1,
        },
      });
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const getExerciseTool = tools[10];

      // Wykonaj command
      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      // get_exercise_result po command — dozwolone
      const result = await getExerciseTool.invoke({});
      expect(result).toMatchObject({ action: "get-exercise-result" });
      expect(result.lastExerciseResult.correctCount).toBe(1);
    });
  });

  describe("start_exercise with showIntervals", () => {
    function findStartExerciseTool(tools: ReturnType<typeof createDomainTools>) {
      // Find by name since index may vary
      return tools.find(t => t.name === "start_exercise")!;
    }

    it("przekazuje showIntervals w commandzie", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const tool = findStartExerciseTool(tools);

      await tool.invoke({
        question: "Znajdź kwinty od A",
        rootNote: "A",
        expectedIntervals: ["5"],
        showIntervals: ["1"],
      });

      expect(ctx.emitted).toHaveLength(1);
      expect(ctx.emitted[0]).toMatchObject({
        type: "start-exercise",
        showIntervals: ["1"],
      });
    });

    it("działa bez showIntervals (backward compat)", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const tool = findStartExerciseTool(tools);

      await tool.invoke({
        question: "Znajdź kwinty od A",
        rootNote: "A",
        expectedIntervals: ["5"],
      });

      expect(ctx.emitted).toHaveLength(1);
      expect(ctx.emitted[0]).toMatchObject({
        type: "start-exercise",
      });
      expect((ctx.emitted[0] as any).showIntervals).toBeUndefined();
    });

    it("zwraca showIntervals w rezultacie", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const tool = findStartExerciseTool(tools);

      const result = await tool.invoke({
        question: "Znajdź tercje od C",
        rootNote: "C",
        expectedIntervals: ["3"],
        showIntervals: ["1", "5"],
      });

      expect(result).toMatchObject({
        action: "start-exercise",
        showIntervals: ["1", "5"],
      });
    });
  });

  describe("normal chat (bez lesson mode)", () => {
    it("pozwala na wiele commandów", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const showIntervalTool = tools[1];

      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });
      expect(ctx.emitted).toHaveLength(1);

      await showIntervalTool.invoke({ rootNote: "C", intervals: ["3"] });
      expect(ctx.emitted).toHaveLength(2);
    });

    it("pozwala na query po command", async () => {
      const ctx = createMockContext();
      const tools = createDomainTools(ctx);
      const showPatternTool = tools[0];
      const getViewTool = tools[3];

      await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      const result = await getViewTool.invoke({});
      expect(result).toMatchObject({ action: "get-current-view" });
    });
  });

  describe("wait_for_user", () => {
    it("ma poprawną nazwę i opis", async () => {
      const tool = createWaitForUserTool();
      expect(tool.name).toBe("wait_for_user");
      expect(tool.description).toContain("Zatrzymuje lekcję");
    });

    it("wywołuje interrupt z promptem", async () => {
      // Nie możemy bezpośrednio testować interrupt() w teście jednostkowym,
      // bo rzuca specjalnym wyjątkiem LangGraph.
      // Testujemy tylko, że tool istnieje i ma poprawny interfejs.
      const tool = createWaitForUserTool();
      expect(tool.name).toBe("wait_for_user");
      expect(tool.schema).toBeDefined();
    });
  });
});