/**
 * Shared types for the guitar-neck-agent.
 * Mirrors the DomainCommand/DomainState/DomainResult types from guitar-neck-ui.
 * These are runtime-compatible but independently maintained — no shared package.
 */

// ─── Emphasis ──────────────────────────────────────────────────────────

export interface EmphasisSpec {
  intervals?: string[];
  roles?: string[];
}

// ─── Commands ──────────────────────────────────────────────────────────

export interface ShowPatternCommand {
  type: 'show-pattern';
  patternType: 'scale' | 'chord';
  patternName: string;
  rootNote: string;
  fretRange?: { min: number; max: number };
  emphasis?: EmphasisSpec;
}

export interface ComparePatternsCommand {
  type: 'compare-patterns';
  primary: { patternType: 'scale' | 'chord'; patternName: string; rootNote: string };
  secondary: { patternType: 'scale' | 'chord'; patternName: string; rootNote: string };
}

export interface SetViewCommand {
  type: 'set-view';
  fretRange?: { min: number; max: number };
  enabledStrings?: boolean[];
  markerDisplayMode?: 'interval-colors' | 'note-names' | 'neutral-dots';
}

export interface SetEmphasisCommand {
  type: 'set-emphasis';
  emphasis: EmphasisSpec;
}

export interface ShowIntervalCommand {
  type: 'show-interval';
  rootNote: string;
  interval: string;
}

export interface ClearViewCommand {
  type: 'clear-view';
}

export interface ResolveShapeCommand {
  type: 'resolve-shape';
  shapeId: string;
  rootNote?: string;
}

export interface SetAiModeCommand {
  type: 'set-ai-mode';
  enabled: boolean;
}

export interface StartExerciseCommand {
  type: 'start-exercise';
  question: string;
  rootNote: string;
  expectedIntervals: string[];
  fretRange?: { min: number; max: number };
  enabledStrings?: boolean[];
}

export interface SubmitExerciseCommand {
  type: 'submit-exercise';
}

export interface SelectNoteCommand {
  type: 'select-note';
  note: string;
  string: number;
  fret: number;
}

export interface DeselectNoteCommand {
  type: 'deselect-note';
  string: number;
  fret: number;
}

export type DomainCommand =
  | ShowPatternCommand
  | ComparePatternsCommand
  | ShowIntervalCommand
  | SetViewCommand
  | SetEmphasisCommand
  | ClearViewCommand
  | ResolveShapeCommand
  | SetAiModeCommand
  | StartExerciseCommand
  | SubmitExerciseCommand
  | SelectNoteCommand
  | DeselectNoteCommand;

// ─── State ─────────────────────────────────────────────────────────────

export interface SelectedNotePosition {
  note: string;
  string: number;
  fret: number;
}

export interface ExerciseTask {
  question: string;
  rootNote: string;
  expectedIntervals: string[];
  fretRange?: { min: number; max: number };
  enabledStrings?: boolean[];
  expectedPositions?: Array<{ string: number; fret: number }>;
}

export interface ExerciseResult {
  correct: boolean[];
  selectedNotes: SelectedNotePosition[];
  correctCount: number;
  incorrectCount: number;
  missingCount?: number;
  missingPositions?: Array<{ string: number; fret: number }>;
}

export interface DomainState {
  mode: 'scale' | 'chord' | 'scale-chord' | 'custom' | 'positions';
  aiModeEnabled: boolean;
  displayMode: 'legend' | 'relationship' | null;
  rootNote: string;
  patternName: string;
  compareTarget?: { rootNote: string; patternName: string; patternType: 'scale' | 'chord' };
  fretRange: { min: number; max: number };
  enabledStrings: boolean[];
  emphasis?: EmphasisSpec;
  markerDisplayMode: 'interval-colors' | 'note-names' | 'neutral-dots';
  selectedNotes?: SelectedNotePosition[];
  shapeInfo?: { shapeId?: string; positions: Array<{ string: number; fret: number; label?: string }> };
  exerciseMode: boolean;
  exerciseTask?: ExerciseTask;
  lastExerciseResult?: ExerciseResult;
}

// ─── Result ────────────────────────────────────────────────────────────

export type DomainResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; message: string };

// ─── Chat API types ───────────────────────────────────────────────────

export interface ChatRequestBody {
  type: "message" | "resume";
  threadId: string;
  text: string;
  domainState: DomainState;
  lessonMode: boolean;
}

export type ChatResponseEvent =
  | { type: "token"; text: string }
  | { type: "domain-command"; command: DomainCommand }
  | { type: "interrupt"; waitingForUser: boolean }
  | { type: "error"; message: string }
  | { type: "done" };