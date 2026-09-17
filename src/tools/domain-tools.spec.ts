import { describe, it, expect, vi } from "vitest";
import { createAgentTools, type ToolContext } from "./domain-tools.js";
import type { DomainState } from "../types/contract.js";

const DEFAULT_STATE: DomainState = {
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

function createContext(overrides?: Partial<DomainState>): ToolContext {
  const commands: any[] = [];
  return {
    domainState: { ...DEFAULT_STATE, ...overrides },
    emitCommand: (cmd) => { commands.push(cmd); },
  };
}

describe("createAgentTools", () => {
  describe("show_pattern tool", () => {
    it("should emit show-pattern DomainCommand and return success", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[0];

      const result = await tool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "show-pattern",
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
        fretRange: undefined,
        emphasis: undefined,
      });
      expect(result).toMatchObject({
        success: true,
        action: "show-pattern",
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });
    });

    it("should include fretRange when provided", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[0];

      await tool.invoke({
        patternType: "chord",
        patternName: "major",
        rootNote: "C",
        fretRange: { min: 0, max: 5 },
      });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "show-pattern",
        patternType: "chord",
        patternName: "major",
        rootNote: "C",
        fretRange: { min: 0, max: 5 },
        emphasis: undefined,
      });
    });
  });

  describe("show_interval tool", () => {
    it("should emit show-interval DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[1];

      const result = await tool.invoke({ rootNote: "C", interval: "3" });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "show-interval",
        rootNote: "C",
        interval: "3",
      });
      expect(result).toMatchObject({ success: true, action: "show-interval" });
    });
  });

  describe("clear_view tool", () => {
    it("should emit clear-view DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[2];

      const result = await tool.invoke({});

      expect(ctx.emitCommand).toHaveBeenCalledWith({ type: "clear-view" });
      expect(result).toMatchObject({ success: true, action: "clear-view" });
    });
  });

  describe("get_current_view tool", () => {
    it("should read from DomainState snapshot", async () => {
      const ctx = createContext({ mode: "chord", rootNote: "A", patternName: "minor" });
      const tools = createAgentTools(ctx);
      const tool = tools[3];

      const result = await tool.invoke({});

      expect(result).toMatchObject({
        success: true,
        action: "get-current-view",
        mode: "chord",
        rootNote: "A",
        patternName: "minor",
      });
    });
  });

  describe("compare_patterns tool", () => {
    it("should emit compare-patterns DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[4];

      const result = await tool.invoke({
        primary: { patternType: "scale", patternName: "major", rootNote: "C" },
        secondary: { patternType: "chord", patternName: "major", rootNote: "Am" },
      });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "compare-patterns",
        primary: { patternType: "scale", patternName: "major", rootNote: "C" },
        secondary: { patternType: "chord", patternName: "major", rootNote: "Am" },
      });
      expect(result).toMatchObject({ success: true, action: "compare-patterns" });
    });
  });

  describe("set_view tool", () => {
    it("should emit set-view DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[5];

      const result = await tool.invoke({
        fretRange: { min: 0, max: 5 },
        markerDisplayMode: "note-names",
      });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "set-view",
        fretRange: { min: 0, max: 5 },
        enabledStrings: undefined,
        markerDisplayMode: "note-names",
      });
      expect(result).toMatchObject({ success: true, action: "set-view" });
    });
  });

  describe("set_emphasis tool", () => {
    it("should emit set-emphasis DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[6];

      const result = await tool.invoke({
        emphasis: { intervals: ["1", "3", "5"] },
      });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "set-emphasis",
        emphasis: { intervals: ["1", "3", "5"] },
      });
      expect(result).toMatchObject({ success: true, action: "set-emphasis" });
    });
  });

  describe("resolve_shape tool", () => {
    it("should emit resolve-shape DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[7];

      const result = await tool.invoke({ shapeId: "cowboy-C" });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "resolve-shape",
        shapeId: "cowboy-C",
        rootNote: undefined,
      });
      expect(result).toMatchObject({ success: true, action: "resolve-shape", shapeId: "cowboy-C" });
    });
  });

  describe("set_ai_mode tool", () => {
    it("should emit set-ai-mode DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[8];

      const result = await tool.invoke({ enabled: true });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "set-ai-mode",
        enabled: true,
      });
      expect(result).toMatchObject({ success: true, action: "set-ai-mode", enabled: true });
    });
  });

  describe("start_exercise tool", () => {
    it("should emit start-exercise DomainCommand", async () => {
      const ctx = createContext();
      const tools = createAgentTools(ctx);
      const tool = tools[9];

      const result = await tool.invoke({
        question: "Znajdź wszystkie kwinty względem A",
        rootNote: "A",
        expectedIntervals: ["5"],
      });

      expect(ctx.emitCommand).toHaveBeenCalledWith({
        type: "start-exercise",
        question: "Znajdź wszystkie kwinty względem A",
        rootNote: "A",
        expectedIntervals: ["5"],
        fretRange: undefined,
        enabledStrings: undefined,
      });
      expect(result).toMatchObject({ success: true, action: "start-exercise" });
    });
  });

  describe("submit_exercise tool", () => {
    it("should read exercise result from DomainState snapshot", async () => {
      const exerciseResult = {
        correct: [true],
        selectedNotes: [{ note: 'C', string: 1, fret: 0 }],
        correctCount: 1,
        incorrectCount: 0,
      };
      const ctx = createContext({ lastExerciseResult: exerciseResult } as any);
      const tools = createAgentTools(ctx);
      const tool = tools[10];

      const result = await tool.invoke({});

      expect(result).toMatchObject({
        success: true,
        action: "submit-exercise",
        exerciseResult,
      });
    });
  });

  describe("get_exercise_result tool", () => {
    it("should return exercise state from DomainState snapshot", async () => {
      const ctx = createContext({ exerciseMode: false } as any);
      const tools = createAgentTools(ctx);
      const tool = tools[11];

      const result = await tool.invoke({});

      expect(result).toMatchObject({
        success: true,
        action: "get-exercise-result",
        exerciseMode: false,
      });
    });
  });
});