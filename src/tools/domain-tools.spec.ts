import { createDomainTools } from "./domain-tools";
import { DomainService } from "../../domain/domain.service";
import { DomainQuery } from '../../domain/queries';

describe("createDomainTools", () => {
  let mockDomainService: { execute: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
  let tools: any[];

  beforeEach(() => {
    mockDomainService = {
      execute: vi.fn().mockReturnValue({ success: true, action: "test", message: "ok" }),
      query: vi.fn().mockReturnValue({ success: true, data: {} }),
    };
    tools = createDomainTools(mockDomainService as unknown as DomainService);
  });

  describe("show_pattern tool", () => {
    it("should call DomainService.execute() with show-pattern command", async () => {
      const showPatternTool = tools[0];

      const result = await showPatternTool.invoke({
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
      });

      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "show-pattern",
        patternType: "scale",
        patternName: "major",
        rootNote: "C",
        fretRange: undefined,
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
      const showPatternTool = tools[0];

      await showPatternTool.invoke({
        patternType: "chord",
        patternName: "major",
        rootNote: "C",
        fretRange: { min: 0, max: 5 },
      });

      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "show-pattern",
        patternType: "chord",
        patternName: "major",
        rootNote: "C",
        fretRange: { min: 0, max: 5 },
      });
    });
  });

  describe("show_interval tool", () => {
    it("should call DomainService.execute() with show-interval command", async () => {
      const showIntervalTool = tools[1];

      const result = await showIntervalTool.invoke({
        rootNote: "C",
        interval: "3",
      });

      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "show-interval",
        rootNote: "C",
        interval: "3",
      });
      expect(result).toMatchObject({
        success: true,
        action: "show-interval",
        rootNote: "C",
        interval: "3",
      });
    });
  });

  describe("clear_view tool", () => {
    it("should call DomainService.execute() with clear-view command", async () => {
      const clearViewTool = tools[2];

      const result = await clearViewTool.invoke({});

      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "clear-view",
      });
      expect(result).toMatchObject({
        success: true,
        action: "clear-view",
      });
    });
  });

  describe("get_current_view tool", () => {
    it("should call DomainService.query() with get-current-view query", async () => {
      const mockState = {
        mode: 'scale', rootNote: 'C', patternName: 'major',
        fretRange: { min: 0, max: 24 },
        enabledStrings: [true, true, true, true, true, true],
        markerDisplayMode: 'interval-colors',
      };
      mockDomainService.query = vi.fn().mockReturnValue({ success: true, data: mockState });
      const getCurrentViewTool = tools[3];
      const result = await getCurrentViewTool.invoke({});
      expect(mockDomainService.query).toHaveBeenCalledWith({ type: 'get-current-view' });
      expect(result).toMatchObject({ success: true, action: 'get-current-view', mode: 'scale' });
    });

    it("should handle query failure gracefully", async () => {
      mockDomainService.query = vi.fn().mockReturnValue({
        success: false, error: 'UNKNOWN_COMMAND', message: 'Unknown query type',
      });
      const getCurrentViewTool = tools[3];
      const result = await getCurrentViewTool.invoke({});
      expect(result).toMatchObject({ success: false, action: 'get-current-view' });
    });
  });

  describe("compare_patterns tool", () => {
    it("should call DomainService.execute() with compare-patterns command", async () => {
      const tool = tools[4];
      const result = await tool.invoke({
        primary: { patternType: "scale", patternName: "major", rootNote: "C" },
        secondary: { patternType: "chord", patternName: "major", rootNote: "Am" },
      });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "compare-patterns",
        primary: { patternType: "scale", patternName: "major", rootNote: "C" },
        secondary: { patternType: "chord", patternName: "major", rootNote: "Am" },
      });
      expect(result).toMatchObject({
        success: true,
        action: "compare-patterns",
        primary: { patternType: "scale", patternName: "major", rootNote: "C" },
      });
    });
  });

  describe("set_view tool", () => {
    it("should call DomainService.execute() with set-view command", async () => {
      const tool = tools[5];
      const result = await tool.invoke({
        fretRange: { min: 0, max: 5 },
        markerDisplayMode: "note-names",
      });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "set-view",
        fretRange: { min: 0, max: 5 },
        enabledStrings: undefined,
        markerDisplayMode: "note-names",
      });
      expect(result).toMatchObject({ success: true, action: "set-view" });
    });
  });

  describe("set_emphasis tool", () => {
    it("should call DomainService.execute() with set-emphasis command", async () => {
      const tool = tools[6];
      const result = await tool.invoke({
        emphasis: { intervals: ["1", "3", "5"] },
      });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "set-emphasis",
        emphasis: { intervals: ["1", "3", "5"] },
      });
      expect(result).toMatchObject({ success: true, action: "set-emphasis" });
    });
  });

  describe("resolve_shape tool", () => {
    it("should call DomainService.execute() with resolve-shape command", async () => {
      const tool = tools[7];
      const result = await tool.invoke({
        shapeId: "cowboy-C",
      });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "resolve-shape",
        shapeId: "cowboy-C",
        rootNote: undefined,
      });
      expect(result).toMatchObject({ success: true, action: "resolve-shape", shapeId: "cowboy-C" });
    });

    it("should include rootNote when provided", async () => {
      const tool = tools[7];
      await tool.invoke({
        shapeId: "barre-E-form",
        rootNote: "F",
      });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "resolve-shape",
        shapeId: "barre-E-form",
        rootNote: "F",
      });
    });
  });

  describe("set_ai_mode tool", () => {
    it("should call DomainService.execute() with set-ai-mode command (enabled)", async () => {
      const tool = tools[8];
      const result = await tool.invoke({ enabled: true });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "set-ai-mode",
        enabled: true,
      });
      expect(result).toMatchObject({ success: true, action: "set-ai-mode", enabled: true });
    });

    it("should call DomainService.execute() with set-ai-mode command (disabled)", async () => {
      const tool = tools[8];
      const result = await tool.invoke({ enabled: false });
      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "set-ai-mode",
        enabled: false,
      });
      expect(result).toMatchObject({ success: true, action: "set-ai-mode", enabled: false });
    });
  });

  describe("start_exercise tool", () => {
    it("should call DomainService.execute() with start-exercise command", async () => {
      const tool = tools[9];
      mockDomainService.query = vi.fn().mockReturnValue({
        success: true,
        data: { exerciseMode: false },
      });

      const result = await tool.invoke({
        question: "Znajdź wszystkie kwinty względem A",
        rootNote: "A",
        expectedIntervals: ["5"],
      });

      expect(mockDomainService.execute).toHaveBeenCalledWith({
        type: "start-exercise",
        question: "Znajdź wszystkie kwinty względem A",
        rootNote: "A",
        expectedIntervals: ["5"],
        fretRange: undefined,
        enabledStrings: undefined,
      });
      expect(result).toMatchObject({
        success: true,
        action: "start-exercise",
        question: "Znajdź wszystkie kwinty względem A",
      });
    });
  });

  describe("submit_exercise tool", () => {
    it("should call DomainService.execute() with submit-exercise command", async () => {
      const tool = tools[10];
      mockDomainService.execute = vi.fn().mockReturnValue({ success: true });
      mockDomainService.query = vi.fn().mockReturnValue({
        success: true,
        data: {
          lastExerciseResult: {
            correct: [true],
            selectedNotes: [{ note: 'C', string: 1, fret: 0 }],
            correctCount: 1,
            incorrectCount: 0,
          },
        },
      });

      const result = await tool.invoke({});

      expect(mockDomainService.execute).toHaveBeenCalledWith({ type: "submit-exercise" });
      expect(result).toMatchObject({
        success: true,
        action: "submit-exercise",
      });
    });
  });

  describe("get_exercise_result tool", () => {
    it("should return exercise state from DomainService", async () => {
      const tool = tools[11];
      const exerciseState = {
        exerciseMode: false,
        exerciseTask: undefined,
        selectedNotes: [],
        lastExerciseResult: {
          correct: [true],
          selectedNotes: [{ note: 'C', string: 1, fret: 0 }],
          correctCount: 1,
          incorrectCount: 0,
        },
      };
      mockDomainService.query = vi.fn().mockReturnValue({
        success: true,
        data: exerciseState,
      });

      const result = await tool.invoke({});

      expect(result).toMatchObject({
        success: true,
        action: "get-exercise-result",
        exerciseMode: false,
      });
    });
  });
});