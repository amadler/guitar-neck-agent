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

  it("pozwala na query przed command — zwraca null", () => {
    expect(guard.checkQuery()).toBeNull();
    expect(guard.checkCommand()).toBeNull();
  });

  it("pozwala na wiele query przed command", () => {
    expect(guard.checkQuery()).toBeNull();
    expect(guard.checkQuery()).toBeNull();
    expect(guard.checkCommand()).toBeNull();
  });

  // ── Single command ───────────────────────────────────────────────

  it("pozwala na jeden command — zwraca null i ustawia committed", () => {
    expect(guard.checkCommand()).toBeNull();
    expect(guard.committed).toBe(true);
  });

  // ── Command → command (blokowane) ────────────────────────────────

  it("blokuje drugi command w tej samej rundzie — zwraca string", () => {
    guard.checkCommand();
    const result = guard.checkCommand();
    expect(result).toBe(
      "W tej rundzie został już wykonany jedno narzędzie domenowe. " +
      "Nie można wykonać kolejnego. Użyj wait_for_user, aby zakończyć rundę.",
    );
  });

  // ── Command → query (blokowane) ──────────────────────────────────

  it("blokuje query po command — zwraca string", () => {
    guard.checkCommand();
    const result = guard.checkQuery();
    expect(result).toBe(
      "Po narzędziu domenowym nie można już wykonywać zapytań w tej rundzie. " +
      "Stan widoku został zmieniony. Użyj wait_for_user, aby zakończyć rundę.",
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
    expect(guard.checkCommand()).toBeNull();
  });

  it("pozwala na query po resecie", () => {
    guard.checkCommand();
    guard.reset();
    expect(guard.checkQuery()).toBeNull();
  });

  // ── Pełny cykl rundy ─────────────────────────────────────────────

  it("działa poprawnie: query → command → reset → query → command", () => {
    // Runda 1
    expect(guard.checkQuery()).toBeNull();
    expect(guard.checkCommand()).toBeNull();
    expect(guard.committed).toBe(true);

    // Nowa runda
    guard.reset();
    expect(guard.committed).toBe(false);

    // Runda 2
    expect(guard.checkQuery()).toBeNull();
    expect(guard.checkCommand()).toBeNull();
    expect(guard.committed).toBe(true);
  });
});