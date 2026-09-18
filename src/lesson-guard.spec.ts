import { describe, it, expect, beforeEach } from "vitest";
import { LessonGuard } from "./lesson-guard";

describe("LessonGuard", () => {
  let guard: LessonGuard;

  beforeEach(() => {
    guard = new LessonGuard();
  });

  // ── Initial state ────────────────────────────────────────────────

  it("zaczyna z committed = false", () => {
    expect(guard.committed).toBe(false);
  });

  // ── Query before command ─────────────────────────────────────────

  it("pozwala na query przed command", () => {
    expect(() => guard.checkQuery()).not.toThrow();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  it("pozwala na wiele query przed command", () => {
    expect(() => guard.checkQuery()).not.toThrow();
    expect(() => guard.checkQuery()).not.toThrow();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  // ── Single command ───────────────────────────────────────────────

  it("pozwala na jeden command", () => {
    expect(() => guard.checkCommand()).not.toThrow();
    expect(guard.committed).toBe(true);
  });

  // ── Command → command (blokowane) ────────────────────────────────

  it("blokuje drugi command w tej samej rundzie", () => {
    guard.checkCommand();
    expect(() => guard.checkCommand()).toThrow(
      "W tej rundzie został już wykonany jedno narzędzie domenowe",
    );
  });

  // ── Command → query (blokowane) ──────────────────────────────────

  it("blokuje query po command", () => {
    guard.checkCommand();
    expect(() => guard.checkQuery()).toThrow(
      "Po narzędziu domenowym nie można już wykonywać zapytań w tej rundzie",
    );
  });

  // ── Reset ────────────────────────────────────────────────────────

  it("resetuje committed na false", () => {
    guard.checkCommand();
    expect(guard.committed).toBe(true);
    guard.reset();
    expect(guard.committed).toBe(false);
  });

  it("pozwala na command po resecie (symulacja nowej rundy)", () => {
    guard.checkCommand();
    guard.reset();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  it("pozwala na query po resecie", () => {
    guard.checkCommand();
    guard.reset();
    expect(() => guard.checkQuery()).not.toThrow();
  });

  // ── Pełny cykl rundy ─────────────────────────────────────────────

  it("działa poprawnie: query → command → reset → query → command", () => {
    // Runda 1
    guard.checkQuery();
    guard.checkCommand();
    expect(guard.committed).toBe(true);

    // Nowa runda
    guard.reset();
    expect(guard.committed).toBe(false);

    // Runda 2
    guard.checkQuery();
    expect(() => guard.checkCommand()).not.toThrow();
    expect(guard.committed).toBe(true);
  });

});